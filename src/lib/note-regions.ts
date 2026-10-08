import { findBlockId } from './highlight-entry';
import {
	bodyStartLine,
	headingLevel,
	isBlank,
	splitLines,
	type LineInfo,
} from './note-lines';

/**
 * ノートの中で、ハイライトを入れてよい範囲。
 * - 本文の最後は、末尾の特別な部分の手前: Excalidraw のデータ（`# Excalidraw Data` から後ろ）と、
 *   末尾の %% コメント（ほかのプラグインの設定など）。そこより後ろに書くと、Excalidraw が保存し直すときに
 *   消えたり、コメントの中に入って見えなくなったりする
 * - 入れる見出しが決まっていて、ノートにあれば、その見出しの節（本文の最後まで）
 */

const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const COMMENT = '%%';
const EXCALIDRAW_DATA = 'excalidraw data';

/** 行ごとの、コードブロックと %% コメントの状態 */
export interface LineScan {
	/** コードブロックの行（囲みの行も含む。コメントの中の ``` は数えない） */
	fenced: boolean[];
	/** 行頭が %% コメントの中 */
	commented: boolean[];
	/** コメントを除くと何も無い行（空行も含む。コードブロックの行は含まない） */
	empty: boolean[];
}

export function scanLines(lines: readonly LineInfo[]): LineScan {
	const scan: LineScan = { fenced: [], commented: [], empty: [] };
	let fence: string | null = null;
	let comment = false;
	for (const line of lines) {
		scan.commented.push(comment);
		if (!comment) {
			const marker = FENCE.exec(line.text)?.[1]?.charAt(0) ?? null;
			if (fence !== null || marker !== null) {
				scan.fenced.push(true);
				scan.empty.push(false);
				if (fence === null) fence = marker;
				else if (marker === fence) fence = null;
				continue;
			}
		}
		scan.fenced.push(false);
		let visible = '';
		line.text.split(COMMENT).forEach((part, i) => {
			if (i > 0) comment = !comment;
			if (!comment) visible += part;
		});
		scan.empty.push(visible.trim() === '');
	}
	return scan;
}

/** 見出しの行の名前（行頭の #、末尾の # の並びとブロック ID を除く） */
export function headingName(text: string): string {
	return text
		.replace(/^\s{0,3}#{1,6}(?=[ \t]|$)/, '')
		.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/, '')
		.replace(/(?:^|[ \t])#+[ \t]*$/, '')
		.trim();
}

/** 見出しの名前を比べる形（前の # を除き、空白を 1 つにし、小文字に）。設定に `## Summary` と書いてもよい */
export function headingKey(name: string): string {
	return name
		.trim()
		.replace(/^#+/, '')
		.replace(/\s+/g, ' ')
		.trim()
		.toLowerCase();
}

/** コメントの中の行 index について、そのコメントが始まった行 */
function commentOpening(scan: LineScan, index: number, from: number): number {
	let i = index;
	while (i > from && scan.commented[i]) i--;
	return i;
}

/** `# Excalidraw Data` の行（%% の中にあれば、そのコメントの最初の行）。無ければ行数 */
function excalidrawStart(
	lines: readonly LineInfo[],
	scan: LineScan,
	from: number,
): number {
	for (let i = from; i < lines.length; i++) {
		const text = lines[i]?.text ?? '';
		if (scan.fenced[i] || headingLevel(text) === 0) continue;
		if (headingKey(headingName(text)) !== EXCALIDRAW_DATA) continue;
		return scan.commented[i] ? commentOpening(scan, i, from) : i;
	}
	return lines.length;
}

/** 末尾の %% コメント（後ろに空行しか無いもの。続けて並ぶものはまとめて）の最初の行。無ければ行数 */
function trailingCommentStart(
	lines: readonly LineInfo[],
	scan: LineScan,
	from: number,
): number {
	let start = lines.length;
	for (let i = lines.length - 1; i >= from; i--) {
		if (!scan.empty[i]) break;
		if (scan.commented[i] || !isBlank(lines[i])) start = i;
	}
	// 文の後ろから始まったコメント（`文 %%`）なら、その行の手前（行の後ろはコメントの中）
	return start < lines.length && scan.commented[start]
		? Math.max(from, start - 1)
		: start;
}

/** 本文の最後（この行より前に入れる）: Excalidraw のデータか、末尾の %% コメントの最初の行。無ければ行数 */
export function contentEndLine(
	lines: readonly LineInfo[],
	scan: LineScan,
	bodyStart: number,
): number {
	return Math.min(
		excalidrawStart(lines, scan, bodyStart),
		trailingCommentStart(lines, scan, bodyStart),
	);
}

/** ハイライトを入れてよい範囲 */
export interface InsertRegion {
	/** 入れてよい行 [start, end) */
	start: number;
	end: number;
	/** 最後に足すときは、[head, end) の最後の空でない行の後ろに足す（見出しの節なら見出しの行） */
	head: number;
	/** 見出しの節なら、その見出しの大きさ（0 なら本文の最後まで） */
	level: number;
}

/** key の名前の見出しの節（次の同じか上の階層の見出しまで。ハイライトの見出しでは終えない） */
function findSection(
	lines: readonly LineInfo[],
	scan: LineScan,
	from: number,
	to: number,
	key: string,
): InsertRegion | null {
	const skip = (i: number) => scan.fenced[i] || scan.commented[i];
	for (let i = from; i < to; i++) {
		const text = lines[i]?.text ?? '';
		const level = headingLevel(text);
		if (skip(i) || level === 0 || findBlockId(text)) continue;
		if (headingKey(headingName(text)) !== key) continue;
		let end = to;
		for (let j = i + 1; j < to; j++) {
			const next = lines[j]?.text ?? '';
			const nextLevel = headingLevel(next);
			if (skip(j) || nextLevel === 0 || nextLevel > level) continue;
			// 入れたハイライトの見出しで節が切れないように
			if (findBlockId(next)) continue;
			end = j;
			break;
		}
		return { start: i + 1, end, head: i, level };
	}
	return null;
}

/**
 * ハイライトを入れる範囲: headings の名前の見出し（前にあるものほど優先）の節。
 * どれもノートに無ければ、本文の最初から本文の最後まで。
 */
export function insertRegion(
	lines: readonly LineInfo[],
	scan: LineScan,
	headings: readonly string[],
): InsertRegion {
	const bodyStart = bodyStartLine(lines);
	const end = Math.max(bodyStart, contentEndLine(lines, scan, bodyStart));
	for (const name of headings) {
		const key = headingKey(name);
		if (key === '') continue;
		const section = findSection(lines, scan, bodyStart, end, key);
		if (section) return section;
	}
	return { start: bodyStart, end, head: 0, level: 0 };
}

/**
 * その行が、ハイライトを入れる先にできる見出しなら、その名前（無ければ null）。
 * ハイライトの見出し・本文の最後より後ろ（Excalidraw のデータなど）・コードやコメントの中は除く。
 */
export function targetHeadingAt(content: string, index: number): string | null {
	const lines = splitLines(content);
	const scan = scanLines(lines);
	const bodyStart = bodyStartLine(lines);
	if (index < bodyStart || index >= contentEndLine(lines, scan, bodyStart))
		return null;
	const text = lines[index]?.text ?? '';
	if (scan.fenced[index] || scan.commented[index]) return null;
	if (headingLevel(text) === 0 || findBlockId(text)) return null;
	const name = headingName(text);
	return name === '' ? null : name;
}
