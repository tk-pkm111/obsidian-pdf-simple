import type { PdfAnchor, PdfRegion, PdfSelection, TextPoint } from './types';

/** a が b より前なら負、同じなら 0 */
export function comparePoints(a: TextPoint, b: TextPoint): number {
	return a.idx - b.idx || a.offset - b.offset;
}

/** 始点が終点より後ろなら入れ替える */
export function normalizeSelection(selection: PdfSelection): PdfSelection {
	return comparePoints(selection.begin, selection.end) <= 0
		? selection
		: { begin: selection.end, end: selection.begin };
}

function isPoint(point: TextPoint): boolean {
	return (
		Number.isInteger(point.idx) &&
		Number.isInteger(point.offset) &&
		point.idx >= 0 &&
		point.offset >= 0
	);
}

/** 0 以上の整数で、空でない（始点 < 終点） */
export function isValidSelection(selection: PdfSelection): boolean {
	return (
		isPoint(selection.begin) &&
		isPoint(selection.end) &&
		comparePoints(selection.begin, selection.end) < 0
	);
}

/** `b,bo,e,eo`（本体の selection= と同じ並び） */
export function formatSelection(selection: PdfSelection): string {
	const { begin, end } = selection;
	return `${begin.idx},${begin.offset},${end.idx},${end.offset}`;
}

/** `b,bo,e,eo` を読む。逆向きは正規化し、空・不正なら null */
export function parseSelection(raw: string): PdfSelection | null {
	const parts = raw.split(',');
	if (parts.length !== 4 || !parts.every((part) => /^\d+$/.test(part)))
		return null;
	const [b, bo, e, eo] = parts.map(Number);
	if (
		b === undefined ||
		bo === undefined ||
		e === undefined ||
		eo === undefined
	)
		return null;
	const selection = normalizeSelection({
		begin: { idx: b, offset: bo },
		end: { idx: e, offset: eo },
	});
	return isValidSelection(selection) ? selection : null;
}

/** 位置の識別子（ページ + 範囲） */
export function selectionKey(page: number, selection: PdfSelection): string {
	const { begin, end } = selection;
	return `${page}:${begin.idx}:${begin.offset}:${end.idx}:${end.offset}`;
}

/** 割合を小数 4 桁に丸める（リンクに書く値と識別子をそろえるため） */
function roundFraction(value: number): number {
	return Math.round(value * 10000) / 10000;
}

/** 矩形の最小の幅・高さ（割合）。これより小さいものは作らない */
const MIN_REGION_SIZE = 0.002;

/** 0〜1 に収め、左上・右下の順にそろえて丸める。小さすぎれば null */
export function normalizeRegion(region: PdfRegion): PdfRegion | null {
	const values = [region.left, region.top, region.right, region.bottom];
	if (!values.every((value) => Number.isFinite(value))) return null;
	const clamp = (value: number) =>
		roundFraction(Math.min(1, Math.max(0, value)));
	const left = clamp(Math.min(region.left, region.right));
	const right = clamp(Math.max(region.left, region.right));
	const top = clamp(Math.min(region.top, region.bottom));
	const bottom = clamp(Math.max(region.top, region.bottom));
	if (right - left < MIN_REGION_SIZE || bottom - top < MIN_REGION_SIZE)
		return null;
	return { left, top, right, bottom };
}

/** `L,T,R,B`（小数 4 桁まで） */
export function formatRegion(region: PdfRegion): string {
	return [region.left, region.top, region.right, region.bottom]
		.map((value) => String(roundFraction(value)))
		.join(',');
}

/** `L,T,R,B` を読む。範囲外・小さすぎ・不正なら null */
export function parseRegion(raw: string): PdfRegion | null {
	const parts = raw.split(',');
	if (parts.length !== 4 || !parts.every((part) => /^\d*\.?\d+$/.test(part)))
		return null;
	const [left, top, right, bottom] = parts.map(Number);
	if (
		left === undefined ||
		top === undefined ||
		right === undefined ||
		bottom === undefined ||
		[left, top, right, bottom].some((value) => value > 1)
	)
		return null;
	return normalizeRegion({ left, top, right, bottom });
}

/** 位置の識別子。文字は `page:b:bo:e:eo`、矩形は `page:r:L,T,R,B`（形が違うので重ならない） */
export function anchorKey(page: number, anchor: PdfAnchor): string {
	return anchor.type === 'text'
		? selectionKey(page, anchor.selection)
		: `${page}:r:${formatRegion(anchor.region)}`;
}

/** ページ → 文字（始点・終点の順）→ 矩形（上・左の順）の順に並べる */
export function compareAnchors(
	a: { page: number; anchor: PdfAnchor },
	b: { page: number; anchor: PdfAnchor },
): number {
	if (a.page !== b.page) return a.page - b.page;
	const x = a.anchor;
	const y = b.anchor;
	if (x.type === 'text' && y.type === 'text')
		return (
			comparePoints(x.selection.begin, y.selection.begin) ||
			comparePoints(x.selection.end, y.selection.end)
		);
	if (x.type === 'region' && y.type === 'region')
		return x.region.top - y.region.top || x.region.left - y.region.left;
	return x.type === 'text' ? -1 : 1;
}

export interface TextItem {
	idx: number;
	text: string;
}

/** テキスト要素（idx と文字列）から範囲の文字列を取り出す。要素の間は separator でつなぐ */
export function extractText(
	items: readonly TextItem[],
	selection: PdfSelection,
	separator = '',
): string {
	const { begin, end } = selection;
	const parts: string[] = [];
	for (const item of [...items].sort((a, b) => a.idx - b.idx)) {
		if (item.idx < begin.idx || item.idx > end.idx) continue;
		const from = item.idx === begin.idx ? begin.offset : 0;
		const to = item.idx === end.idx ? end.offset : item.text.length;
		const part = item.text.slice(from, to);
		if (part !== '') parts.push(part);
	}
	return parts.join(separator);
}
