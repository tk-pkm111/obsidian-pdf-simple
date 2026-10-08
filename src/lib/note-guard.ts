import { findBlockId } from './highlight-entry';
import {
	LIST_ITEM,
	bodyStartLine,
	eolOf,
	fencedLines,
	headingLevel,
	splitLines,
	type TextEdit,
} from './note-lines';

/**
 * ハイライトの行の ID（`^hl-…`）が効かなくならないように直す編集（エディタで手が止まったときに当てる）。
 * Obsidian はブロック ID を「段落の最後の行の行末」でしか認識しないので、
 * - すぐ下に文が続いて 1 つの段落になる
 * - ID の後ろ（行末）に文を書き足す
 * と、その ID は効かなくなり、PDF 上のハイライトも消えてしまう。
 */

/** 文中に残った ID（後ろに文が続いているもの） */
const INNER_ID = /\s\^(hl-[a-z0-9-]+)(?=\s)/i;

/** ハイライトの段落・箇条書きの直後に置くと、同じ段落の続きとして読まれてしまう行か */
function continuesParagraph(text: string): boolean {
	if (text.trim() === '') return false;
	if (LIST_ITEM.test(text) || headingLevel(text) > 0) return false;
	if (/^\s{0,3}>/.test(text)) return false;
	if (/^\s{0,3}(?:`{3,}|~{3,})/.test(text)) return false;
	// 区切り線と、前の行を見出しにする下線（---・===）
	if (/^\s{0,3}([-*_=])(?:\s*\1){2,}\s*$/.test(text)) return false;
	return true;
}

/** lines が無ければすべて、あればその行か、そのすぐ上の行がハイライトのところだけを見る */
function near(lines: ReadonlySet<number> | undefined, index: number): boolean {
	return !lines || lines.has(index) || lines.has(index + 1);
}

/**
 * ハイライトの行（段落・箇条書き。見出しは除く）のすぐ下に普通の文が続いていたら、間に空行を入れる編集。
 * lines を渡すと、編集した場所の近くだけ直す。
 */
export function planSeparateHighlights(
	content: string,
	isHighlight: (id: string) => boolean,
	lines?: ReadonlySet<number>,
): TextEdit[] {
	const eol = eolOf(content);
	const all = splitLines(content);
	const fenced = fencedLines(all);
	const edits: TextEdit[] = [];
	for (let i = bodyStartLine(all); i < all.length - 1; i++) {
		if (!near(lines, i)) continue;
		const line = all[i];
		const next = all[i + 1];
		if (!line || !next || fenced[i] || fenced[i + 1]) continue;
		const match = findBlockId(line.text);
		if (!match || !isHighlight(match.id) || headingLevel(line.text) > 0)
			continue;
		if (!continuesParagraph(next.text)) continue;
		edits.push({ from: line.end, to: line.end, insert: eol });
	}
	return edits;
}

/**
 * ID の後ろに書き足された文を、ID の前へ移す編集（`文 ^hl-x 追記` → `文 追記 ^hl-x`）。
 * ノートでは ID を点に置き換えて見せているので、行末（点の後ろ）にカーソルを置いて書くとこうなる。
 */
export function planMoveIdToLineEnd(
	content: string,
	isHighlight: (id: string) => boolean,
	lines?: ReadonlySet<number>,
): TextEdit[] {
	const all = splitLines(content);
	const fenced = fencedLines(all);
	const edits: TextEdit[] = [];
	for (let i = bodyStartLine(all); i < all.length; i++) {
		if (lines && !lines.has(i)) continue;
		const line = all[i];
		if (!line || fenced[i] || findBlockId(line.text)) continue;
		const match = INNER_ID.exec(line.text);
		const id = match?.[1];
		if (!match || id === undefined || !isHighlight(id.toLowerCase()))
			continue;
		const from = line.start + match.index;
		const to = from + match[0].length;
		edits.push(
			{ from, to, insert: '' },
			{ from: line.end, to: line.end, insert: match[0] },
		);
	}
	return edits;
}
