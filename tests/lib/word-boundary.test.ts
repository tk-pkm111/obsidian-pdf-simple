import { describe, expect, it } from 'vitest';
import { expandToWords, isWordChar } from '../../src/lib/word-boundary';

const texts: Record<number, string> = {
	0: 'This PDF is test data for the PDF Tools plugin.',
	1: 'Second line',
	2: 'これは日本語の文です。',
};
const textOf = (idx: number) => texts[idx] ?? null;
const sel = (b: number, bo: number, e: number, eo: number) => ({
	begin: { idx: b, offset: bo },
	end: { idx: e, offset: eo },
});

describe('expandToWords', () => {
	it('単語の途中で始まる・終わる選択を単語の端まで広げる', () => {
		// "his PDF is test dat" → "This PDF is test data"
		expect(expandToWords(textOf, sel(0, 1, 0, 19))).toEqual(
			sel(0, 0, 0, 21),
		);
		// 別の要素にまたがる選択でも、それぞれの端を広げる
		expect(expandToWords(textOf, sel(0, 42, 1, 3))).toEqual(
			sel(0, 40, 1, 6),
		);
	});

	it('単語の端・空白・記号の位置ならそのまま', () => {
		expect(expandToWords(textOf, sel(0, 0, 0, 4))).toEqual(sel(0, 0, 0, 4));
		expect(expandToWords(textOf, sel(0, 5, 0, 8))).toEqual(sel(0, 5, 0, 8));
		expect(expandToWords(textOf, sel(0, 40, 0, 47))).toEqual(
			sel(0, 40, 0, 47),
		);
	});

	it('日本語は広げない。要素が無ければそのまま', () => {
		expect(expandToWords(textOf, sel(2, 1, 2, 4))).toEqual(sel(2, 1, 2, 4));
		expect(expandToWords(textOf, sel(9, 1, 9, 2))).toEqual(sel(9, 1, 9, 2));
	});

	it('isWordChar', () => {
		expect(isWordChar('a')).toBe(true);
		expect(isWordChar('É')).toBe(true);
		expect(isWordChar('7')).toBe(true);
		expect(isWordChar(' ')).toBe(false);
		expect(isWordChar('あ')).toBe(false);
		expect(isWordChar(undefined)).toBe(false);
	});
});
