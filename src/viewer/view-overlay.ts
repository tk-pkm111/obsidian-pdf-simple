import { Component, debounce, type FileView } from 'obsidian';
import type { Box } from '../lib/geometry';
import { paletteHex } from '../lib/settings';
import type { Highlight } from '../lib/types';
import type PdfToolsPlugin from '../main';
import {
	LAYER_CLASS,
	closestPage,
	createHighlightLayer,
	currentPageNumber,
	findPage,
	findPages,
	highlightLayerOf,
	pageNumberOf,
	pagesTouchedBy,
	textLayerOf,
	viewerElement,
} from './dom';
import { hitTest } from './hit-test';
import { OverlayInput, type OverlayHost } from './overlay-input';
import {
	measureBoxes,
	paintLayer,
	planHighlight,
	type Drawn,
	type Planned,
} from './paint';
import { RegionCapture } from './region-capture';
import { textInLayer } from './text-range';
import { PdfToolbar } from './toolbar';
import { ViewTools } from './tools';

const FLASH_MS = 1600;
const MAX_RETRIES = 8;

/**
 * 1 つの PDF ビューに重ねるハイライト。
 * 本体のビューアがページやテキスト層を描く（遅延描画・ズーム）たびに MutationObserver で気づき、そのページだけ描き直す。
 * 矩形は回転前のテキスト層に対する割合でキャッシュするので、ズーム・回転しても測り直さない。
 * マウス操作は OverlayInput、計測と描画は paint.ts、当たり判定は hit-test.ts。
 * ビューごとの道具（見出しの予約・範囲の取り込み）と、そのボタン（PdfToolbar）・取り込みの操作（RegionCapture）も持つ。
 */
export class ViewOverlay extends Component implements OverlayHost {
	readonly tools = new ViewTools();
	private toolbar: PdfToolbar | null = null;
	private observer: MutationObserver | null = null;
	private active = false;
	private filePath: string | null = null;
	private readonly dirty = new Set<HTMLElement>();
	private readonly drawn = new Map<HTMLElement, Drawn[]>();
	private readonly boxes = new Map<string, Box[]>();
	private readonly retries = new WeakMap<HTMLElement, number>();
	private readonly removedByUs = new WeakSet<Node>();
	private retryTimer: number | null = null;
	private flashRequest: { key: string; until: number } | null = null;
	private flashing: { key: string; until: number } | null = null;
	private readonly flush = debounce(() => this.drawDirty(), 60);

	constructor(
		private readonly plugin: PdfToolsPlugin,
		readonly view: FileView,
	) {
		super();
	}

	onload(): void {
		this.active = true;
		const root = this.view.contentEl;
		this.filePath = this.view.file?.path ?? null;
		this.observer = new MutationObserver((records) =>
			this.onMutations(records),
		);
		this.observer.observe(root, { childList: true, subtree: true });
		this.addChild(new OverlayInput(this.plugin, this));
		this.addChild(new RegionCapture(this.plugin, this));
		this.toolbar = this.addChild(new PdfToolbar(this.plugin, this));
		this.register(
			this.plugin.highlights.onChange((paths) => {
				if (
					paths === null ||
					(this.filePath !== null && paths.has(this.filePath))
				)
					this.markAll();
			}),
		);
		this.registerEvent(
			this.plugin.app.vault.on('modify', (file) => {
				if (file.path !== this.filePath) return;
				this.boxes.clear();
				this.markAll();
			}),
		);
		// 本体のビューアの形が想定と違えば、一度だけ知らせる
		const check = window.setTimeout(() => {
			if (this.active && this.view.file && !viewerElement(root))
				this.plugin.viewer.warnUnavailable();
		}, 8000);
		this.register(() => window.clearTimeout(check));
		this.markAll();
	}

	onunload(): void {
		this.active = false;
		this.observer?.disconnect();
		this.observer = null;
		this.flush.cancel();
		if (this.retryTimer !== null) window.clearTimeout(this.retryTimer);
		for (const layer of Array.from(
			this.view.contentEl.querySelectorAll(`.${LAYER_CLASS}`),
		))
			layer.remove();
		this.drawn.clear();
	}

	isActive(): boolean {
		return this.active;
	}

	currentFilePath(): string | null {
		return this.filePath;
	}

	/** 表示しているファイルが変わっていれば描き直す。ツールバーのボタンが消えていれば足し直す */
	refresh(): void {
		if ((this.view.file?.path ?? null) !== this.filePath) this.markAll();
		this.toolbar?.ensure();
	}

	/** 設定（色・塗り方）が変わったとき */
	refreshToolbar(): void {
		this.toolbar?.refresh();
	}

	/** ハイライトまでスクロールして短く点滅させる（まだ描かれていなければ、描かれたときに） */
	flash(key: string): void {
		this.flashRequest = { key, until: Date.now() + 8000 };
		this.markAll();
	}

	currentPage(): number | null {
		return currentPageNumber(this.view.contentEl);
	}

