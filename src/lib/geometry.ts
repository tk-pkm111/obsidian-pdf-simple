/**
 * ハイライトの矩形の計算。
 * 矩形はテキスト層（回転前）に対する 0〜1 の割合で持つ。ズームしても同じ値のまま使え、
 * 回転していれば描くときに toPageBoxes でページに対する割合に直す。
 */

export interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface RectLike {
	left: number;
	top: number;
	width: number;
	height: number;
}

export type Rotation = 0 | 90 | 180 | 270;

/** 角度（度）を 90 度単位の 0 / 90 / 180 / 270 に丸める */
export function normalizeRotation(degrees: number): Rotation {
	const quarter = ((Math.round(degrees / 90) % 4) + 4) % 4;
	switch (quarter) {
		case 1:
			return 90;
		case 2:
			return 180;
		case 3:
			return 270;
		default:
			return 0;
	}
}

/** CSS の変換行列 matrix(a, b, …) の a, b から回転角 */
export function rotationFromMatrix(a: number, b: number): Rotation {
	return normalizeRotation((Math.atan2(b, a) * 180) / Math.PI);
}

/** 回転後の外接矩形の中の割合 (X, Y) → 回転前の割合 (u, v)（時計回りの回転） */
function unrotate(x: number, y: number, rotation: Rotation): [number, number] {
	switch (rotation) {
		case 90:
			return [y, 1 - x];
		case 180:
			return [1 - x, 1 - y];
		case 270:
			return [1 - y, x];
		default:
			return [x, y];
	}
}

/**
 * 画面上の矩形（Range.getClientRects）を、回転前のテキスト層に対する割合に直す。
 * frame はテキスト層の getBoundingClientRect（回転していれば回転後の外接矩形）。
 */
export function toLocalBoxes(
	rects: readonly RectLike[],
	frame: RectLike,
	rotation: Rotation,
): Box[] {
	if (frame.width <= 0 || frame.height <= 0) return [];
	return rects.map((rect) => {
		const [ax, ay] = unrotate(
			(rect.left - frame.left) / frame.width,
			(rect.top - frame.top) / frame.height,
			rotation,
		);
		const [bx, by] = unrotate(
			(rect.left + rect.width - frame.left) / frame.width,
			(rect.top + rect.height - frame.top) / frame.height,
			rotation,
		);
		return {
			x: Math.min(ax, bx),
			y: Math.min(ay, by),
			w: Math.abs(bx - ax),
			h: Math.abs(by - ay),
		};
	});
}

/** 回転前の割合 (u, v) → 回転後の外接矩形の中の割合 (X, Y)（unrotate の逆） */
function rotate(u: number, v: number, rotation: Rotation): [number, number] {
	switch (rotation) {
		case 90:
			return [1 - v, u];
		case 180:
			return [1 - u, 1 - v];
		case 270:
			return [v, 1 - u];
		default:
			return [u, v];
	}
}

/**
 * 回転前のテキスト層に対する割合の矩形を、回転後のページに対する割合に直す（ページの上に重ねて描くとき用）。
 */
export function toPageBoxes(boxes: readonly Box[], rotation: Rotation): Box[] {
	return boxes.map((box) => {
		const [ax, ay] = rotate(box.x, box.y, rotation);
		const [bx, by] = rotate(box.x + box.w, box.y + box.h, rotation);
		return {
			x: Math.min(ax, bx),
			y: Math.min(ay, by),
			w: Math.abs(bx - ax),
			h: Math.abs(by - ay),
		};
	});
}

function verticalOverlap(a: Box, b: Box): number {
	return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
}

function union(a: Box, b: Box): Box {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return {
		x,
		y,
		w: Math.max(a.x + a.w, b.x + b.w) - x,
		h: Math.max(a.y + a.h, b.y + b.h) - y,
	};
}

/**
 * 同じ行で隣り合う矩形を 1 つにまとめる。
 * aspect は テキスト層の幅 / 高さ（横方向の隙間を行の高さと比べるため）。
 */
export function mergeLineBoxes(boxes: readonly Box[], aspect: number): Box[] {
	const sorted = [...boxes].sort(
		(a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x,
	);
	const lines: Box[][] = [];
	for (const box of sorted) {
		const line = lines.find((candidate) => {
			const first = candidate[0];
			return (
				first !== undefined &&
				verticalOverlap(first, box) >= 0.5 * Math.min(first.h, box.h)
			);
		});
		if (line) line.push(box);
		else lines.push([box]);
	}
	const merged: Box[] = [];
	for (const line of lines) {
		line.sort((a, b) => a.x - b.x);
		let current: Box | null = null;
		for (const box of line) {
			if (current) {
				const gap = (box.x - (current.x + current.w)) * aspect;
				if (gap <= 0.6 * Math.min(current.h, box.h)) {
					current = union(current, box);
					continue;
				}
				merged.push(current);
			}
			current = { ...box };
		}
		if (current) merged.push(current);
	}
	return merged;
}

/** すべての矩形がテキスト層の中（許容 tolerance）にあるか。描画途中の不安定な値を捨てるのに使う */
export function boxesInside(boxes: readonly Box[], tolerance: number): boolean {
	return boxes.every(
		(box) =>
			box.x >= -tolerance &&
			box.y >= -tolerance &&
			box.x + box.w <= 1 + tolerance &&
			box.y + box.h <= 1 + tolerance,
	);
}

/** 点が矩形の中か（slop だけ外側も含める） */
export function containsPoint(
	rect: RectLike,
	x: number,
	y: number,
	slop = 0,
): boolean {
	return (
		x >= rect.left - slop &&
		x <= rect.left + rect.width + slop &&
		y >= rect.top - slop &&
		y <= rect.top + rect.height + slop
	);
}
