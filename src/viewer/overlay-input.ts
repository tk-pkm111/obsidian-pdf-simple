import { Component, Keymap, type FileView } from 'obsidian';
import type { Highlight } from '../lib/types';
import type PdfSimplePlugin from '../main';
import { isInsideAnnotation } from './dom';
import { showHighlightMenu } from './highlight-menu';
import type { Drawn } from './paint';
import type { ViewTools } from './tools';

/** クリックとダブルクリック（単語の選択）を見分ける待ち時間 */
const CLICK_DELAY = 250;
const HOVER_CLASS = 'pdf-simple-hovering';
export const HOVER_SOURCE = 'pdf-simple';

/** 重ね描きの持ち主（ViewOverlay）に頼むこと */
export interface OverlayHost {
	readonly view: FileView;
	readonly tools: ViewTools;
	isActive(): boolean;
	currentFilePath(): string | null;
	/** その位置のハイライト */
	hitAt(evt: MouseEvent): Drawn | null;
	/** ハイライトの今の文字列 */
	textOf(highlight: Highlight): string | null;
}

/**
 * PDF ビューの上のマウス操作。矩形は pointer-events: none（文字の選択を邪魔しない）なので、
 * 押した位置とハイライトの矩形を突き合わせて判定する。
 * - クリック（動かさずに押して離す）: 少し待ってノートの該当行へ。ダブル・トリプルクリック（単語・行の選択）なら取りやめる
 *   （選んだ文字はすぐ塗って選択を外すので、選択の有無ではなくクリックの回数で見分ける）
 * - 右クリック: ハイライトのメニュー（文字を選んでいるときは本体のメニュー）
 * - ホバー: 指のカーソル。Cmd / Ctrl でページプレビュー
 * 範囲の取り込み中は何もしない。
 */
export class OverlayInput extends Component {
	private pointer: { x: number; y: number } | null = null;
	/** ボタンを押している間（ドラッグ中はホバーを出さない） */
	private pressed = false;
	private clickTimer: number | null = null;
	private hoverKey: string | null = null;
	private lastMove = 0;

	constructor(
		private readonly plugin: PdfSimplePlugin,
		private readonly host: OverlayHost,
	) {
		super();
	}

	onload(): void {
		const root = this.host.view.contentEl;
		this.registerDomEvent(root, 'pointerdown', (evt) =>
			this.onPointerDown(evt),
		);
		this.registerDomEvent(root, 'pointerup', () => (this.pressed = false));
		this.registerDomEvent(root, 'click', (evt) => this.onClick(evt));
		// ページプレビューは PointerEvent をタッチ扱いで無視するので、ホバーは mousemove で見る
		this.registerDomEvent(root, 'mousemove', (evt) =>
			this.onMouseMove(evt),
		);
		this.registerDomEvent(root, 'pointerleave', () => this.setHover(null));
		this.registerDomEvent(
			root,
			'contextmenu',
			(evt) => this.onContextMenu(evt),
			{
				capture: true,
			},
		);
	}

	onunload(): void {
		if (this.clickTimer !== null) window.clearTimeout(this.clickTimer);
		this.host.view.contentEl.removeClass(HOVER_CLASS);
	}

	private selectionIsEmpty(): boolean {
		const root = this.host.view.contentEl;
		const selection = root.doc.getSelection();
		return (
			!selection ||
			selection.isCollapsed ||
			!root.contains(selection.anchorNode)
		);
	}

	private cancelPending(): void {
		if (this.clickTimer !== null) window.clearTimeout(this.clickTimer);
		this.clickTimer = null;
	}

	private onPointerDown(evt: PointerEvent): void {
		// 2 回目の押下（ダブルクリックで単語を選ぶ）なら移動しない
		this.cancelPending();
		this.pointer =
			evt.button === 0 ? { x: evt.clientX, y: evt.clientY } : null;
		this.pressed = this.pointer !== null;
	}

	private onClick(evt: MouseEvent): void {
		const start = this.pointer;
		this.pointer = null;
		if (evt.button !== 0 || !start) return;
		if (evt.detail > 1) {
			this.cancelPending();
			return;
		}
		if (Math.hypot(evt.clientX - start.x, evt.clientY - start.y) > 5)
			return;
		if (this.host.tools.capturing) return;
		if (isInsideAnnotation(evt.targetNode)) return;
		const hit = this.host.hitAt(evt);
		if (!hit) return;
		const newLeaf = Keymap.isModEvent(evt);
		this.cancelPending();
		this.clickTimer = window.setTimeout(() => {
			this.clickTimer = null;
			if (!this.host.isActive() || !this.selectionIsEmpty()) return;
			void this.plugin.actions.openInNote(hit.highlight, {
				sourceLeaf: this.host.view.leaf,
				newLeaf,
				evt,
			});
		}, CLICK_DELAY);
	}

	private onContextMenu(evt: MouseEvent): void {
		if (this.host.tools.capturing) return;
		const hit = this.host.hitAt(evt);
		if (!hit || !this.selectionIsEmpty()) return;
		evt.preventDefault();
		evt.stopPropagation();
		showHighlightMenu(
			this.plugin,
			this.host.view,
			hit.highlight,
			evt,
			this.host.textOf(hit.highlight),
		);
	}

	private onMouseMove(evt: MouseEvent): void {
		const now = Date.now();
		if (now - this.lastMove < 60) return;
		this.lastMove = now;
		const idle = !this.pressed && !this.host.tools.capturing;
		this.setHover(idle ? this.host.hitAt(evt) : null, evt);
	}

	private setHover(hit: Drawn | null, evt?: MouseEvent): void {
		const key = hit?.highlight.key ?? null;
		if (key === this.hoverKey) return;
		this.hoverKey = key;
		this.host.view.contentEl.toggleClass(HOVER_CLASS, key !== null);
		const block = hit?.highlight.blocks[0];
		const node = evt?.targetNode ?? null;
		const targetEl = node?.instanceOf(HTMLElement)
			? node
			: (node?.parentElement ?? null);
		if (!hit || !block || !evt || !targetEl) return;
		// ページプレビュー（Cmd / Ctrl を押しながら）でノートの該当行を見せる。
		// 矩形はマウスを受けないので、マウスの下にある文字の要素を基準にする
		this.plugin.app.workspace.trigger('hover-link', {
			event: evt,
			source: HOVER_SOURCE,
			hoverParent: this.host.view.leaf,
			targetEl,
			linktext: `${block.notePath}#^${block.id}`,
			sourcePath: this.host.currentFilePath() ?? '',
		});
	}
}
