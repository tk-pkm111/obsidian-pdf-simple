import { describe, expect, it } from 'vitest';
import {
	anchorKey,
	compareAnchors,
	extractText,
	formatRegion,
	formatSelection,
	isValidSelection,
	normalizeRegion,
	normalizeSelection,
	parseRegion,
	parseSelection,
	selectionKey,
} from '../../src/lib/pdf-selection';
import type { PdfAnchor } from '../../src/lib/types';

const sel = (b: number, bo: number, e: number, eo: number) => ({
	begin: { idx: b, offset: bo },
	end: { idx: e, offset: eo },
});

describe('parseSelection / formatSelection', () => {
	it('本体と同じ b,bo,e,eo の並び', () => {
		expect(parseSelection('2,2,4,4')).toEqual(sel(2, 2, 4, 4));
		expect(formatSelection(sel(2, 2, 4, 4))).toBe('2,2,4,4');
	});

	it('逆向きは正規化する', () => {
		expect(parseSelection('4,4,2,2')).toEqual(sel(2, 2, 4, 4));
		expect(normalizeSelection(sel(3, 5, 3, 1))).toEqual(sel(3, 1, 3, 5));
	});

	it('空・数でない・個数違いは null', () => {
		expect(parseSelection('1,2,1,2')).toBeNull();
		expect(parseSelection('1,2,3')).toBeNull();
		expect(parseSelection('1,a,3,4')).toBeNull();
		expect(parseSelection('-1,0,3,4')).toBeNull();
		expect(parseSelection('')).toBeNull();
	});
});

describe('isValidSelection', () => {
	it('始点 < 終点の 0 以上の整数だけ', () => {
		expect(isValidSelection(sel(0, 0, 0, 1))).toBe(true);
		expect(isValidSelection(sel(0, 1, 0, 1))).toBe(false);
		expect(isValidSelection(sel(0, 0.5, 1, 1))).toBe(false);
	});
});

describe('parseRegion / formatRegion / normalizeRegion', () => {
	const region = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.6 };

	it('L,T,R,B を小数 4 桁で読み書きする', () => {
		expect(parseRegion('0.1,0.2,0.5,0.6')).toEqual(region);
		expect(formatRegion(region)).toBe('0.1,0.2,0.5,0.6');
		expect(
			formatRegion({ left: 0.123456, top: 0, right: 1, bottom: 0.5 }),
		).toBe('0.1235,0,1,0.5');
	});

	it('逆向きはそろえ、範囲外・小さすぎ・不正は null', () => {
		expect(parseRegion('0.5,0.6,0.1,0.2')).toEqual(region);
		expect(parseRegion('0.1,0.2,1.5,0.6')).toBeNull();
		expect(parseRegion('0.1,0.2,0.1,0.6')).toBeNull();
		expect(parseRegion('0.1,0.2,0.5')).toBeNull();
		expect(parseRegion('a,0.2,0.5,0.6')).toBeNull();
		expect(parseRegion('-0.1,0.2,0.5,0.6')).toBeNull();
		expect(
			normalizeRegion({ left: -0.2, top: 0.2, right: 1.3, bottom: 0.6 }),
		).toEqual({ left: 0, top: 0.2, right: 1, bottom: 0.6 });
	});
});

describe('anchorKey / compareAnchors', () => {
	const text = (b: number, bo: number, e: number, eo: number): PdfAnchor => ({
		type: 'text',
		selection: sel(b, bo, e, eo),
	});
	const box = (top: number, left: number): PdfAnchor => ({
		type: 'region',
		region: { left, top, right: left + 0.1, bottom: top + 0.1 },
	});

	it('文字は page:b:bo:e:eo、矩形は page:r:L,T,R,B', () => {
		expect(selectionKey(3, sel(1, 0, 2, 5))).toBe('3:1:0:2:5');
		expect(anchorKey(3, text(1, 0, 2, 5))).toBe('3:1:0:2:5');
		expect(anchorKey(3, box(0.2, 0.1))).toBe('3:r:0.1,0.2,0.2,0.3');
	});

	it('ページ順 → 文字（位置順）→ 矩形（上・左の順）に並べる', () => {
		const items = [
			{ page: 2, anchor: text(0, 0, 0, 3) },
			{ page: 1, anchor: box(0.5, 0.1) },
			{ page: 1, anchor: text(5, 0, 6, 1) },
			{ page: 1, anchor: box(0.2, 0.3) },
			{ page: 1, anchor: text(2, 0, 3, 1) },
		];
		expect(
			[...items]
				.sort(compareAnchors)
				.map((i) => anchorKey(i.page, i.anchor)),
		).toEqual([
			'1:2:0:3:1',
			'1:5:0:6:1',
			'1:r:0.3,0.2,0.4,0.3',
			'1:r:0.1,0.5,0.2,0.6',
			'2:0:0:0:3',
		]);
	});
});

describe('extractText', () => {
	const items = [
		{ idx: 0, text: 'A short list' },
		{ idx: 2, text: '1. First item' },
		{ idx: 3, text: '2. Second item' },
		{ idx: 4, text: '3. Third item' },
	];

	it('1 要素の中', () => {
		expect(extractText(items, sel(2, 3, 2, 8))).toBe('First');
	});

	it('複数の要素（欠番は飛ばす）をつなぐ', () => {
		expect(extractText(items, sel(0, 2, 3, 2), ' ')).toBe(
			'short list 1. First item 2.',
		);
		expect(extractText(items, sel(0, 2, 3, 2))).toBe(
			'short list1. First item2.',
		);
	});

	it('範囲外の idx は含めない', () => {
		expect(extractText(items, sel(3, 0, 3, 2))).toBe('2.');
	});
});
