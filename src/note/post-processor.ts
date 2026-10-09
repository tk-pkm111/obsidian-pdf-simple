import {
	Component,
	Keymap,
	MarkdownView,
	debounce,
	setTooltip,
	type MarkdownPostProcessor,
	type WorkspaceLeaf,
} from 'obsidian';
import { t } from '../i18n';
import { findBlockId } from '../lib/highlight-entry';
import { paletteHex } from '../lib/settings';
import type PdfSimplePlugin from '../main';

/**
 * 閲覧モードの装飾。`テキスト ^hl-…` の段落・見出し・箇条書きの末尾に小さな点（PDF と同じ色）を付ける。
 * 文には何もしない（色も付けず、押しても移動しない）。PDF の該当箇所へ移るのは点を押したときだけ。
 */

function leafOf(
	plugin: PdfSimplePlugin,
	el: HTMLElement,
): WorkspaceLeaf | null {
	let found: WorkspaceLeaf | null = null;
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		if (
			!found &&
			leaf.view instanceof MarkdownView &&
			leaf.view.containerEl.contains(el)
		)
			found = leaf;
	});
	return found;
}

function decorate(
	plugin: PdfSimplePlugin,
	host: HTMLElement,
	id: string,
): void {
	const entry = plugin.highlights.index.entry(id);
	if (!entry || host.hasClass('pdf-simple-hl-block')) return;
	const color = paletteHex(plugin.settings, entry.color);
	host.addClass('pdf-simple-hl-block');
	host.setCssProps({ '--pdf-simple-hl': color });
	const open = (evt: MouseEvent): void => {
		evt.preventDefault();
		void plugin.actions.openInPdf(id, {
			sourceLeaf: leafOf(plugin, host),
			newLeaf: Keymap.isModEvent(evt),
		});
	};
	const dot = createSpan({
		cls: 'pdf-simple-dot',
		attr: { 'data-pdf-simple-id': id },
	});
	dot.setCssProps({ '--pdf-simple-hl': color });
	setTooltip(dot, t('tooltip.openInPdf', { page: entry.page }));
	dot.addEventListener('click', open);
	// 第 1 弾の行（==…==）は、ハイライトの部分の直後に点を置く
	const marks = Array.from(host.querySelectorAll('mark')).filter(
		(mark) => host.tagName !== 'LI' || mark.closest('li') === host,
	);
	const last = marks[marks.length - 1];
	if (last) last.after(dot);
	else host.appendChild(dot);
}

/** 行（セクションの先頭からの相対行）に当たる要素: 箇条書きの項目 → 見出し → 段落 */
function hostFor(
	el: HTMLElement,
	relative: number,
	single: boolean,
): HTMLElement | null {
	const items = Array.from(el.querySelectorAll<HTMLElement>('li[data-line]'));
	const item = items.find(
		(li) => li.getAttribute('data-line') === String(relative),
	);
	if (item) return item;
	if (items.length > 0 || !single) return null;
	return (
		el.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6') ??
		el.querySelector<HTMLElement>('p') ??
		el
	);
}

export function createReadingViewProcessor(
	plugin: PdfSimplePlugin,
): MarkdownPostProcessor {
	let cachedText: string | null = null;
	let cachedLines: string[] = [];
	return (el, ctx) => {
		const info = ctx.getSectionInfo(el);
		if (!info) return;
		if (info.text !== cachedText) {
			cachedText = info.text;
			cachedLines = info.text.split('\n');
		}
		const found: Array<{ line: number; id: string }> = [];
		for (let line = info.lineStart; line <= info.lineEnd; line++) {
			const match = findBlockId(cachedLines[line] ?? '');
			if (match && plugin.highlights.index.entry(match.id))
				found.push({ line, id: match.id });
		}
		if (found.length === 0) return;
		for (const { line, id } of found) {
			const host = hostFor(el, line - info.lineStart, found.length === 1);
			if (host) decorate(plugin, host, id);
		}
	};
}

/** 索引が変わったら、閲覧モードで開いているノートを描き直す（色の変更・起動直後の読み込み） */
export class ReadingViewRefresher extends Component {
	private readonly rerender = debounce(
		() => {
			this.plugin.app.workspace.iterateAllLeaves((leaf) => {
				const view = leaf.view;
				if (
					view instanceof MarkdownView &&
					view.getMode() === 'preview'
				)
					view.previewMode.rerender(true);
			});
		},
		400,
		true,
	);

	constructor(private readonly plugin: PdfSimplePlugin) {
		super();
	}

	onload(): void {
		this.register(this.plugin.highlights.onChange(() => this.rerender()));
		this.register(() => this.rerender.cancel());
	}
}
