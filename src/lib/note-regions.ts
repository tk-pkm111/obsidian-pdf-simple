import {
	headingForm,
	headingName,
	headingSpecs,
	matchesHeading,
	parseHeadingSpec,
	type HeadingSpec,
} from './heading-spec';
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
		if (headingName(text).toLowerCase() !== EXCALIDRAW_DATA) continue;
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

/** 本文（frontmatter の次の行から、本文の最後まで） */
function bodyRange(
	lines: readonly LineInfo[],
	scan: LineScan,
): { start: number; end: number } {
	const start = bodyStartLine(lines);
	return {
		start,
		end: Math.max(start, contentEndLine(lines, scan, start)),
	};
}

/** ハイライトを入れる先にできる見出しの行か（ハイライトの見出し・コードやコメントの中・名前の無いものは除く） */
function isTargetHeading(
	lines: readonly LineInfo[],
	scan: LineScan,
	index: number,
): boolean {
	const text = lines[index]?.text ?? '';
	return (
		!scan.fenced[index] &&
		!scan.commented[index] &&
		headingLevel(text) > 0 &&
		!findBlockId(text) &&
		headingName(text) !== ''
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

/** 見出しの行 index の節（次の同じか上の階層の見出しまで。ハイライトの見出しでは終えない） */
function sectionAt(
	lines: readonly LineInfo[],
	scan: LineScan,
	index: number,
	to: number,
): InsertRegion {
	const level = headingLevel(lines[index]?.text ?? '');
	for (let j = index + 1; j < to; j++) {
		const next = lines[j]?.text ?? '';
		const nextLevel = headingLevel(next);
		if (scan.fenced[j] || scan.commented[j]) continue;
		if (nextLevel === 0 || nextLevel > level) continue;
		// 入れたハイライトの見出しで節が切れないように
		if (findBlockId(next)) continue;
		return { start: index + 1, end: j, head: index, level };
	}
	return { start: index + 1, end: to, head: index, level };
}

/**
 * ハイライトを入れる範囲: headings の指定に合う見出し（前にあるものほど優先。同じ指定ならノートの上のもの）の節。
 * どれもノートに無ければ、本文の最初から本文の最後まで。
 */
export function insertRegion(
	lines: readonly LineInfo[],
	scan: LineScan,
	headings: readonly string[],
): InsertRegion {
	const body = bodyRange(lines, scan);
	for (const value of headings) {
		const spec = parseHeadingSpec(value);
		if (!spec) continue;
		for (let i = body.start; i < body.end; i++)
			if (
				isTargetHeading(lines, scan, i) &&
				matchesHeading(spec, lines[i]?.text ?? '')
			)
				return sectionAt(lines, scan, i, body.end);
	}
	return { start: body.start, end: body.end, head: 0, level: 0 };
}

/** 指定のどれかに合う見出し（入れる先にできるもの）の形（`## Summary`）。ノートの上から順に、重ねずに */
export function findHeadings(
	content: string,
	specs: readonly HeadingSpec[],
): string[] {
	const lines = splitLines(content);
	const scan = scanLines(lines);
	const body = bodyRange(lines, scan);
	const found: string[] = [];
	for (let i = body.start; i < body.end; i++) {
		const text = lines[i]?.text ?? '';
		if (!isTargetHeading(lines, scan, i)) continue;
		if (!specs.some((spec) => matchesHeading(spec, text))) continue;
		const form = headingForm(text);
		if (!found.includes(form)) found.push(form);
	}
	return found;
}

/**
 * ハイライトを入れる見出しを決める。
 * - そのノートで決めた見出し（own）がノートにあれば、それ
 * - 無ければ、設定の見出し（1 行に 1 つ）のうちノートにあるもの。1 つならそれ、無ければ null（本文の最後）
 * - 2 つ以上なら choices（どれに入れるかを聞く）
 */
export function resolveInsertHeading(
	content: string,
	own: string | null,
	settings: string,
): { heading: string | null } | { choices: string[] } {
	const ownSpec = own === null ? null : parseHeadingSpec(own);
	if (ownSpec && findHeadings(content, [ownSpec]).length > 0)
		return { heading: own };
	const found = findHeadings(content, headingSpecs(settings));
	return found.length > 1
		? { choices: found }
		: { heading: found[0] ?? null };
}

/**
 * その行が、ハイライトを入れる先にできる見出しなら、その形（`## Summary`。無ければ null）。
 * ハイライトの見出し・本文の最後より後ろ（Excalidraw のデータなど）・コードやコメントの中は除く。
 */
export function targetHeadingAt(content: string, index: number): string | null {
	const lines = splitLines(content);
	const scan = scanLines(lines);
	const body = bodyRange(lines, scan);
	if (index < body.start || index >= body.end) return null;
	if (!isTargetHeading(lines, scan, index)) return null;
	return headingForm(lines[index]?.text ?? '');
}