	textOf(highlight: Highlight): string | null {
		const { anchor } = highlight;
		if (anchor.type !== 'text') return null;
		const page = findPage(this.view.contentEl, highlight.page);
		const textLayer = page ? textLayerOf(page) : null;
		return textLayer ? textInLayer(textLayer, anchor.selection) : null;
	}

	/** その位置のハイライト */
	hitAt(evt: MouseEvent): Drawn | null {
		const page = closestPage(evt.targetNode);
		const items = page ? this.drawn.get(page) : undefined;
		return items ? hitTest(items, evt.clientX, evt.clientY) : null;
	}

	private markAll(): void {
		for (const page of findPages(this.view.contentEl)) this.dirty.add(page);
		this.flush();
	}

	private onMutations(records: MutationRecord[]): void {
		if (!this.active) return;
		for (const page of pagesTouchedBy(records, this.removedByUs))
			this.dirty.add(page);
		if (this.dirty.size > 0) this.flush();
	}

	/** 同じビューで別の PDF を開いたら、描いたもの・キャッシュ・道具の予約を捨てる */
	private syncFile(): void {
		const path = this.view.file?.path ?? null;
		if (path === this.filePath) return;
		this.filePath = path;
		this.tools.disarm();
		this.boxes.clear();
		this.drawn.clear();
		for (const layer of Array.from(
			this.view.contentEl.querySelectorAll(`.${LAYER_CLASS}`),
		))
			this.removeLayer(layer);
		for (const page of findPages(this.view.contentEl)) this.dirty.add(page);
	}

	private removeLayer(layer: Element): void {
		this.removedByUs.add(layer);
		layer.remove();
	}

	private drawDirty(): void {
		if (!this.active) return;
		this.syncFile();
		const pages = [...this.dirty];
		this.dirty.clear();
		for (const page of pages) {
			if (!page.isConnected) continue;
			try {
				this.drawPage(page);
			} catch (error) {
				console.error(error);
			}
		}
		for (const page of [...this.drawn.keys()])
			if (!page.isConnected) this.drawn.delete(page);
		this.applyFlash();
	}

	private drawPage(page: HTMLElement): void {
		const path = this.filePath;
		const number = pageNumberOf(page);
		const textLayer = textLayerOf(page);
		if (path === null || number === null || !textLayer) return;
		const highlights = this.plugin.highlights.index
			.forPdf(path)
			.filter((highlight) => highlight.page === number);
		const existing = highlightLayerOf(page);
		if (highlights.length === 0) {
			if (existing) this.removeLayer(existing);
			this.drawn.delete(page);
			return;
		}
		const planned: Planned[] = [];
		let missing = false;
		for (const highlight of highlights) {
			const local = this.boxesFor(path, highlight, textLayer);
			if (local)
				planned.push(
					planHighlight(
						textLayer,
						highlight,
						local,
						paletteHex(this.plugin.settings, highlight.color),
					),
				);
			else missing = true;
		}
		const layer = existing ?? createHighlightLayer(textLayer);
		const flashing =
			this.flashing && Date.now() < this.flashing.until
				? this.flashing.key
				: null;
		this.drawn.set(page, paintLayer(layer, planned, flashing));
		if (missing) this.retryLater(page);
		else this.retries.delete(page);
	}

	/** 矩形（キャッシュがあればそれ） */
	private boxesFor(
		path: string,
		highlight: Highlight,
		textLayer: HTMLElement,
	): Box[] | null {
		const cacheKey = `${path}|${highlight.key}`;
		const cached = this.boxes.get(cacheKey);
		if (cached) return cached;
		const measured = measureBoxes(textLayer, highlight);
		if (measured) this.boxes.set(cacheKey, measured);
		return measured;
	}

	/** テキスト層がまだ描かれていない・描き直し中なら、少し待って測り直す */
	private retryLater(page: HTMLElement): void {
		const count = (this.retries.get(page) ?? 0) + 1;
		this.retries.set(page, count);
		if (count > MAX_RETRIES || this.retryTimer !== null) return;
		this.retryTimer = window.setTimeout(() => {
			this.retryTimer = null;
			this.dirty.add(page);
			this.flush();
		}, 300 * count);
	}

	private applyFlash(): void {
		const request = this.flashRequest;
		if (!request) return;
		if (Date.now() > request.until) {
			this.flashRequest = null;
			return;
		}
		for (const items of this.drawn.values()) {
			const item = items.find(
				(drawn) => drawn.highlight.key === request.key,
			);
			if (!item) continue;
			this.flashRequest = null;
			this.flashing = { key: request.key, until: Date.now() + FLASH_MS };
			item.group.firstElementChild?.scrollIntoView({
				block: 'center',
				inline: 'nearest',
			});
			item.group.addClass('is-flashing');
			window.setTimeout(() => {
				this.flashing = null;
				for (const drawn of this.drawn.values())
					for (const other of drawn)
						other.group.removeClass('is-flashing');
			}, FLASH_MS);
			return;
		}
	}
}
