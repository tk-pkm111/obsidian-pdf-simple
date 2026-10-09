import { Component, Platform, debounce, type FileView } from 'obsidian';
import type PdfSimplePlugin from '../main';
import { SelectionPopup } from './selection-popup';
import {
	expandResultToWords,
	selectionToPdfSelection,
	type SelectionResult,
} from './text-range';

/** クリックのあと、ダブル・トリプルクリックの続きを待つ時間 */
const MULTI_CLICK_DELAY = 300;
/** これより動いたらドラッグ（文字を選んだ） */
const DRAG_DISTANCE = 5;

interface Current {
	view: FileView;
	result: SelectionResult;
}

/** PDF の文字の上でマウス（ペン）を押したときに覚えておくこと */
interface Press {
	view: FileView;
	x: number;
	y: number;
	alt: boolean;
	/** 押す前の選択（この押下で選択が変わったかを見る） */
	before: string | null;
}

function selectionSignature(selection: Selection | null): string | null {
	if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
		return null;
	const range = selection.getRangeAt(0);
	return [
		range.startContainer.textContent,
		range.startOffset,
		range.endContainer.textContent,
		range.endOffset,
		selection.toString(),
	].join('|');
}

/**
 * PDF で文字を選んだときの動き。
 * - マウス・ペンで選んで離したとき（デスクトップ）: 設定に従って、すぐ塗る・吹き出しを出す・何もしない。
 *   すぐ塗るときはペンの色と書き方（本文・見出し）で作る。Alt を押しながら選ぶと何もしない（コピー用）。
 *   ダブル・トリプルクリックは最後の選択だけを 1 回扱う。ペアのノートがまだ無い PDF では吹き出しで確かめる。
 * - キーボード・指で選んだとき: 吹き出し（スマホは画面の下のバー）を出すだけ。黙って作ることはしない。
 * 吹き出しでは、色を押せばその色（書き方はペンのまま）、見出しを押せばその書き方（色はペンのまま）で作る。
 */
export class SelectionController extends Component {
	private readonly popup: SelectionPopup;
	private readonly watched = new WeakSet<Document>();
	private press: Press | null = null;
	private commitTimer: number | null = null;
	private pointerDown = false;
	private readonly evaluateSoon = debounce(() => this.evaluate(), 180, true);

	constructor(private readonly plugin: PdfSimplePlugin) {
		super();
		this.popup = new SelectionPopup(plugin);
	}

	start(): void {
		const docs = new Set<Document>([activeDocument]);
		this.plugin.app.workspace.iterateAllLeaves((leaf) =>
			docs.add(leaf.view.containerEl.doc),
		);
		for (const doc of docs) this.watch(doc);
		this.registerEvent(
			this.plugin.app.workspace.on('window-open', (win) =>
				this.watch(win.doc),
			),
		);
		this.register(() => {
			this.evaluateSoon.cancel();
			this.clearCommit();
			this.hide();
		});
	}

	/** 今 PDF で選ばれている範囲（無ければ null） */
	currentSelection(): Current | null {
		for (const view of this.plugin.viewer.pdfViews()) {
			const selection = view.contentEl.doc.getSelection();
			if (
				!selection ||
				selection.isCollapsed ||
				selection.rangeCount === 0
			)
				continue;
			if (!view.contentEl.contains(selection.anchorNode)) continue;
			const result = selectionToPdfSelection(selection, view.contentEl);
			if (result) return { view, result: expandResultToWords(result) };
		}
		return null;
	}

	hide(): void {
		this.popup.hide();
	}

	private watch(doc: Document): void {
		if (this.watched.has(doc)) return;
		this.watched.add(doc);
		this.registerDomEvent(doc, 'selectionchange', () => {
			if (!this.pointerDown) this.evaluateSoon();
		});
		this.registerDomEvent(
			doc,
			'pointerdown',
			(evt) => this.onPointerDown(evt),
			{ capture: true },
		);
		this.registerDomEvent(
			doc,
			'pointerup',
			(evt) => this.onPointerUp(evt),
			{ capture: true },
		);
		this.registerDomEvent(
			doc,
			'pointercancel',
			() => {
				this.pointerDown = false;
				this.press = null;
			},
			{ capture: true },
		);
		this.registerDomEvent(doc, 'keydown', (evt) => {
			if (evt.key === 'Escape') this.hide();
		});
		this.registerDomEvent(doc, 'scroll', () => this.popup.reposition(), {
			capture: true,
		});
	}

