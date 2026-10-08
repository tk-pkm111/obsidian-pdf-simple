import {
	FileView,
	MarkdownView,
	Notice,
	type PaneType,
	type View,
	type WorkspaceLeaf,
} from 'obsidian';
import { t } from '../i18n';
import { findHighlightLines } from '../lib/note-lines';
import { formatPdfSubpath } from '../lib/pdf-subpath';
import { anchorKey } from '../lib/pdf-selection';
import type { BlockRef, HighlightEntry } from '../lib/types';
import type PdfToolsPlugin from '../main';
import { isPdfView } from '../viewer/dom';

/** どこで開くか。newLeaf は Keymap.isModEvent の結果（false なら設定どおり） */
export interface OpenOptions {
	sourceLeaf: WorkspaceLeaf | null;
	newLeaf: PaneType | boolean;
}

/**
 * 表（ノート）と裏（PDF）の間の移動。
 * 移動先の位置は本体のエフェメラル状態 `{ subpath }` で渡す（PDF は `#page=…`、ノートは `#^hl-…`）。
 * このキーは型定義に無いので、この 2 つの関数に閉じ込め、ノート側は Editor で位置を確かめ直す。
 */

/**
 * そのファイルを開いているタブ（exclude は除く）。
 * 「同じタブで入れ替える」設定では、画面に見えているタブ（左右に並べているときなど）だけを使い、
 * 裏に隠れているタブへは飛ばない（その場で裏返すほうが自然なので）。
 */
export function leafShowing(
	plugin: PdfToolsPlugin,
	path: string,
	accept: (view: View) => boolean,
	exclude: WorkspaceLeaf | null,
): WorkspaceLeaf | null {
	const visibleOnly = plugin.settings.flipMode === 'same-leaf';
	let found: WorkspaceLeaf | null = null;
	plugin.app.workspace.iterateAllLeaves((leaf) => {
		const view = leaf.view;
		if (found || leaf === exclude) return;
		if (visibleOnly && !view.containerEl.isShown()) return;
		if (
			view instanceof FileView &&
			view.file?.path === path &&
			accept(view)
		)
			found = leaf;
	});
	return found;
}

/** 開く先のタブ: Cmd / Ctrl 付きなら新しいタブ、設定が「分割」なら横に分割、それ以外は同じタブ */
export function targetLeaf(
	plugin: PdfToolsPlugin,
	options: OpenOptions,
): WorkspaceLeaf {
	const { workspace } = plugin.app;
	if (options.newLeaf) return workspace.getLeaf(options.newLeaf);
	if (plugin.settings.flipMode === 'split' && options.sourceLeaf)
		return workspace.createLeafBySplit(options.sourceLeaf, 'vertical');
	return options.sourceLeaf ?? workspace.getLeaf(false);
}

/** ノート → PDF の該当箇所 */
export async function revealInPdf(
	plugin: PdfToolsPlugin,
	entry: Pick<HighlightEntry, 'pdfPath' | 'page' | 'anchor'>,
	options: OpenOptions,
): Promise<void> {
	const { vault, workspace } = plugin.app;
	const pdf = vault.getFileByPath(entry.pdfPath);
	if (!pdf) {
		new Notice(t('notice.pdfNotFound', { path: entry.pdfPath }));
		return;
	}
	// selection= まで渡すと本体の一時ハイライトが残って色が混ざるので、ページだけを渡す。
	// 該当箇所へのスクロールと点滅は重ね描き（ViewOverlay.flash）が行う
	const subpath = formatPdfSubpath({ page: entry.page });
	const key = anchorKey(entry.page, entry.anchor);
	if (!options.newLeaf) {
		const existing = leafShowing(
			plugin,
			pdf.path,
			isPdfView,
			options.sourceLeaf,
		);
		if (existing) {
			await workspace.revealLeaf(existing);
			existing.view.setEphemeralState({ subpath });
			plugin.viewer.flash(existing, key);
			return;
		}
	}
	const leaf = targetLeaf(plugin, options);
	const source = options.sourceLeaf?.view;
	if (leaf === options.sourceLeaf && source instanceof MarkdownView)
		plugin.flip.rememberNote(leaf, source);
	plugin.viewer.flash(leaf, key);
	await leaf.openFile(pdf, { active: true, eState: { subpath } });
	plugin.viewer.scan();
}

/** PDF → ノートの該当行 */
export async function revealBlock(
	plugin: PdfToolsPlugin,
	block: BlockRef,
	options: OpenOptions,
): Promise<void> {
	const { vault, workspace } = plugin.app;
	const note = vault.getFileByPath(block.notePath);
	if (!note) {
		new Notice(t('notice.noteNotFound', { path: block.notePath }));
		return;
	}
	const subpath = `#^${block.id}`;
	if (!options.newLeaf) {
		const existing = leafShowing(
			plugin,
			note.path,
			(view) => view instanceof MarkdownView,
			options.sourceLeaf,
		);
		if (existing) {
			await workspace.revealLeaf(existing);
			existing.view.setEphemeralState({ subpath });
			ensureLineVisible(existing, block.id);
			return;
		}
	}
	const leaf = targetLeaf(plugin, options);
	const source = options.sourceLeaf?.view;
	if (leaf === options.sourceLeaf && source && isPdfView(source))
		plugin.flip.rememberPdf(leaf, source);
	await leaf.openFile(note, { active: true, eState: { subpath } });
	ensureLineVisible(leaf, block.id);
}

/** ソースモードで該当行にカーソルが来ていなければ、Editor で移す（エフェメラル状態が効かなかったとき用） */
function ensureLineVisible(leaf: WorkspaceLeaf, id: string): void {
	window.setTimeout(() => {
		const view = leaf.view;
		if (!(view instanceof MarkdownView) || view.getMode() !== 'source')
			return;
		const editor = view.editor;
		const lines = findHighlightLines(editor.getValue(), id);
		const line = lines[0];
		if (line === undefined || lines.includes(editor.getCursor().line))
			return;
		editor.setCursor({ line, ch: 0 });
		editor.scrollIntoView(
			{ from: { line, ch: 0 }, to: { line, ch: 0 } },
			true,
		);
	}, 200);
}
