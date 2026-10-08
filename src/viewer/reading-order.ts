import { toLocalBoxes } from '../lib/geometry';
import type { SpanBox } from '../lib/reading-order';
import { findPage, idxOf, rotationOf, textLayerOf, textSpans } from './dom';

/**
 * そのページのテキスト層の要素の位置（回転前のページに対する上端・下端の割合）。
 * 画像の範囲を、文字の読む順の中に置くのに使う。ページが描かれていなければ null。
 */
export function spanBoxes(root: HTMLElement, page: number): SpanBox[] | null {
	const pageEl = findPage(root, page);
	const textLayer = pageEl ? textLayerOf(pageEl) : null;
	if (!textLayer) return null;
	const frame = textLayer.getBoundingClientRect();
	if (frame.width < 1 || frame.height < 1) return null;
	const rotation = rotationOf(textLayer);
	const boxes: SpanBox[] = [];
	for (const span of textSpans(textLayer)) {
		const idx = idxOf(span);
		const rect = span.getBoundingClientRect();
		if (idx === null || (rect.width === 0 && rect.height === 0)) continue;
		const [local] = toLocalBoxes([rect], frame, rotation);
		if (local) boxes.push({ idx, top: local.y, bottom: local.y + local.h });
	}
	return boxes;
}
