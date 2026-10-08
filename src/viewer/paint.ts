import { setIcon } from 'obsidian';
import {
	boxesInside,
	mergeLineBoxes,
	toLocalBoxes,
	toPageBoxes,
	type Box,
} from '../lib/geometry';
import { matchesLabel } from '../lib/highlight-entry';
import type { Highlight } from '../lib/types';
import { rotationOf } from './dom';
import { pdfSelectionToRange, textInLayer } from './text-range';

/** ページに描いたハイライトと、その要素 */
export interface Drawn {
	highlight: Highlight;
	group: HTMLElement;
}

/** 左上の小さな印: 見出し（H1〜H6）か、画像として取り込んだ範囲か */
export type Badge = { kind: 'heading'; level: number } | { kind: 'region' };

/** 描く予定のハイライト（signature が前と同じなら DOM を作り直さない） */
export interface Planned {
	highlight: Highlight;
	color: string;
	stale: boolean;
	/** ページ（回転後）に対する割合 */
	boxes: Box[];
	badge: Badge | null;
	signature: string;
}

function percent(value: number): string {
	return `${(value * 100).toFixed(4)}%`;
}

/**
 * ハイライトの矩形を測る（回転前のテキスト層に対する 0〜1 の割合）。
 * その span がまだ描かれていない・描き直しの途中で値がおかしいときは null（後で測り直す）。
 */
export function measureBoxes(
	textLayer: HTMLElement,
	highlight: Highlight,
): Box[] | null {
	const { anchor } = highlight;
	if (anchor.type === 'region') {
		const { left, top, right, bottom } = anchor.region;
		return [{ x: left, y: top, w: right - left, h: bottom - top }];
	}
	const range = pdfSelectionToRange(textLayer, anchor.selection);
	if (!range) return null;
	const frame = textLayer.getBoundingClientRect();
	if (frame.width < 1 || frame.height < 1) return null;
	const rects = Array.from(range.getClientRects()).filter(
		(rect) => rect.width >= 0.5 && rect.height >= 0.5,
	);
	if (rects.length === 0) return null;
	const rotation = rotationOf(textLayer);
	const local = toLocalBoxes(rects, frame, rotation);
	if (!boxesInside(local, 0.02)) return null;
	const quarter = rotation === 90 || rotation === 270;
	const aspect = quarter
		? frame.height / frame.width
		: frame.width / frame.height;
	return mergeLineBoxes(local, aspect);
}

/** 描く内容（ページに対する矩形・色・ずれの疑い・印）と、その署名 */
export function planHighlight(
	textLayer: HTMLElement,
	highlight: Highlight,
	localBoxes: readonly Box[],
	color: string,
): Planned {
	const boxes = toPageBoxes(localBoxes, rotationOf(textLayer));
	const { anchor } = highlight;
	// PDF を差し替えてずれたかどうかは、文字のハイライトだけで見る
	const text =
		anchor.type === 'text'
			? textInLayer(textLayer, anchor.selection)
			: null;
	const stale = text !== null && !matchesLabel(highlight.label, text);
	const badge: Badge | null =
		anchor.type === 'region'
			? { kind: 'region' }
			: highlight.level > 0
				? { kind: 'heading', level: highlight.level }
				: null;
	const signature = [
		highlight.key,
		color,
		stale ? 'stale' : '',
		badge
			? `${badge.kind}${badge.kind === 'heading' ? badge.level : ''}`
			: '',
		...boxes.map((box) =>
			[box.x, box.y, box.w, box.h].map((v) => v.toFixed(5)).join(','),
		),
	].join('|');
	return { highlight, color, stale, boxes, badge, signature };
}

function createGroup(
	layer: HTMLElement,
	item: Planned,
	flashing: boolean,
): Drawn {
	const group = layer.createDiv({
		cls: 'pdf-tools-highlight-group',
		attr: { 'data-key': item.highlight.key, 'data-sig': item.signature },
	});
	group.setCssProps({ '--pdf-tools-hl': item.color });
	if (item.stale) group.addClass('is-stale');
	if (flashing) group.addClass('is-flashing');
	if (item.highlight.anchor.type === 'region') group.addClass('is-region');
	for (const box of item.boxes)
		group.createDiv('pdf-tools-highlight').setCssProps({
			'--pdf-tools-x': percent(box.x),
			'--pdf-tools-y': percent(box.y),
			'--pdf-tools-w': percent(box.w),
			'--pdf-tools-h': percent(box.h),
		});
	const first = item.boxes[0];
	if (item.badge && first) {
		const badge = group.createDiv('pdf-tools-badge');
		badge.setCssProps({
			'--pdf-tools-x': percent(first.x),
			'--pdf-tools-y': percent(first.y),
		});
		if (item.badge.kind === 'heading')
			badge.setText(`H${item.badge.level}`);
		else setIcon(badge, 'image');
	}
	return { highlight: item.highlight, group };
}

/**
 * 層の中身を planned に合わせる。前と同じなら DOM を作り直さない（点滅やホバーを保ち、無駄な描き直しを避ける）。
 * flashingKey のハイライトを作り直すときは点滅の印を付け直す。
 */
export function paintLayer(
	layer: HTMLElement,
	planned: readonly Planned[],
	flashingKey: string | null,
): Drawn[] {
	const current = Array.from(layer.children).filter(
		(child): child is HTMLElement => child.instanceOf(HTMLElement),
	);
	const unchanged =
		current.length === planned.length &&
		planned.every(
			(item, i) =>
				current[i]?.getAttribute('data-sig') === item.signature,
		);
	if (unchanged)
		return planned.flatMap((item, i) => {
			const group = current[i];
			return group ? [{ highlight: item.highlight, group }] : [];
		});
	layer.empty();
	return planned.map((item) =>
		createGroup(layer, item, item.highlight.key === flashingKey),
	);
}
