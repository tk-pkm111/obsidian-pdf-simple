import { findBlockId } from './highlight-entry';

/**
 * ノートの本文への変更（純粋な文字列操作）の共通部分。
 * Editor でも Vault.process でも同じ結果になるよう、「元の文字列の位置に対する編集」の形で扱う。
 */

export interface TextEdit {
	from: number;
	to: number;
	insert: string;
}

/** 重ならない編集をまとめて適用する（位置はすべて元の文字列に対するもの） */
export function applyEdits(
	content: string,
	edits: readonly TextEdit[],
): string {
	let out = content;
	for (const edit of [...edits].sort((a, b) => b.from - a.from))
		out = out.slice(0, edit.from) + edit.insert + out.slice(edit.to);
	return out;
}

export interface LineInfo {
	text: string;
	/** 行頭の位置 */
	start: number;
	/** 行末（改行の手前）の位置 */
	end: number;
	/** 次の行の行頭（最後の行なら文字列の長さ） */
	next: number;
}

export function splitLines(content: string): LineInfo[] {
	const lines: LineInfo[] = [];
	let start = 0;
	for (;;) {
		const newline = content.indexOf('\n', start);
		if (newline < 0) {
			lines.push({
				text: content.slice(start),
				start,
				end: content.length,
				next: content.length,
			});
			return lines;
		}
		const end =
			newline > start && content.charAt(newline - 1) === '\r'
				? newline - 1
				: newline;
		lines.push({
			text: content.slice(start, end),
			start,
			end,
			next: newline + 1,
		});
		start = newline + 1;
	}
}

export function eolOf(content: string): string {
	return content.includes('\r\n') ? '\r\n' : '\n';
}

export function isBlank(line: LineInfo | undefined): boolean {
	return line !== undefined && line.text.trim() === '';
}

/** 箇条書き・番号付きリストの行 */
export const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;

/** ATX 見出しの大きさ（見出しでなければ 0） */
export function headingLevel(text: string): number {
	return /^\s{0,3}(#{1,6})(?:[ \t]|$)/.exec(text)?.[1]?.length ?? 0;
}

/** frontmatter の次の行（frontmatter が無ければ 0） */
export function bodyStartLine(lines: readonly LineInfo[]): number {
	if (lines[0]?.text.trimEnd() !== '---') return 0;
	for (let i = 1; i < lines.length; i++)
		if (lines[i]?.text.trimEnd() === '---') return i + 1;
	return 0;
}

/** コードブロック（``` / ~~~ で囲んだ部分。囲みの行も含む）の行なら true */
export function fencedLines(lines: readonly LineInfo[]): boolean[] {
	const fenced: boolean[] = [];
	let fence: string | null = null;
	for (const line of lines) {
		const marker = FENCE.exec(line.text)?.[1]?.charAt(0) ?? null;
		if (marker !== null && (fence === null || fence === marker)) {
			fenced.push(true);
			fence = fence === null ? marker : null;
			continue;
		}
		fenced.push(fence !== null);
	}
	return fenced;
}

/**
 * その行を含むブロックの最初の行: 段落なら上へ空行・見出し・コードの手前まで、
 * 箇条書きの項目の続きの行ならその項目の行。見出しと箇条書きの項目の行はその行。
 */
export function blockStart(
	lines: readonly LineInfo[],
	fenced: readonly boolean[],
	index: number,
): number {
	const text = lines[index]?.text ?? '';
	if (headingLevel(text) > 0 || LIST_ITEM.test(text)) return index;
	let start = index;
	for (;;) {
		const previous = lines[start - 1];
		if (
			!previous ||
			isBlank(previous) ||
			fenced[start - 1] ||
			headingLevel(previous.text) > 0
		)
			return start;
		start--;
		if (LIST_ITEM.test(previous.text)) return start;
	}
}

/** その ID のブロック ID が付いた行（0 始まり） */
export function findHighlightLines(content: string, id: string): number[] {
	const target = id.toLowerCase();
	const found: number[] = [];
	splitLines(content).forEach((line, index) => {
		if (findBlockId(line.text)?.id === target) found.push(index);
	});
	return found;
}

/** 文字列の位置 → 行と列（0 始まり） */
export function offsetToLineCh(
	content: string,
	offset: number,
): { line: number; ch: number } {
	const before = content.slice(0, offset);
	const line = before.split('\n').length - 1;
	return { line, ch: offset - (before.lastIndexOf('\n') + 1) };
}
