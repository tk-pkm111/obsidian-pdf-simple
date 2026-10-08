import { findBlockId } from './highlight-entry';
import {
	LIST_ITEM,
	blockStart,
	bodyStartLine,
	eolOf,
	fencedLines,
	headingLevel,
	isBlank,
	splitLines,
	type LineInfo,
	type TextEdit,
} from './note-lines';

/**
 * ハイライトの行をノートに足す編集。
 * 1 件は 1 段落（前後に空行）。箇条書きにする設定のときだけ、箇条書きどうしを詰めて続ける。
 * 足す位置は、PDF の順（planInsertOrdered）か、ノートの末尾・指定した見出しの下（planInsertLine）。
 */

/** 設定の見出し（`## ハイライト`）。# が無ければ ## を付ける */
export function normalizeHeading(heading: string): string {
	const trimmed = heading.trim();
	if (trimmed === '') return '## ハイライト';
	return headingLevel(trimmed) > 0 ? trimmed : `## ${trimmed}`;
}

/** 見出しの行と、その節の終わり（次の同じか上の階層の見出し。無ければ行数）。コードブロックの中は見ない */
function findSection(
	lines: readonly LineInfo[],
	bodyStart: number,
	heading: string,
): { headingLine: number; endLine: number } | null {
	const level = headingLevel(heading);
	const fenced = fencedLines(lines);
	let found = -1;
	for (let i = bodyStart; i < lines.length; i++) {
		if (fenced[i]) continue;
		const text = lines[i]?.text ?? '';
		const lineLevel = headingLevel(text);
		if (lineLevel === 0) continue;
		if (found < 0) {
			if (text.trim() === heading) found = i;
		} else if (lineLevel <= level) {
			return { headingLine: found, endLine: i };
		}
	}
	return found < 0 ? null : { headingLine: found, endLine: lines.length };
}

/** [from, to) の中で最後の空でない行（無ければ -1） */
function lastNonBlank(
	lines: readonly LineInfo[],
	from: number,
	to: number,
): number {
	for (let i = to - 1; i >= from; i--) if (!isBlank(lines[i])) return i;
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
	if (!previous) return { from: 0, to: 0, insert: `${line}${eol}` };
	const tight = LIST_ITEM.test(line) && LIST_ITEM.test(previous.text);
	let insert = `${tight ? eol : eol + eol}${line}`;
	// 直後に空でない行（次の見出しなど）が続くなら空行を挟む
	const following = lines[lastIndex + 1];
	if (following && !isBlank(following)) insert += eol;
	return { from: previous.end, to: previous.end, insert };
}

export interface InsertOptions {
	/** order（PDF の順）で比べられるハイライトがノートに無いときは end と同じ */
	position: 'order' | 'end' | 'heading';
	heading: string;
}

/** ハイライトの行を足す位置と文字列（既存の文字は変えない） */
export function planInsertLine(
	content: string,
	line: string,
	options: InsertOptions,
): TextEdit {
	const eol = eolOf(content);
	const lines = splitLines(content);
	if (options.position === 'heading') {
		const heading = normalizeHeading(options.heading);
		const section = findSection(lines, bodyStartLine(lines), heading);
		if (section) {
			const last = lastNonBlank(
				lines,
				section.headingLine,
				section.endLine,
			);
			return insertAfter(lines, last, line, eol);
		}
		const last = lastNonBlank(lines, 0, lines.length);
		const block = `${heading}${eol}${eol}${line}`;
		const previous = lines[last];
		return previous
			? {
					from: previous.end,
					to: previous.end,
					insert: `${eol}${eol}${block}`,
				}
			: { from: 0, to: 0, insert: `${block}${eol}` };
	}
	return insertAfter(lines, lastNonBlank(lines, 0, lines.length), line, eol);
}

/**
 * 見出しモードで足す見出しの大きさ。「見出しの下に追記」のときは、追記先の見出しより深くする
 * （浅いと、そこで追記先の節が終わってしまい、次からの追記がその手前に入る）。
 */
export function headingLevelInSection(
	level: number,
	options: InsertOptions,
): number {
	const base =
		options.position === 'heading'
			? headingLevel(normalizeHeading(options.heading))
			: 0;
	return Math.min(6, Math.max(1, base + level));
}

/** PDF の中の位置: ページと、そのページの中の読む順（大きいほど後ろ） */
export interface OrderKey {
	page: number;
	pos: number;
}

export function compareOrder(a: OrderKey, b: OrderKey): number {
	return a.page - b.page || a.pos - b.pos;
}

/** 先行の行の後ろで、足してよい範囲の終わり: 見出しなら同じか上の階層の次の見出し、文なら次の見出し */
function regionEnd(
	lines: readonly LineInfo[],
	fenced: readonly boolean[],
	index: number,
	level: number,
): number {
	for (let i = index + 1; i < lines.length; i++) {
		if (fenced[i]) continue;
		const lineLevel = headingLevel(lines[i]?.text ?? '');
		if (lineLevel > 0 && (level === 0 || lineLevel <= level)) return i;
	}
	return lines.length;
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
 * ハイライトの行を、PDF の順に並ぶ位置に足す（章の見出しを先に引いておけば、本文はその章の下に入る）。
 * - ノートの中で、PDF でこれより後ろにあるハイライトのうち最初のもの（後続）の手前に入れる
 * - 後続が無ければ、いちばん後ろのハイライト（先行）の後ろに入れる。先行が見出しならその節の終わり、
 *   文や画像なら次の見出しの手前まで（先行のあとに書いた自分の文の後ろ）
 * - 比べられるハイライトがノートに無ければ fallback（末尾・見出しの下）
 * keyOf はノートの行の ID → PDF の中の位置（別の PDF のものなど、比べられなければ null）。
 */
export function planInsertOrdered(
	content: string,
	line: string,
	key: OrderKey,
	keyOf: (id: string) => OrderKey | null,
	fallback: InsertOptions,
): TextEdit {
	const eol = eolOf(content);
	const lines = splitLines(content);
	const fenced = fencedLines(lines);
	const items: Array<{ index: number; key: OrderKey; level: number }> = [];
	for (let i = bodyStartLine(lines); i < lines.length; i++) {
		if (fenced[i]) continue;
		const text = lines[i]?.text ?? '';
		const match = findBlockId(text);
		const itemKey = match ? keyOf(match.id) : null;
		if (itemKey)
			items.push({ index: i, key: itemKey, level: headingLevel(text) });
	}
	const successor = items.find((item) => compareOrder(item.key, key) > 0);
	if (successor)
		return insertBefore(
			lines,
			blockStart(lines, fenced, successor.index),
			line,
			eol,
		);
	let last: (typeof items)[number] | null = null;
	for (const item of items)
		if (!last || compareOrder(item.key, last.key) >= 0) last = item;
	if (!last) return planInsertLine(content, line, fallback);
	const end = regionEnd(lines, fenced, last.index, last.level);
	return insertAfter(lines, lastNonBlank(lines, last.index, end), line, eol);
}
