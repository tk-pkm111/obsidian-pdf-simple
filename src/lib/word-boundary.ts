import type { PdfSelection } from './types';

/**
 * 英単語の途中で切れた選択を、単語の端まで広げる。
 * PDF の文字の選択は 1 文字単位なので、ドラッグの始点・終点が単語の中に入りやすい（"This" の T が抜けるなど）。
 * 広げるのは 1 つのテキスト要素（span）の中だけ。日本語などの文字は区切りが無いので広げない。
 */

const WORD_CHAR = /[0-9A-Za-zÀ-ɏ]/;

export function isWordChar(char: string | undefined): boolean {
	return char !== undefined && WORD_CHAR.test(char);
}

/** textOf は data-idx からその要素の文字列（無ければ null） */
export function expandToWords(
	textOf: (idx: number) => string | null,
	selection: PdfSelection,
): PdfSelection {
	const { begin, end } = selection;
	let beginOffset = begin.offset;
	const beginText = textOf(begin.idx);
	if (
		beginText !== null &&
		isWordChar(beginText.charAt(beginOffset - 1)) &&
		isWordChar(beginText.charAt(beginOffset))
	)
		while (beginOffset > 0 && isWordChar(beginText.charAt(beginOffset - 1)))
			beginOffset--;
	let endOffset = end.offset;
	const endText = textOf(end.idx);
	if (
		endText !== null &&
		isWordChar(endText.charAt(endOffset - 1)) &&
		isWordChar(endText.charAt(endOffset))
	)
		while (
			endOffset < endText.length &&
			isWordChar(endText.charAt(endOffset))
		)
			endOffset++;
	return {
		begin: { idx: begin.idx, offset: beginOffset },
		end: { idx: end.idx, offset: endOffset },
	};
}
