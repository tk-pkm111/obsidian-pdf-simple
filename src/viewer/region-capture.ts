import { Component, type FileView } from 'obsidian';
import { toLocalBoxes } from '../lib/geometry';
import { normalizeRegion } from '../lib/pdf-selection';
import type { PdfRegion } from '../lib/types';
import type PdfSimplePlugin from '../main';
import {
	CAPTURE_BOX_CLASS,
	closestPage,
	pageNumberOf,
	rotationOf,
	textLayerOf,
} from './dom';
import type { ViewTools } from './tools';

/** これより小さい四角（CSS px）は取り込まない（クリックの取り違え） */
const MIN_SIZE = 6;
const CAPTURING_CLASS = 'pdf-simple-capturing';

export interface CaptureHost {
	readonly view: FileView;
	readonly tools: ViewTools;
}

/** 取り込んだ範囲 */
export interface CapturedRegion {
	page: number;
	/** 回転前のページに対する割合（記録用） */
	region: PdfRegion;
	/** 見えている向きのページに対する割合（画像にする用） */
	displayed: PdfRegion;
	/** 見えている向き（PDF 自体の回転を含む） */
	rotation: number;
}

interface Drag {
	page: HTMLElement;
	textLayer: HTMLElement;
	/** 始点（テキスト層の外接矩形に対する割合） */
	x: number;
	y: number;
	box: HTMLElement;
	current: PdfRegion;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * 範囲を画像として取り込む操作: 取り込み中は、ページの上のドラッグで四角を描く。
 * その間は文字の選択・PDF のリンク・スクロール（タッチ）を止める。1 回取り込むか Esc で解除。
 */
export class RegionCapture extends Component {
	private drag: Drag | null = null;
	private suppressClick = false;

	constructor(
		private readonly plugin: PdfSimplePlugin,
		private readonly host: CaptureHost,
	) {
		super();
	}

	onload(): void {
		const root = this.host.view.contentEl;
		this.register(this.host.tools.onChange(() => this.sync()));
		const capture = { capture: true };
		this.registerDomEvent(
			root,
			'pointerdown',
			(e) => this.onDown(e),
			capture,
		);
		this.registerDomEvent(
			root,
			'pointermove',
			(e) => this.onMove(e),
			capture,
		);
		this.registerDomEvent(root, 'pointerup', (e) => this.onUp(e), capture);
		this.registerDomEvent(
			root,
			'pointercancel',
			() => this.cancel(),
			capture,
		);
		this.registerDomEvent(
			root,
			'selectstart',
			(evt) => {
				if (this.host.tools.capturing) evt.preventDefault();
			},
			capture,
		);
		// 取り込み中のクリックで PDF のリンクを開いたり、ノートへ移ったりしない
		this.registerDomEvent(
			root,
			'click',
			(evt) => {
				if (!this.host.tools.capturing && !this.suppressClick) return;
				this.suppressClick = false;
				evt.preventDefault();
				evt.stopPropagation();
			},
			capture,
		);
		this.registerDomEvent(root.doc, 'keydown', (evt) => {
			if (evt.key === 'Escape' && this.host.tools.mode.kind !== 'idle')
				this.host.tools.disarm();
		});
		this.sync();
	}

	onunload(): void {
		this.cancel();
		this.host.view.contentEl.removeClass(CAPTURING_CLASS);
	}

	private sync(): void {
		const capturing = this.host.tools.capturing;
		const root = this.host.view.contentEl;
		root.toggleClass(CAPTURING_CLASS, capturing);
		if (capturing) {
			root.doc.getSelection()?.removeAllRanges();
			this.plugin.selection.hide();
		} else {
			this.cancel();
		}
	}

	private onDown(evt: PointerEvent): void {
		if (!this.host.tools.capturing || evt.button !== 0) return;
		const page = closestPage(evt.targetNode);
		const textLayer = page ? textLayerOf(page) : null;
		if (!page || !textLayer) return;
		evt.preventDefault();
		evt.stopPropagation();
		this.cancel();
		const frame = textLayer.getBoundingClientRect();
		if (frame.width < 1 || frame.height < 1) return;
		const x = clamp((evt.clientX - frame.left) / frame.width);
		const y = clamp((evt.clientY - frame.top) / frame.height);
		// 外で作ってから入れる（重ね描きの MutationObserver はこのクラスを無視する）
		const box = createDiv({ cls: CAPTURE_BOX_CLASS });
		page.appendChild(box);
		this.drag = {
			page,
			textLayer,
			x,
			y,
			box,
			current: { left: x, top: y, right: x, bottom: y },
		};
		this.paint();
		try {
			page.setPointerCapture(evt.pointerId);
		} catch {
			// 合成したイベントなどでは使えないが、ドラッグはビュー全体で見ているので続けられる
		}
	}

	private onMove(evt: PointerEvent): void {
		const drag = this.drag;
		if (!drag) return;
		evt.preventDefault();
		if (!drag.box.isConnected || !drag.page.isConnected) {
			// ズームなどでページが描き直された
			this.cancel();
			return;
		}
		const frame = drag.textLayer.getBoundingClientRect();
		const x = clamp((evt.clientX - frame.left) / frame.width);
		const y = clamp((evt.clientY - frame.top) / frame.height);
		drag.current = {
			left: Math.min(drag.x, x),
			top: Math.min(drag.y, y),
			right: Math.max(drag.x, x),
			bottom: Math.max(drag.y, y),
		};
		this.paint();
	}

	private onUp(evt: PointerEvent): void {
		const drag = this.drag;
		if (!drag) return;
		evt.preventDefault();
		evt.stopPropagation();
		this.onMove(evt);
		// 離した直後のクリックだけを止める（クリックは pointerup と同じ流れで届く）
		this.suppressClick = true;
		window.setTimeout(() => (this.suppressClick = false), 0);
		const frame = drag.textLayer.getBoundingClientRect();
		const page = pageNumberOf(drag.page);
		const rotation = rotationOf(drag.textLayer);
		const { current } = drag;
		this.cancel();
		this.host.tools.disarm();
		const width = (current.right - current.left) * frame.width;
		const height = (current.bottom - current.top) * frame.height;
		if (page === null || width < MIN_SIZE || height < MIN_SIZE) return;
		const [local] = toLocalBoxes(
			[
				{
					left: frame.left + current.left * frame.width,
					top: frame.top + current.top * frame.height,
					width,
					height,
				},
			],
			frame,
			rotation,
		);
		const region = local
			? normalizeRegion({
					left: local.x,
					top: local.y,
					right: local.x + local.w,
					bottom: local.y + local.h,
				})
			: null;
		if (!region) return;
		void this.plugin.regions.capture(this.host.view, {
			page,
			region,
			displayed: current,
			rotation,
		});
	}

	private paint(): void {
		const drag = this.drag;
		if (!drag) return;
		const { current } = drag;
		const percent = (value: number) => `${(value * 100).toFixed(3)}%`;
		drag.box.setCssProps({
			'--pdf-simple-x': percent(current.left),
			'--pdf-simple-y': percent(current.top),
			'--pdf-simple-w': percent(current.right - current.left),
			'--pdf-simple-h': percent(current.bottom - current.top),
		});
	}

	private cancel(): void {
		this.drag?.box.remove();
		this.drag = null;
	}
}
