import type { PdfAnchor } from './types';

/**
 * ページの中の「読む順」の位置（大きいほど後ろ）。ノートに PDF の順で足すときの並べ替えに使う。
 * 文字は本体のテキスト層の要素の順（data-idx。PDF の中の文字の順で、段組みでも本文の流れに沿う）。
 * 画像の範囲は、その上端より下にある最初の文字の手前とみなす。
 */

/** 文字の範囲の位置（要素の番号 + 要素の中の位置） */
export function textReadingPosition(anchor: {
	selection: { begin: { idx: number; offset: number } };
}): number {
	const { idx, offset } = anchor.selection.begin;
	return idx + Math.min(offset, 99_999) / 100_000;
}

/** テキスト層の要素 1 つ（番号と、回転前のページに対する上端・下端の割合） */
export interface SpanBox {
	idx: number;
	top: number;
	bottom: number;
}

/** 画像の範囲の位置: 範囲の上端より下（中心が下）にある最初の要素の手前。無ければページの最後 */
export function regionReadingPosition(
	spans: readonly SpanBox[],
	regionTop: number,
): number {
	let first = Infinity;
	let last = -1;
	for (const span of spans) {
		last = Math.max(last, span.idx);
		if ((span.top + span.bottom) / 2 >= regionTop)
			first = Math.min(first, span.idx);
	}
	return Number.isFinite(first) ? first - 0.5 : last + 0.5;
}

/** 位置（画像の範囲はテキスト層の要素が要る。無ければ文字の範囲だけ） */
export function readingPosition(
	anchor: PdfAnchor,
	spans: readonly SpanBox[] | null,
): number {
	if (anchor.type === 'text') return textReadingPosition(anchor);
	return spans ? regionReadingPosition(spans, anchor.region.top) : 0;
}
