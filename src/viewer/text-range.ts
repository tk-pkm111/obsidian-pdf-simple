import { toLocalBoxes } from '../lib/geometry';
import { columnRightOf, type LineBox } from '../lib/paragraphs';
import {
	extractText,
	isValidSelection,
	normalizeSelection,
} from '../lib/pdf-selection';
import type { PdfSelection } from '../lib/types';
import { expandToWords } from '../lib/word-boundary';
import {
	closestPage,
	endsLine,
	idxOf,
	pageNumberOf,
	rotationOf,
	spanByIdx,
	textLayerOf,
	textSpans,
} from './dom';

/**
 * DOM の選択範囲 ⇄ `selection=b,bo,e,eo`。
 * 本体の「選択範囲へのリンクをコピー」と同じ数え方（span の data-idx と、その span の中の文字数）。
 */

export interface SelectionResult {
	page: number;
	pageEl: HTMLElement;
	selection: PdfSelection;
	/** 選ばれた文字列（改行入り） */
	text: string;
}

/** span の先頭から (container, offset) までの文字数。要素の境界でも数えられる */
function textOffset(
	span: HTMLElement,
	container: Node,
	offset: number,
): number {
	const range = span.doc.createRange();
	range.setStart(span, 0);
	range.setEnd(container, offset);
	return range.toString().length;
}

/** 選択範囲が 1 ページのテキスト層に収まっていれば、その範囲を返す */
export function selectionToPdfSelection(
	selection: Selection,
	root: HTMLElement,
): SelectionResult | null {
	if (selection.rangeCount === 0 || selection.isCollapsed) return null;
	const range = selection.getRangeAt(0);
	const pageEl = closestPage(range.startContainer);
	if (
		!pageEl ||
		pageEl !== closestPage(range.endContainer) ||
		!root.contains(pageEl)
	)
		return null;
	const page = pageNumberOf(pageEl);
	const textLayer = textLayerOf(pageEl);
	if (page === null || !textLayer) return null;

	const spans = textSpans(textLayer).filter((span) =>
		range.intersectsNode(span),
	);
	const first = spans[0];
	const last = spans[spans.length - 1];
	if (!first || !last) return null;
	const begin = idxOf(first);
	const end = idxOf(last);
	if (begin === null || end === null) return null;
	const beginOffset = first.contains(range.startContainer)
		? textOffset(first, range.startContainer, range.startOffset)
		: 0;
	const endOffset = last.contains(range.endContainer)
		? textOffset(last, range.endContainer, range.endOffset)
		: (last.textContent ?? '').length;
	const result = normalizeSelection({
		begin: { idx: begin, offset: beginOffset },
		end: { idx: end, offset: endOffset },
	});
	if (!isValidSelection(result)) return null;
	return { page, pageEl, selection: result, text: selection.toString() };
}

/**
 * 英単語の途中で切れた選択を単語の端まで広げ、文字列もテキスト層から取り直す。
 * （ドラッグの始点・終点は単語の中に入りやすい。"This" の T が抜けるなど）
 */
export function expandResultToWords(result: SelectionResult): SelectionResult {
	const textLayer = textLayerOf(result.pageEl);
	if (!textLayer) return result;
	const selection = expandToWords(
		(idx) => spanByIdx(textLayer, idx)?.textContent ?? null,
		result.selection,
	);
	if (
		selection.begin.offset === result.selection.begin.offset &&
		selection.end.offset === result.selection.end.offset
	)
		return result;
	return {
		...result,
		selection,
		text: textInLayer(textLayer, selection) ?? result.text,
	};
}

/** span の中の offset 文字目の位置（テキストノードと、その中の位置） */
function pointIn(
	span: HTMLElement,
	offset: number,
): { node: Node; offset: number } {
	const walker = span.doc.createTreeWalker(span, NodeFilter.SHOW_TEXT);
	let remaining = offset;
	let last: Node | null = null;
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const length = node.textContent?.length ?? 0;
		if (remaining <= length) return { node, offset: remaining };
		remaining -= length;
		last = node;
	}
	return last
		? { node: last, offset: last.textContent?.length ?? 0 }
		: { node: span, offset: span.childNodes.length };
}

