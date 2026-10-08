import {
	formatRegion,
	formatSelection,
	parseRegion,
	parseSelection,
} from './pdf-selection';
import type { PdfRegion, PdfSelection, PdfSubpath } from './types';

/**
 * PDF へのリンクのサブパス `#page=3&selection=12,0,14,20&color=yellow&id=hl-k9f2`。
 * 範囲を画像として取り込んだものは selection の代わりに `region=L,T,R,B`（ページに対する割合）。
 * 本体のビューアは page と selection だけを読み（URLSearchParams）、region・color・id は無視する。
 */

const COLOR_NAME = /^[a-z][a-z0-9-]{0,31}$/;
const HIGHLIGHT_ID = /^hl-[a-z0-9-]{1,40}$/;

/** 色の名前としてリンクに書ける文字列か（英小文字・数字・ハイフン。URL エンコード不要） */
export function isColorName(value: string): boolean {
	return COLOR_NAME.test(value);
}

/** このプラグインのハイライト ID か（`hl-` + 英小文字・数字） */
export function isHighlightId(value: string): boolean {
	return HIGHLIGHT_ID.test(value);
}

/** `a=1&b=2` を並びのまま [key, value] に分ける（値はデコードしない） */
export function splitParams(query: string): Array<[string, string]> {
	const params: Array<[string, string]> = [];
	for (const part of query.split('&')) {
		if (part === '') continue;
		const eq = part.indexOf('=');
		params.push(
			eq < 0 ? [part, ''] : [part.slice(0, eq), part.slice(eq + 1)],
		);
	}
	return params;
}

function withoutHash(subpath: string): string {
	return subpath.startsWith('#') ? subpath.slice(1) : subpath;
}

export function parsePdfSubpath(subpath: string): PdfSubpath {
	const params = splitParams(withoutHash(subpath));
	const get = (key: string): string | null =>
		params.find(([name]) => name === key)?.[1] ?? null;

	const pageRaw = get('page');
	const page =
		pageRaw !== null && /^\d+$/.test(pageRaw) && Number(pageRaw) >= 1
			? Number(pageRaw)
			: null;
	const selectionRaw = get('selection');
	const regionRaw = get('region');
	const colorRaw = get('color');
	const idRaw = get('id');
	return {
		page,
		selection: selectionRaw === null ? null : parseSelection(selectionRaw),
		region: regionRaw === null ? null : parseRegion(regionRaw),
		color: colorRaw !== null && isColorName(colorRaw) ? colorRaw : null,
		id: idRaw !== null && isHighlightId(idRaw) ? idRaw : null,
		params,
	};
}

/** 書き込むときの並びは page, selection（または region）, color, id */
export function formatPdfSubpath(parts: {
	page: number;
	selection?: PdfSelection | null;
	region?: PdfRegion | null;
	color?: string | null;
	id?: string | null;
}): string {
	let subpath = `#page=${parts.page}`;
	if (parts.selection)
		subpath += `&selection=${formatSelection(parts.selection)}`;
	else if (parts.region) subpath += `&region=${formatRegion(parts.region)}`;
	if (parts.color) subpath += `&color=${parts.color}`;
	if (parts.id) subpath += `&id=${parts.id}`;
	return subpath;
}

/** key の値を置き換える（無ければ末尾に足す、null なら消す）。ほかのパラメータは並びも含めてそのまま */
export function setParam(
	subpath: string,
	key: string,
	value: string | null,
): string {
	const out: Array<[string, string]> = [];
	let written = false;
	for (const [name, current] of splitParams(withoutHash(subpath))) {
		if (name !== key) {
			out.push([name, current]);
			continue;
		}
		if (written || value === null) continue;
		out.push([name, value]);
		written = true;
	}
	if (!written && value !== null) out.push([key, value]);
	return `#${out.map(([name, current]) => `${name}=${current}`).join('&')}`;
}
