import { describe, expect, it } from 'vitest';
import { chapterAt, chapterSpans } from '../../src/lib/chapters';

const CHAPTERS = [
	{ at: 0, label: 'a' },
	{ at: 45, label: 'b' },
	{ at: 75, label: 'c' },
];

describe('chapterAt', () => {
	it('秒を含む章の番号', () => {
		expect(chapterAt(CHAPTERS, 0)).toBe(0);
		expect(chapterAt(CHAPTERS, 44.9)).toBe(0);
		expect(chapterAt(CHAPTERS, 45)).toBe(1);
		expect(chapterAt(CHAPTERS, 200)).toBe(2);
		expect(chapterAt(CHAPTERS, -1)).toBe(0);
	});
});

describe('chapterSpans', () => {
	it('長さは次の章まで、最後の章は動画の終わりまで', () => {
		const spans = chapterSpans(CHAPTERS, 60, 100);
		expect(spans.map((s) => s.length)).toEqual([45, 30, 25]);
		expect(spans.map((s) => s.done)).toEqual([1, 0.5, 0]);
	});

	it('動画の長さが分からなければ、最後の章は前の章と同じ長さ', () => {
		const spans = chapterSpans(CHAPTERS, 0, Number.NaN);
		expect(spans.map((s) => s.length)).toEqual([45, 30, 30]);
		expect(spans.every((s) => s.done === 0)).toBe(true);
	});

	it('終わりまで見たら全部 1', () => {
		const spans = chapterSpans(CHAPTERS, 100, 100);
		expect(spans.map((s) => s.done)).toEqual([1, 1, 1]);
	});
});
