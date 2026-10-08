import { findBlockId } from './highlight-entry';
import {
	LIST_ITEM,
	blockStart,
	eolOf,
	headingLevel,
	isBlank,
	splitLines,
	type LineInfo,
	type TextEdit,
} from './note-lines';
import {
	insertRegion,
	scanLines,
	type InsertRegion,
	type LineScan,
} from './note-regions';

/**
 * ハイライトの行をノートに足す編集。
 * 1 件は 1 段落（前後に空行）。箇条書きにする設定のときだけ、箇条書きどうしを詰めて続ける。
 * 入れる場所は、指定した見出しの節か、本文の最後（Excalidraw のデータなどの手前）まで（note-regions）。
 * その中で、PDF の順に並べるか、最後に足す。
 */

/** PDF の中の位置: ページと、そのページの中の読む順（大きいほど後ろ） */
export interface OrderKey {
	page: number;
	pos: number;
}

export function compareOrder(a: OrderKey, b: OrderKey): number {
	return a.page - b.page || a.pos - b.pos;
}

/** PDF の順に入れるための位置: 新しいハイライトの位置と、ノートの行の ID → 位置（比べられなければ null） */
export interface InsertOrder {
	key: OrderKey;
	keyOf: (id: string) => OrderKey | null;
}

export interface InsertTarget {
	/** 入れる見出しの名前（前にあるものほど優先。ノートに無ければ次。どれも無ければ本文の最後） */
	headings: readonly string[];
	/** PDF の順に並べるときの位置（null なら入れる場所の最後に足す） */
	order: InsertOrder | null;
}

/** [from, to) の中で最後の空でない行（無ければ -1） */
function lastNonBlank(
	lines: readonly LineInfo[],
	from: number,
	to: number,
): number {
	for (let i = to - 1; i >= Math.max(0, from); i--)
		if (!isBlank(lines[i])) return i;
	return -1;
}

/** lastIndex の行の後ろに 1 行足す。箇条書きの後ろに箇条書きを足すときだけ空行を挟まない */
function insertAfter(
	lines: readonly LineInfo[],
	lastIndex: number,
	line: string,
	eol: string,
): TextEdit {
	const previous = lines[lastIndex];
	if (!previous) {
		// 前に何も無い: 文書の先頭に入れ、すぐ後ろに文（Excalidraw のデータなど）があれば空行を挟む
		const first = lines[0];
		const gap = first && !isBlank(first) ? eol + eol : eol;
		return { from: 0, to: 0, insert: `${line}${gap}` };
	}
	const tight = LIST_ITEM.test(line) && LIST_ITEM.test(previous.text);
	let insert = `${tight ? eol : eol + eol}${line}`;
	// 直後に空でない行（次の見出しなど）が続くなら空行を挟む
	const following = lines[lastIndex + 1];
	if (following && !isBlank(following)) insert += eol;
	return { from: previous.end, to: previous.end, insert };
}

/** index の行の手前に 1 行足す（前後を空行で区切る。箇条書きどうしは詰める） */
function insertBefore(
	lines: readonly LineInfo[],
	index: number,
	line: string,
	eol: string,
): TextEdit {
	const target = lines[index];
	if (!target) return { from: 0, to: 0, insert: `${line}${eol}` };
	const previous = lines[index - 1];
	const list = LIST_ITEM.test(line);
	const after = list && LIST_ITEM.test(target.text) ? eol : eol + eol;
	const tightBefore = list && previous && LIST_ITEM.test(previous.text);
	const before = previous && !isBlank(previous) && !tightBefore ? eol : '';
	return {
		from: target.start,
		to: target.start,
		insert: `${before}${line}${after}`,
	};
}

/**
 * 見出しの行を、節の見出し（level）より深くする（`# x` は、## の節なら `### x`）。
 * 浅いままだと、そこで節が終わったように見える。
 */
function deepenHeading(line: string, level: number): string {
	const current = headingLevel(line);
	if (current === 0 || level === 0) return line;
	return line.replace(
		/^\s{0,3}#{1,6}/,
		'#'.repeat(Math.min(6, level + current)),
	);
}

/** 先行の行の後ろで、足してよい範囲の終わり: 見出しなら同じか上の階層の次の見出し、文なら次の見出し */
function itemEnd(
	lines: readonly LineInfo[],
	scan: LineScan,
	index: number,
	level: number,
	limit: number,
): number {
	for (let i = index + 1; i < limit; i++) {
		if (scan.fenced[i] || scan.commented[i]) continue;
		const lineLevel = headingLevel(lines[i]?.text ?? '');
		if (lineLevel > 0 && (level === 0 || lineLevel <= level)) return i;
	}
	return limit;
}

/**
 * 入れる場所の中で、PDF の順に並ぶ位置（章の見出しを先に引いておけば、本文はその章の下に入る）。
 * - 場所の中のハイライトのうち、PDF でこれより後ろにある最初のもの（後続）の手前に入れる
 * - 後続が無ければ、いちばん後ろのハイライト（先行）の後ろに入れる。先行が見出しならその節の終わり、
 *   文や画像なら次の見出しの手前まで（先行のあとに書いた自分の文の後ろ）
 * - 比べられるハイライトが場所の中に無ければ null（場所の最後に足す）
 */
function planOrdered(
	lines: readonly LineInfo[],
	scan: LineScan,
	region: InsertRegion,
	line: string,
	order: InsertOrder,
	eol: string,
): TextEdit | null {
	const items: Array<{ index: number; key: OrderKey; level: number }> = [];
	for (let i = region.start; i < region.end; i++) {
		if (scan.fenced[i] || scan.commented[i]) continue;
		const text = lines[i]?.text ?? '';
		const match = findBlockId(text);
		const key = match ? order.keyOf(match.id) : null;
		if (key) items.push({ index: i, key, level: headingLevel(text) });
	}
	const successor = items.find(
		(item) => compareOrder(item.key, order.key) > 0,
	);
	if (successor) {
		const start = blockStart(lines, scan.fenced, successor.index);
		return insertBefore(lines, Math.max(region.start, start), line, eol);
	}
	let last: (typeof items)[number] | null = null;
	for (const item of items)
		if (!last || compareOrder(item.key, last.key) >= 0) last = item;
	if (!last) return null;
	const end = itemEnd(lines, scan, last.index, last.level, region.end);
	return insertAfter(lines, lastNonBlank(lines, last.index, end), line, eol);
}

/**
 * ハイライトの行を足す位置と文字列（既存の文字は変えない）。
 * 見出しの節に入れるときは、見出しの行をその節より深くする。
 */
export function planInsertHighlight(
	content: string,
	line: string,
	target: InsertTarget,
): TextEdit {
	const eol = eolOf(content);
	const lines = splitLines(content);
	const scan = scanLines(lines);
	const region = insertRegion(lines, scan, target.headings);
	const text = deepenHeading(line, region.level);
	const ordered = target.order
		? planOrdered(lines, scan, region, text, target.order, eol)
		: null;
	return (
		ordered ??
		insertAfter(
			lines,
			lastNonBlank(lines, region.head, region.end),
			text,
			eol,
		)
	);
}