/** 保存した範囲 → DOM の Range（その span がまだ描かれていなければ null） */
export function pdfSelectionToRange(
	textLayer: HTMLElement,
	selection: PdfSelection,
): Range | null {
	const beginSpan = spanByIdx(textLayer, selection.begin.idx);
	const endSpan = spanByIdx(textLayer, selection.end.idx);
	if (!beginSpan || !endSpan) return null;
	const start = pointIn(beginSpan, selection.begin.offset);
	const end = pointIn(endSpan, selection.end.offset);
	const range = textLayer.doc.createRange();
	try {
		range.setStart(start.node, start.offset);
		range.setEnd(end.node, end.offset);
	} catch {
		return null;
	}
	return range.collapsed ? null : range;
}

/** テキスト層から範囲の文字列を取り出す（行の終わりには改行を入れる） */
export function textInLayer(
	textLayer: HTMLElement,
	selection: PdfSelection,
): string | null {
	const items = textSpans(textLayer).flatMap((span) => {
		const idx = idxOf(span);
		return idx === null
			? []
			: [
					{
						idx,
						text: `${span.textContent ?? ''}${endsLine(span) ? '\n' : ''}`,
					},
				];
	});
	if (!items.some((item) => item.idx === selection.begin.idx)) return null;
	return extractText(items, selection);
}

/** span の from〜to 文字目の画面上の矩形 */
function partRect(span: HTMLElement, from: number, to: number): DOMRect {
	if (from === 0 && to === (span.textContent ?? '').length)
		return span.getBoundingClientRect();
	const start = pointIn(span, from);
	const stop = pointIn(span, to);
	const range = span.doc.createRange();
	range.setStart(start.node, start.offset);
	range.setEnd(stop.node, stop.offset);
	return range.getBoundingClientRect();
}

/** テキスト層の要素を、PDF の行ごとの文字と位置（回転前のページの座標、px）にまとめる */
function collectLines(
	textLayer: HTMLElement,
	part: (span: HTMLElement, idx: number) => [number, number] | null,
): LineBox[] {
	const frame = textLayer.getBoundingClientRect();
	if (frame.width < 1 || frame.height < 1) return [];
	const rotation = rotationOf(textLayer);
	const quarter = rotation === 90 || rotation === 270;
	const width = quarter ? frame.height : frame.width;
	const height = quarter ? frame.width : frame.height;
	const lines: LineBox[] = [];
	let texts: string[] = [];
	let rects: DOMRect[] = [];
	const flush = (): void => {
		const boxes = toLocalBoxes(rects, frame, rotation);
		if (texts.length > 0 && boxes.length > 0)
			lines.push({
				text: texts.join(''),
				left: Math.min(...boxes.map((box) => box.x)) * width,
				right: Math.max(...boxes.map((box) => box.x + box.w)) * width,
				top: Math.min(...boxes.map((box) => box.y)) * height,
				bottom: Math.max(...boxes.map((box) => box.y + box.h)) * height,
			});
		texts = [];
		rects = [];
	};
	for (const span of textSpans(textLayer)) {
		const idx = idxOf(span);
		const range = idx === null ? null : part(span, idx);
		if (range) {
			const [from, to] = range;
			const full = span.textContent ?? '';
			if (to > from) {
				texts.push(full.slice(from, to));
				const rect = partRect(span, from, to);
				if (rect.width > 0 && rect.height > 0) rects.push(rect);
			}
		}
		if (endsLine(span)) flush();
	}
	flush();
	return lines;
}

/**
 * 選んだ範囲を段落の形に戻すための材料: 行ごとの文字と位置と、段の右端。
 * テキスト層が無ければ null。
 */
export function selectionLines(
	result: SelectionResult,
): { lines: LineBox[]; columnRight: number | undefined } | null {
	const textLayer = textLayerOf(result.pageEl);
	if (!textLayer) return null;
	const { begin, end } = result.selection;
	const lines = collectLines(textLayer, (span, idx) => {
		if (idx < begin.idx || idx > end.idx) return null;
		const length = (span.textContent ?? '').length;
		return [
			idx === begin.idx ? begin.offset : 0,
			idx === end.idx ? end.offset : length,
		];
	});
	const page = collectLines(textLayer, (span) => [
		0,
		(span.textContent ?? '').length,
	]);
	return { lines, columnRight: columnRightOf(page, lines) };
}
