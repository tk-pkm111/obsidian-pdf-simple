import { containsPoint, type RectLike } from '../lib/geometry';
import type { Drawn } from './paint';

/** 画像の範囲で、押せる枠の線の幅（内側と外側、CSS px） */
const REGION_EDGE = 6;

function shrink(rect: RectLike, by: number): RectLike {
	return {
		left: rect.left + by,
		top: rect.top + by,
		width: rect.width - 2 * by,
		height: rect.height - 2 * by,
	};
}

/** 左上の印（見出しの H2・画像の印）の上か */
function onBadge(item: Drawn, x: number, y: number): boolean {
	const badge = item.group.querySelector('.pdf-simple-badge');
	return (
		badge !== null && containsPoint(badge.getBoundingClientRect(), x, y, 2)
	);
}

/** 画像の範囲は、枠の線の近くだけを押せるようにする（中の文字は選べるように） */
function onRegionEdge(item: Drawn, x: number, y: number): boolean {
	const box = item.group.querySelector('.pdf-simple-highlight');
	if (!box) return false;
	const rect = box.getBoundingClientRect();
	return (
		containsPoint(rect, x, y, REGION_EDGE) &&
		!containsPoint(shrink(rect, REGION_EDGE), x, y)
	);
}

/** その位置のハイライト（文字の矩形が重なっていれば小さいほう。無ければ画像の範囲の枠） */
export function hitTest(
	items: readonly Drawn[],
	x: number,
	y: number,
): Drawn | null {
	let best: Drawn | null = null;
	let bestArea = Infinity;
	for (const item of items) {
		if (item.highlight.anchor.type === 'region') continue;
		if (onBadge(item, x, y)) return item;
		for (const box of Array.from(
			item.group.querySelectorAll('.pdf-simple-highlight'),
		)) {
			const rect = box.getBoundingClientRect();
			if (!containsPoint(rect, x, y, 1)) continue;
			const area = rect.width * rect.height;
			if (area < bestArea) {
				best = item;
				bestArea = area;
			}
		}
	}
	if (best) return best;
	for (const item of items)
		if (
			item.highlight.anchor.type === 'region' &&
			(onBadge(item, x, y) || onRegionEdge(item, x, y))
		)
			return item;
	return null;
}
