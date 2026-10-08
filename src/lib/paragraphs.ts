import { isCjk } from './text';

/**
 * PDF から選んだ複数行の文字を、段落の形に戻す。
 * PDF の行の終わりは、段落の途中の折り返し（つなぐ）と、段落・箇条書きの切れ目（改行を残す）が混ざっている。
 * 行の位置から見分ける:
 * - 次の行が箇条書きの記号（・ ● ① 1. （1） 第1章 など）で始まる → 切れ目
 * - 行の間が、ふつうの行間よりはっきり広い → 切れ目
 * - 前の行が右端まで届かずに終わっている（日本語は 1 文字余り以上。英語は文の終わりか、かなり短い行）→ 切れ目
 * それ以外は折り返しとしてつなぐ（日本語どうしは詰めて、それ以外は空白 1 つで）。
 */

/** 1 行（回転前のページの座標。単位はそろっていればよい） */
export interface LineBox {
	text: string;
	left: number;
	right: number;
	top: number;
	bottom: number;
}

const LIST_MARKER =
	/^(?:[・•●○◦▪▫■□◆◇★☆※▶►▸→⇒✓✔◎◯]|[-–—*+](?=\s)|\d{1,3}[.．)）](?!\d)|[A-Za-z][)）]|[A-Za-z][.．](?=\s)|[（(](?:\d{1,3}|[A-Za-z]|[一二三四五六七八九十]{1,3})[)）]|[①-⑳⑴-⒇❶-❿]|第[0-9０-９一二三四五六七八九十百]+[章節条項部])/;

const SENTENCE_END = /[.!?:;。．！？：」』）)"”’]$/;

function median(values: readonly number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length === 0) return 0;
	return sorted.length % 2
		? (sorted[middle] ?? 0)
		: ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/** 前の行のあとで改行を残すか */
function breaksAfter(
	previous: LineBox,
	current: LineBox,
	context: { maxRight: number; height: number; gap: number },
): boolean {
	if (LIST_MARKER.test(current.text.trimStart())) return true;
	const gap = current.top - previous.bottom;
	if (gap > context.gap + context.height * 0.5) return true;
	const before = previous.text.trimEnd();
	const short = (context.maxRight - previous.right) / context.height;
	if (isCjk(before.charAt(before.length - 1))) return short > 1.2;
	return short > 1.2 && (SENTENCE_END.test(before) || short > 6);
}

/**
 * 行を段落の形にした文字列（切れ目だけ改行。行の中の連続する空白は 1 つに）。
 * columnRight は段の右端（ページの同じ段の行の右端。選んだ行が短い行ばかりでも切れ目を見分けるため）。
 */
export function joinPdfLines(
	lines: readonly LineBox[],
	columnRight?: number,
): string {
	const kept = lines
		.map((line) => ({
			...line,
			text: line.text.replace(/\s+/g, ' ').trim(),
		}))
		.filter((line) => line.text !== '');
	const first = kept[0];
	if (!first) return '';
	const height = median(kept.map((line) => line.bottom - line.top)) || 1;
	const gaps = kept
		.slice(1)
		.map((line, i) => line.top - (kept[i]?.bottom ?? line.top));
	const context = {
		maxRight: Math.max(columnRight ?? 0, ...kept.map((line) => line.right)),
		height,
		gap: gaps.length > 1 ? median(gaps) : Math.min(...gaps, height),
	};
	let out = first.text;
	for (let i = 1; i < kept.length; i++) {
		const previous = kept[i - 1];
		const current = kept[i];
		if (!previous || !current) continue;
		if (breaksAfter(previous, current, context)) {
			out += `\n${current.text}`;
			continue;
		}
		const tight =
			isCjk(out.charAt(out.length - 1)) && isCjk(current.text.charAt(0));
		out += tight ? current.text : ` ${current.text}`;
	}
	return out;
}

/**
 * 段の右端: ページの行のうち、選んだ行と左端がそろう（同じ段の）行の右端のいちばん右。
 * 見つからなければ undefined（選んだ行だけで判断する）。
 */
export function columnRightOf(
	pageLines: readonly LineBox[],
	selected: readonly LineBox[],
): number | undefined {
	if (selected.length === 0) return undefined;
	const left = Math.min(...selected.map((line) => line.left));
	const height = median(selected.map((line) => line.bottom - line.top)) || 1;
	const rights = pageLines
		.filter((line) => Math.abs(line.left - left) <= height * 3)
		.map((line) => line.right);
	return rights.length > 0 ? Math.max(...rights) : undefined;
}
