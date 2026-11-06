import { FileView, type View } from 'obsidian';
import { rotationFromMatrix, type Rotation } from '../lib/geometry';

/**
 * Obsidian 本体の PDF ビュー（view type `pdf`）の DOM についての知識は、すべてこのファイルに置く。
 * 公開 API ではないので Obsidian の更新で変わることがある。見つからなければ null を返し、呼ぶ側は何もしない。
 *
 *   view.contentEl > .pdf-toolbar（> .pdf-toolbar-left + .pdf-toolbar-right）+ .pdf-container > .pdf-content-container > .pdf-viewer-container
 *     > .pdfViewer > .page[data-page-number] > .canvasWrapper / .textLayer / .annotationLayer
 *   .textLayer > span.textLayerNode[data-idx]（本体改変版 pdf.js。空文字の要素は DOM に無いが番号は進む）
 *
 * 重ね描きの層は .page の直下、.textLayer の直前に置く（.textLayer は Obsidian が opacity: 0.2 にしているので、
 * その中に置くと色が薄くなる）。ズームすると .page 直下に足した要素は pdf.js に消される（スパイク S6）ので、
 * 消えたら MutationObserver で足し直す。回転は .textLayer にだけかかるので、座標を変換して描く。
 */

export const PDF_VIEW_TYPE = 'pdf';
export const LAYER_CLASS = 'pdf-simple-highlight-layer';
/** 範囲を取り込むときにページの上に描く四角 */
export const CAPTURE_BOX_CLASS = 'pdf-simple-capture-box';

const PAGE = '.page[data-page-number]';

export function isPdfView(view: View): view is FileView {
	return (
		view instanceof FileView &&
		view.getViewType() === PDF_VIEW_TYPE &&
		view.file?.extension === 'pdf'
	);
}

function elementOf(node: Node | null): Element | null {
	if (!node) return null;
	return node.nodeType === Node.ELEMENT_NODE
		? (node as Element)
		: node.parentElement;
}

export function closestPage(node: Node | null): HTMLElement | null {
	const page = elementOf(node)?.closest(PAGE);
	return page && page.instanceOf(HTMLElement) ? page : null;
}

export function isPage(node: Node): boolean {
	const element = elementOf(node);
	return element === node && element.matches(PAGE);
}

export function findPages(root: ParentNode): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(PAGE));
}

export function findPage(root: ParentNode, page: number): HTMLElement | null {
	return root.querySelector<HTMLElement>(`.page[data-page-number="${page}"]`);
}

export function pageNumberOf(page: HTMLElement): number | null {
	const value = Number(page.dataset.pageNumber);
	return Number.isInteger(value) && value > 0 ? value : null;
}

export function textLayerOf(page: HTMLElement): HTMLElement | null {
	return page.querySelector<HTMLElement>(':scope > .textLayer');
}

export function textSpans(textLayer: HTMLElement): HTMLElement[] {
	return Array.from(
		textLayer.querySelectorAll<HTMLElement>('.textLayerNode[data-idx]'),
	);
}

export function spanByIdx(
	textLayer: HTMLElement,
	idx: number,
): HTMLElement | null {
	return textLayer.querySelector<HTMLElement>(
		`.textLayerNode[data-idx="${idx}"]`,
	);
}

export function idxOf(span: HTMLElement): number | null {
	const value = Number(span.dataset.idx);
	return Number.isInteger(value) && value >= 0 ? value : null;
}

/** span の直後が改行（<br>）か。テキストを取り出すときに行の区切りを入れるため */
export function endsLine(span: HTMLElement): boolean {
	const next = span.nextSibling;
	return next !== null && next.nodeName === 'BR';
}

/** 本体のハイライト・検索が span の中身を組み替えたときの変化（描き直す必要は無い） */
export function isInsideTextLayerNode(node: Node): boolean {
	return elementOf(node)?.closest('.textLayerNode') != null;
}