	/** 押した場所が、マウス・ペンで文字を選べる PDF のテキスト層ならそのビュー */
	private trackable(evt: PointerEvent): FileView | null {
		if (Platform.isMobile || evt.button !== 0) return null;
		if (evt.pointerType !== 'mouse' && evt.pointerType !== 'pen')
			return null;
		const node = evt.targetNode;
		const element = node?.instanceOf(Element) ? node : node?.parentElement;
		if (!element?.closest('.textLayer')) return null;
		for (const view of this.plugin.viewer.pdfViews()) {
			if (!view.contentEl.contains(element)) continue;
			return this.plugin.viewer.toolsFor(view)?.capturing ? null : view;
		}
		return null;
	}

	private onPointerDown(evt: PointerEvent): void {
		if (this.popup.contains(evt.targetNode)) return;
		this.pointerDown = true;
		const continuing = this.commitTimer !== null;
		this.clearCommit();
		const view = this.trackable(evt);
		if (!view) {
			this.press = null;
			return;
		}
		if (continuing && this.press?.view === view) {
			// ダブル・トリプルクリックの続き（押す前の選択・Alt・予約は最初の押下のものを使う）
			this.press.x = evt.clientX;
			this.press.y = evt.clientY;
			return;
		}
		this.press = {
			view,
			x: evt.clientX,
			y: evt.clientY,
			alt: evt.altKey,
			before: selectionSignature(view.contentEl.doc.getSelection()),
		};
	}

	private onPointerUp(evt: PointerEvent): void {
		const wasDown = this.pointerDown;
		this.pointerDown = false;
		const press = this.press;
		if (!press || evt.button !== 0) {
			if (wasDown) this.evaluateSoon();
			return;
		}
		const dragged =
			Math.hypot(evt.clientX - press.x, evt.clientY - press.y) >
			DRAG_DISTANCE;
		this.commitTimer = window.setTimeout(
			() => {
				this.commitTimer = null;
				this.press = null;
				this.commit(press);
			},
			dragged ? 0 : MULTI_CLICK_DELAY,
		);
	}

	private clearCommit(): void {
		if (this.commitTimer !== null) window.clearTimeout(this.commitTimer);
		this.commitTimer = null;
	}

	/** マウスで選び終えたとき */
	private commit(press: Press): void {
		const { view } = press;
		if (!view.containerEl.isConnected) return;
		const selection = view.contentEl.doc.getSelection();
		if (
			!selection ||
			selection.isCollapsed ||
			selection.rangeCount === 0 ||
			!view.contentEl.contains(selection.anchorNode)
		) {
			this.hide();
			return;
		}
		if (press.alt || selectionSignature(selection) === press.before) return;
		const raw = selectionToPdfSelection(selection, view.contentEl);
		if (!raw) return;
		const result = expandResultToWords(raw);
		const action = this.plugin.settings.selectAction;
		if (action === 'none') return;
		const file = view.file;
		const unpaired =
			file !== null && this.plugin.pairing.notesFor(file).length === 0;
		if (action === 'popup' || unpaired) {
			this.showPopup(view, result);
			return;
		}
		this.create(view, result, {}, false);
	}

	/** キーボード・指での選択（とマウス以外）: 吹き出しを出すだけ */
	private evaluate(): void {
		if (this.press || this.commitTimer !== null) return;
		const found = this.currentSelection();
		if (!found) {
			this.hide();
			return;
		}
		if (this.plugin.viewer.toolsFor(found.view)?.capturing) return;
		if (this.plugin.settings.selectAction === 'none') {
			this.hide();
			return;
		}
		const shown = this.popup.shown;
		if (
			shown?.view === found.view &&
			shown.result.page === found.result.page &&
			JSON.stringify(shown.result.selection) ===
				JSON.stringify(found.result.selection)
		)
			return;
		this.showPopup(found.view, found.result);
	}

	private showPopup(view: FileView, result: SelectionResult): void {
		this.popup.show({ view, result }, (choice) =>
			this.create(view, result, choice, true),
		);
	}

	/** ハイライトを作る（指定が無い色・書き方はペンの設定） */
	private create(
		view: FileView,
		result: SelectionResult,
		choice: { color?: string; level?: number },
		allowCreateNote: boolean,
	): void {
		const { settings } = this.plugin;
		view.contentEl.doc.getSelection()?.removeAllRanges();
		this.hide();
		const level = choice.level ?? settings.defaultHeading;
		void this.plugin.actions.createHighlight(view, result, {
			color: choice.color ?? settings.defaultColor,
			headingLevel: level > 0 ? level : null,
			allowCreateNote,
		});
	}
}
