import { findBlockId } from './highlight-entry';
import {
	blockStart,
	bodyStartLine,
	eolOf,
	fencedLines,
	isBlank,
	splitLines,
	type LineInfo,
	type TextEdit,
} from './note-lines';
import { normalizeSelectedText, textKey } from './text';

/**
 * ハイライトを本文から外す編集と、見出しの大きさを変える編集。
 * ハイライトの文は複数行の段落のこともある（PDF の段落・箇条書きの切れ目を改行で残すため）。
 * ID はその段落の最後の行の行末にある。
 */

/**
 * 外し方。
 * - line: 文ごと消す（ノートの右クリック「ハイライトを削除」など、ノートを見ながら選んだとき）
 * - unlink: ID だけ外して文を残す（PDF とのつながりを外す）
 * - match: PDF 側から消すとき。文が expected（PDF の文字）と同じなら文ごと、書き換えられていれば ID だけ外す
 */
export type RemoveMode =
	| { type: 'line' }
	| { type: 'unlink' }
	| { type: 'match'; expected: string | null };

export interface RemovePlan {
	edits: TextEdit[];
	/** 文を残したところがあるか */
	kept: boolean;
}

const PREFIX = /^(\s*(?:(?:[-*+]|\d+[.)])\s+)?(?:\[.\]\s+)?)/;
const HEADING_MARK = /^#{1,6}[ \t]+/;
const LEGACY_SPAN = /==((?:(?!==).)+)==/g;

/** 行を、行頭の記号・見出しの #・本文に分ける（end より後ろは見ない） */
function splitLine(
	text: string,
	end: number,
): { prefix: string; heading: string; body: string } {
	const before = text.slice(0, end);
	const prefix = PREFIX.exec(before)?.[1] ?? '';
	const rest = before.slice(prefix.length);
	const heading = HEADING_MARK.exec(rest)?.[0] ?? '';
	return { prefix, heading, body: rest.slice(heading.length) };
}

/** from〜to 行目を消す編集（空行に挟まれていれば、前の空行ごと消して空行が 2 つ続かないようにする） */
function deleteLines(
	lines: readonly LineInfo[],
	from: number,
	to: number,
): TextEdit {
	const first = lines[from];
	const last = lines[to];
	if (!first || !last) return { from: 0, to: 0, insert: '' };
	const previous = lines[from - 1];
	const following = lines[to + 1];
	if (previous && isBlank(previous) && (!following || isBlank(following)))
		return { from: previous.start, to: last.next, insert: '' };
	// 先頭の行で直後が空行なら、その空行も消す
	if (!previous && following && isBlank(following))
		return { from: first.start, to: following.next, insert: '' };
	return { from: first.start, to: last.next, insert: '' };
}

/** 重なった削除をまとめる */
function mergeEdits(edits: TextEdit[]): TextEdit[] {
	const sorted = [...edits].sort((a, b) => a.from - b.from);
	const merged: TextEdit[] = [];
	for (const edit of sorted) {
		const last = merged[merged.length - 1];
		if (last && edit.from < last.to) {
			last.to = Math.max(last.to, edit.to);
			last.insert = last.insert + edit.insert;
			continue;
		}
		merged.push({ ...edit });
	}
	return merged;
}

/** start〜index 行目の文（記号・見出しの #・ID を除く） */
function blockText(
	lines: readonly LineInfo[],
	start: number,
	index: number,
	idFrom: number,
): string {
	const parts: string[] = [];
	for (let i = start; i <= index; i++) {
		const text = lines[i]?.text ?? '';
		parts.push(splitLine(text, i === index ? idFrom : text.length).body);
	}
	return parts.join('\n');
}

/**
 * PDF の文字と同じ文の行（下から数えて最小の範囲）の最初の行。見つからなければ null。
 * 段落の上に自分で書いた文が続いていても、そこは残す。
 */