/** このプラグインが足した要素（とその中） */
export function isOwnNode(node: Node): boolean {
	return (
		elementOf(node)?.closest(`.${LAYER_CLASS}, .${CAPTURE_BOX_CLASS}`) !=
		null
	);
}

export function isOwnLayer(node: Node): boolean {
	return (
		elementOf(node) === node &&
		(node as Element).classList.contains(LAYER_CLASS)
	);
}

/**
 * 描き直しが要るページ: ページ・テキスト層・キャンバスが足されたページと、
 * 自分の層を本体に消されたページ（removedByUs は自分で外した層）。
 * 自分の要素の中の変化と、span の中身の組み替え（本体の一時ハイライト・検索）は無視する。
 */
export function pagesTouchedBy(
	records: readonly MutationRecord[],
	removedByUs: WeakSet<Node>,
): Set<HTMLElement> {
	const pages = new Set<HTMLElement>();
	for (const record of records) {
		const target = record.target;
		if (isOwnNode(target) || isInsideTextLayerNode(target)) continue;
		for (const node of Array.from(record.addedNodes)) {
			if (node.nodeType !== Node.ELEMENT_NODE || isOwnNode(node))
				continue;
			const page =
				closestPage(target) ??
				(isPage(node) ? closestPage(node) : null);
			if (page) pages.add(page);
			else
				for (const inner of findPages(node as Element))
					pages.add(inner);
		}
		for (const node of Array.from(record.removedNodes)) {
			if (!isOwnLayer(node) || removedByUs.has(node)) continue;
			const page = closestPage(target);
			if (page) pages.add(page);
		}
	}
	return pages;
}

/** PDF の中のリンク・注釈（クリックを横取りしない） */
export function isInsideAnnotation(node: Node | null): boolean {
	return (
		elementOf(node)?.closest(
			'.annotationLayer a, .annotationLayer section',
		) != null
	);
}

export function viewerElement(root: HTMLElement): HTMLElement | null {
	return root.querySelector<HTMLElement>('.pdfViewer');
}

/** 上部ツールバーの右側（このプラグインのボタンを置く場所） */
export function toolbarSlot(root: HTMLElement): HTMLElement | null {
	return root.querySelector<HTMLElement>(
		':scope > .pdf-toolbar .pdf-toolbar-right',
	);
}

/** 画面の上から 3 分の 1 の高さにあるページ（今読んでいるページ） */
export function currentPageNumber(root: HTMLElement): number | null {
	const container = root.querySelector<HTMLElement>('.pdf-viewer-container');
	if (!container) return null;
	const box = container.getBoundingClientRect();
	const probe = box.top + box.height / 3;
	let best: number | null = null;
	let bestDistance = Infinity;
	for (const page of findPages(root)) {
		const rect = page.getBoundingClientRect();
		const distance =
			probe < rect.top
				? rect.top - probe
				: probe > rect.bottom
					? probe - rect.bottom
					: 0;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = pageNumberOf(page);
		}
	}
	return best;
}

/** テキスト層の回転（pdf.js は回転したページの .textLayer を CSS で回す） */
export function rotationOf(textLayer: HTMLElement): Rotation {
	const transform = textLayer.win.getComputedStyle(textLayer).transform;
	const match = /matrix\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)/.exec(transform);
	if (!match) return 0;
	return rotationFromMatrix(Number(match[1]), Number(match[2]));
}

export function highlightLayerOf(page: HTMLElement): HTMLElement | null {
	return page.querySelector<HTMLElement>(`:scope > .${LAYER_CLASS}`);
}

/** テキスト層の直前（ページの直下。キャンバスの上、テキスト層の下）に層を作る */
export function createHighlightLayer(textLayer: HTMLElement): HTMLElement {
	// ページに付けてから動かすと MutationObserver が余計に反応するので、外で作ってから入れる
	const layer = createDiv({ cls: LAYER_CLASS });
	textLayer.before(layer);
	return layer;
}
