import { describe, expect, it } from 'vitest';
import {
	readingPosition,
	regionReadingPosition,
	textReadingPosition,
} from '../../src/lib/reading-order';

const spans = [
	{ idx: 0, top: 0.1, bottom: 0.12 },
	{ idx: 2, top: 0.2, bottom: 0.22 },
	{ idx: 3, top: 0.5, bottom: 0.52 },
];

describe('reading-order', () => {
	it('文字は要素の番号 + 要素の中の位置', () => {
		const anchor = {
			selection: {
				begin: { idx: 3, offset: 5 },
				end: { idx: 3, offset: 9 },
			},
		};
		expect(textReadingPosition(anchor)).toBeCloseTo(3.00005);
		expect(textReadingPosition(anchor)).toBeLessThan(4);
	});

	it('画像の範囲は、その上端より下にある最初の要素の手前', () => {
		expect(regionReadingPosition(spans, 0.3)).toBe(2.5);
		expect(regionReadingPosition(spans, 0.05)).toBe(-0.5);
		expect(regionReadingPosition(spans, 0.9)).toBe(3.5);
		expect(regionReadingPosition([], 0.3)).toBe(-0.5);
	});

	it('readingPosition は種類で使い分ける（要素が無ければ範囲は 0）', () => {
		const region = {
			type: 'region' as const,
			region: { left: 0, top: 0.3, right: 1, bottom: 0.4 },
		};
		expect(readingPosition(region, spans)).toBe(2.5);
		expect(readingPosition(region, null)).toBe(0);
		expect(
			readingPosition(
				{
					type: 'text',
					selection: {
						begin: { idx: 2, offset: 0 },
						end: { idx: 2, offset: 3 },
					},
				},
				null,
			),
		).toBe(2);
	});
});