function matchingStart(
	lines: readonly LineInfo[],
	start: number,
	index: number,
	idFrom: number,
	expected: string,
): number | null {
	const want = textKey(expected);
	for (let k = index; k >= start; k--)
		if (textKey(blockText(lines, k, index, idFrom)) === want) return k;
	return null;
}

/** 消す行の最初（null なら消さずに ID だけ外す） */
function decide(
	lines: readonly LineInfo[],
	start: number,
	index: number,
	idFrom: number,
	mode: RemoveMode,
): number | null {
	if (mode.type === 'unlink') return null;
	if (mode.type === 'line') return start;
	const { body } = splitLine(lines[index]?.text ?? '', idFrom);
	// 第 1 弾の行（1 行）は == の外に文が無ければ行ごと（== の中がハイライトの文）
	if (new RegExp(LEGACY_SPAN.source).test(body))
		return body.replace(LEGACY_SPAN, '').trim() === '' ? index : null;
	if (/^!\[/.test(body.trim())) return index;
	return mode.expected === null
		? null
		: matchingStart(lines, start, index, idFrom, mode.expected);
}

/** ID（と第 1 弾の ==）だけ外した行 */
function unlinkedLine(text: string, idFrom: number): string {
	const { prefix, heading, body } = splitLine(text, idFrom);
	const legacy = new RegExp(LEGACY_SPAN.source).test(body);
	return `${prefix}${heading}${legacy ? body.replace(LEGACY_SPAN, '$1') : body}`.trimEnd();
}

/** ハイライトを本文から外す編集 */
export function planRemoveHighlight(
	content: string,
	id: string,
	mode: RemoveMode,
): RemovePlan {
	const target = id.toLowerCase();
	const lines = splitLines(content);
	const fenced = fencedLines(lines);
	const edits: TextEdit[] = [];
	let kept = false;
	lines.forEach((line, index) => {
		const match = findBlockId(line.text);
		if (!match || match.id !== target) return;
		const start = blockStart(lines, fenced, index);
		const from = decide(lines, start, index, match.from, mode);
		const unlinked = unlinkedLine(line.text, match.from);
		if (from !== null || (start === index && unlinked.trim() === '')) {
			edits.push(deleteLines(lines, from ?? index, index));
			return;
		}
		kept = true;
		edits.push({ from: line.start, to: line.end, insert: unlinked });
	});
	return { edits: mergeEdits(edits), kept };
}

/**
 * 見出しの大きさを変える編集（level が 0 なら本文に戻す）。
 * 見出しにするときは箇条書きの記号を外し、複数行の段落は 1 行にまとめる。
 * 本文に戻すときは、前後の文とつながらないように空行を入れる。
 */
export function planSetHeadingLevel(
	content: string,
	id: string,
	level: number,
): TextEdit[] {
	const target = id.toLowerCase();
	const eol = eolOf(content);
	const lines = splitLines(content);
	const fenced = fencedLines(lines);
	const bodyStart = bodyStartLine(lines);
	const marker =
		level > 0 ? `${'#'.repeat(Math.min(6, Math.round(level)))} ` : '';
	const edits: TextEdit[] = [];
	lines.forEach((line, index) => {
		const match = findBlockId(line.text);
		if (!match || match.id !== target) return;
		const start = level > 0 ? blockStart(lines, fenced, index) : index;
		const first = lines[start] ?? line;
		const text = normalizeSelectedText(
			blockText(lines, start, index, match.from),
		);
		let insert = `${marker}${text}${line.text.slice(match.from).trimEnd()}`;
		if (level === 0) {
			const previous = lines[index - 1];
			const next = lines[index + 1];
			if (index > bodyStart && previous && !isBlank(previous))
				insert = `${eol}${insert}`;
			if (next && !isBlank(next)) insert = `${insert}${eol}`;
		}
		if (insert !== content.slice(first.start, line.end))
			edits.push({ from: first.start, to: line.end, insert });
	});
	return edits;
}
