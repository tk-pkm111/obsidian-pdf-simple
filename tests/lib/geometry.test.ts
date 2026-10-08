import { describe, expect, it } from 'vitest';
import {
	boxesInside,
	containsPoint,
	mergeLineBoxes,
	normalizeRotation,
	rotationFromMatrix,
	toLocalBoxes,
	toPageBoxes,
} from '../../src/lib/geometry';

const frame = { left: 100, top: 50, width: 200, height: 400 };

function close(
	actual: { x: number; y: number; w: number; h: number },
	expected: typeof actual,
) {
	for (const key of ['x', 'y', 'w', 'h'] as const)
		expect(actual[key]).toBeCloseTo(expected[key], 6);
}

describe('toLocalBoxes', () => {
	it('回転なし: テキスト層に対する割合', () => {
		const [box] = toLocalBoxes(
			[{ left: 120, top: 90, width: 50, height: 20 }],
			frame,
			0,
		);
		close(box ?? { x: 0, y: 0, w: 0, h: 0 }, {
			x: 0.1,
			y: 0.1,
			w: 0.25,
			h: 0.05,
		});
	});

	it('90 度回転した層の外接矩形から、回転前の割合に戻す', () => {
		// 回転前の (u, v) = (0.1, 0.2)〜(0.4, 0.25) は、時計回り 90 度で X = 1 - v, Y = u に移る
		const rotated = { left: 0, top: 0, width: 400, height: 200 };
		const rect = {
			left: (1 - 0.25) * 400,
			top: 0.1 * 200,
			width: 0.05 * 400,
			height: 0.3 * 200,
		};
		const [box] = toLocalBoxes([rect], rotated, 90);
		close(box ?? { x: 0, y: 0, w: 0, h: 0 }, {
			x: 0.1,
			y: 0.2,
			w: 0.3,
			h: 0.05,
		});
	});

	it('180 度・270 度', () => {
		const rect = {
			left: 100 + 0.6 * 200,
			top: 50 + 0.7 * 400,
			width: 0.3 * 200,
			height: 0.1 * 400,
		};
		const [half] = toLocalBoxes([rect], frame, 180);
		close(half ?? { x: 0, y: 0, w: 0, h: 0 }, {
			x: 0.1,
			y: 0.2,
			w: 0.3,
			h: 0.1,
		});
		const rotated = { left: 0, top: 0, width: 400, height: 200 };
		// 270 度: X = v, Y = 1 - u
		const r270 = {
			left: 0.2 * 400,
			top: (1 - 0.4) * 200,
			width: 0.05 * 400,
			height: 0.3 * 200,
		};
		const [quarter] = toLocalBoxes([r270], rotated, 270);
		close(quarter ?? { x: 0, y: 0, w: 0, h: 0 }, {
			x: 0.1,
			y: 0.2,
			w: 0.3,
			h: 0.05,
		});
	});

	it('大きさの無い層なら空', () => {
		expect(
			toLocalBoxes(
				[{ left: 0, top: 0, width: 1, height: 1 }],
				{ ...frame, width: 0 },
				0,
			),
		).toEqual([]);
	});
});

describe('normalizeRotation / rotationFromMatrix', () => {
	it('90 度単位に丸める', () => {
		expect(normalizeRotation(89)).toBe(90);
		expect(normalizeRotation(-90)).toBe(270);
		expect(normalizeRotation(360)).toBe(0);
		expect(rotationFromMatrix(0, 1)).toBe(90);
		expect(rotationFromMatrix(-1, 0)).toBe(180);
		expect(rotationFromMatrix(1, 0)).toBe(0);
	});
});

describe('mergeLineBoxes', () => {
	it('同じ行で隣り合う矩形はまとめ、行が違えばまとめない', () => {
		const merged = mergeLineBoxes(
			[
				{ x: 0.3, y: 0.1, w: 0.2, h: 0.02 },
				{ x: 0.1, y: 0.1005, w: 0.2, h: 0.02 },
				{ x: 0.1, y: 0.2, w: 0.5, h: 0.02 },
			],
			1,
		);
		expect(merged).toHaveLength(2);
		close(merged[0] ?? { x: 0, y: 0, w: 0, h: 0 }, {
			x: 0.1,
			y: 0.1,
			w: 0.4,
			h: 0.0205,
		});
	});

	it('離れた矩形（行の高さの 0.6 倍より遠い）はまとめない', () => {
		expect(
			mergeLineBoxes(
				[
					{ x: 0.1, y: 0.1, w: 0.1, h: 0.02 },
					{ x: 0.5, y: 0.1, w: 0.1, h: 0.02 },
				],
				1,
			),
		).toHaveLength(2);
	});
});

describe('boxesInside / containsPoint', () => {
	it('層の外に出た矩形を見つける', () => {
		expect(boxesInside([{ x: 0, y: 0, w: 1, h: 1 }], 0)).toBe(true);
		expect(boxesInside([{ x: -0.1, y: 0, w: 0.5, h: 0.1 }], 0.02)).toBe(
			false,
		);
	});

	it('境界と slop', () => {
		const rect = { left: 10, top: 10, width: 10, height: 10 };
		expect(containsPoint(rect, 20, 20)).toBe(true);
		expect(containsPoint(rect, 21, 15)).toBe(false);
		expect(containsPoint(rect, 21, 15, 2)).toBe(true);
	});
});

describe('toPageBoxes', () => {
	it('回転前の割合を回転後のページの割合に直す（toLocalBoxes の逆）', () => {
		const box = { x: 0.1, y: 0.2, w: 0.3, h: 0.05 };
		close(toPageBoxes([box], 0)[0] ?? box, box);
		close(toPageBoxes([box], 90)[0] ?? box, {
			x: 0.75,
			y: 0.1,
			w: 0.05,
			h: 0.3,
		});
		close(toPageBoxes([box], 180)[0] ?? box, {
			x: 0.6,
			y: 0.75,
			w: 0.3,
			h: 0.05,
		});
		close(toPageBoxes([box], 270)[0] ?? box, {
			x: 0.2,
			y: 0.6,
			w: 0.05,
			h: 0.3,
		});
	});

	it('toLocalBoxes で戻すと元の矩形', () => {
		const box = { x: 0.12, y: 0.34, w: 0.2, h: 0.03 };
		for (const rotation of [0, 90, 180, 270] as const) {
			const [page] = toPageBoxes([box], rotation);
			if (!page) throw new Error('no box');
			const frame = { left: 0, top: 0, width: 1, height: 1 };
			const rect = {
				left: page.x,
				top: page.y,
				width: page.w,
				height: page.h,
			};
			close(toLocalBoxes([rect], frame, rotation)[0] ?? box, box);
		}
	});
});
