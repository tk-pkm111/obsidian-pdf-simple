import { describe, expect, it } from 'vitest';
import {
	formatPdfSubpath,
	isColorName,
	isHighlightId,
	parsePdfSubpath,
	setParam,
	splitParams,
} from '../../src/lib/pdf-subpath';

describe('parsePdfSubpath', () => {
	it('page / selection / color / id を読む（# の有無は問わない）', () => {
		for (const subpath of [
			'#page=3&selection=12,0,14,20&color=yellow&id=hl-k9f2ab',
			'page=3&selection=12,0,14,20&color=yellow&id=hl-k9f2ab',
		]) {
			const parsed = parsePdfSubpath(subpath);
			expect(parsed.page).toBe(3);
			expect(parsed.selection).toEqual({
				begin: { idx: 12, offset: 0 },
				end: { idx: 14, offset: 20 },
			});
			expect(parsed.color).toBe('yellow');
			expect(parsed.id).toBe('hl-k9f2ab');
		}
	});

	it('順不同でも読み、未知のパラメータは並びのまま保つ', () => {
		const parsed = parsePdfSubpath(
			'#id=hl-x1&foo=bar&page=2&selection=1,0,1,4',
		);
		expect(parsed.page).toBe(2);
		expect(parsed.id).toBe('hl-x1');
		expect(parsed.params).toEqual([
			['id', 'hl-x1'],
			['foo', 'bar'],
			['page', '2'],
			['selection', '1,0,1,4'],
		]);
	});

	it('欠けている・不正な値は null', () => {
		const parsed = parsePdfSubpath(
			'#page=0&selection=1,2&color=Yellow!&id=xx',
		);
		expect(parsed).toMatchObject({
			page: null,
			selection: null,
			region: null,
			color: null,
			id: null,
		});
		expect(parsePdfSubpath('').page).toBeNull();
		expect(parsePdfSubpath('#Heading').page).toBeNull();
	});
});

describe('formatPdfSubpath', () => {
	it('page, selection, color, id の順に書き、読み戻すと同じ', () => {
		const subpath = formatPdfSubpath({
			page: 2,
			selection: {
				begin: { idx: 2, offset: 2 },
				end: { idx: 4, offset: 4 },
			},
			color: 'red',
			id: 'hl-abc123',
		});
		expect(subpath).toBe(
			'#page=2&selection=2,2,4,4&color=red&id=hl-abc123',
		);
		const parsed = parsePdfSubpath(subpath);
		expect(formatPdfSubpath({ ...parsed, page: parsed.page ?? 0 })).toBe(
			subpath,
		);
	});

	it('無いものは書かない', () => {
		expect(formatPdfSubpath({ page: 5 })).toBe('#page=5');
	});

	it('範囲（画像）は region= で書き、selection があれば selection だけ', () => {
		const region = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.6 };
		const subpath = formatPdfSubpath({
			page: 3,
			region,
			color: 'blue',
			id: 'hl-1',
		});
		expect(subpath).toBe(
			'#page=3&region=0.1,0.2,0.5,0.6&color=blue&id=hl-1',
		);
		expect(parsePdfSubpath(subpath).region).toEqual(region);
		expect(parsePdfSubpath(subpath).selection).toBeNull();
		expect(
			formatPdfSubpath({
				page: 3,
				selection: {
					begin: { idx: 0, offset: 0 },
					end: { idx: 0, offset: 2 },
				},
				region,
			}),
		).toBe('#page=3&selection=0,0,0,2');
	});
});

describe('setParam', () => {
	it('値を置き換え、無ければ末尾に足し、null なら消す', () => {
		const base = '#page=2&selection=1,0,1,4&foo=bar&color=red&id=hl-1';
		expect(setParam(base, 'color', 'blue')).toBe(
			'#page=2&selection=1,0,1,4&foo=bar&color=blue&id=hl-1',
		);
		expect(setParam('#page=2&id=hl-1', 'color', 'blue')).toBe(
			'#page=2&id=hl-1&color=blue',
		);
		expect(setParam(base, 'color', null)).toBe(
			'#page=2&selection=1,0,1,4&foo=bar&id=hl-1',
		);
	});

	it('同じ key が重複していれば 1 つにする', () => {
		expect(setParam('#color=a&page=1&color=b', 'color', 'c')).toBe(
			'#color=c&page=1',
		);
	});
});

describe('splitParams / isColorName / isHighlightId', () => {
	it('= の無いパラメータや空の部分も扱える', () => {
		expect(splitParams('a=1&&flag&b=')).toEqual([
			['a', '1'],
			['flag', ''],
			['b', ''],
		]);
	});

	it('色の名前と ID の形', () => {
		expect(isColorName('yellow')).toBe(true);
		expect(isColorName('light-blue2')).toBe(true);
		expect(isColorName('Yellow')).toBe(false);
		expect(isColorName('2red')).toBe(false);
		expect(isHighlightId('hl-k9f2ab')).toBe(true);
		expect(isHighlightId('hl-')).toBe(false);
		expect(isHighlightId('block-1')).toBe(false);
	});
});
