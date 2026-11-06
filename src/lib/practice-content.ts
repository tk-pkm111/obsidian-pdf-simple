import {
	latinWidth,
	textWidth,
	type DrawOp,
	type PageSize,
	type PdfScript,
	type Rgb,
} from './practice-pdf';

/**
 * 練習用の PDF の中身と配置。なぞる文が 1 つだけの、幅の狭い 1 ページ。
 * 手順は画面の右下のガイドが受け持つので、PDF には「何をなぞるか」だけを大きく書く。
 * ノートを横に開いて PDF が半分の幅になっても読めるよう、ページの幅を A4 より狭くして字を大きくしている
 * （幅 1100 の画面で PDF が 323px のとき、なぞる文が約 15px）。
 */

export interface PracticeContent {
	script: PdfScript;
	/** ファイル名（拡張子なし） */
	fileName: string;
	title: string;
	/** 題の下の一言（何をするか） */
	lead: string;
	/** なぞる枠の札 */
	tag: string;
	/** なぞる文 */
	target: string;
	/** いちばん下の小さな一言 */
	footnote: string;
}

export const PAGE_WIDTH = 340;
export const MARGIN = 20;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** 帯と枠の内側の余白 */
export const PADDING = 14;

export const SIZE = {
	title: 21,
	lead: 13.5,
	tag: 9.5,
	target: 16,
	footnote: 10.5,
} as const;

const ACCENT: Rgb = [0.38, 0.29, 0.86];
const ACCENT_SOFT: Rgb = [0.95, 0.94, 1];
const MUTED: Rgb = [0.42, 0.44, 0.5];
const INK: Rgb = [0.11, 0.12, 0.16];
const WHITE: Rgb = [1, 1, 1];

const JA: PracticeContent = {
	script: 'ja',
	fileName: 'PDF Simple 練習',
	title: 'PDF Simple の練習',
	lead: '下の文を、なぞってみましょう。',
	tag: 'ここをなぞる',
	target: 'なぞった文は、ノートに入ります。',
	footnote: '終わったら、この PDF とノートは消してかまいません。',
};

const EN: PracticeContent = {
	script: 'latin',
	fileName: 'PDF Simple practice',
	title: 'PDF Simple practice',
	lead: 'Select the sentence below.',
	tag: 'Select this',
	target: 'Selected text goes to your note.',
	footnote: 'You can delete this PDF and its note later.',
};

export function practiceContent(japanese: boolean): PracticeContent {
	return japanese ? JA : EN;
}

/** その PDF での文字の幅（日本語の PDF は日本語と英字の混ざり、英語の PDF は英字だけ） */
export function measure(
	script: PdfScript,
	text: string,
	size: number,
	bold = false,
): number {
	return script === 'ja'
		? textWidth(text, size, bold)
		: latinWidth(text, size, bold);
}

/**
 * 上から順に置く。ページの高さは中身に合わせる。
 * 上からの距離で組み立て、最後に PDF の座標（下から）に直す。
 */
export function layoutPractice(content: PracticeContent): {
	ops: DrawOp[];
	size: PageSize;
} {
	const width = (text: string, size: number, bold = false) =>
		measure(content.script, text, size, bold);
	// 上からの距離で書く（y は要素の上端、文字は字の基準線）
	const placed: DrawOp[] = [];
	let top = MARGIN;

	// 題と一言の帯
	const bandHeight = 74;
	placed.push({
		type: 'rect',
		x: MARGIN,
		y: top,
		width: CONTENT_WIDTH,
		height: bandHeight,
		radius: 10,
		fill: ACCENT_SOFT,
	});
	placed.push({
		type: 'text',
		x: MARGIN + PADDING,
		y: top + 32,
		size: SIZE.title,
		text: content.title,
		bold: true,
		color: INK,
	});
	placed.push({
		type: 'text',
		x: MARGIN + PADDING,
		y: top + 56,
		size: SIZE.lead,
		text: content.lead,
		color: MUTED,
	});
	top += bandHeight + 18;

	// 札（「ここをなぞる」）
	const tagHeight = 16;
	placed.push({
		type: 'rect',
		x: MARGIN,
		y: top,
		width: width(content.tag, SIZE.tag, true) + 16,
		height: tagHeight,
		radius: 8,
		fill: ACCENT,
	});
	placed.push({
		type: 'text',
		x: MARGIN + 8,
		y: top + tagHeight - 4.6,
		size: SIZE.tag,
		text: content.tag,
		bold: true,
		color: WHITE,
	});
	top += tagHeight + 5;

	// なぞる文の枠
	const boxHeight = SIZE.target + PADDING * 2;
	placed.push({
		type: 'rect',
		x: MARGIN,
		y: top,
		width: CONTENT_WIDTH,
		height: boxHeight,
		radius: 8,
		stroke: ACCENT,
		fill: WHITE,
		lineWidth: 1.4,
	});
	placed.push({
		type: 'text',
		x: MARGIN + PADDING,
		y: top + PADDING + SIZE.target * 0.84,
		size: SIZE.target,
		text: content.target,
		color: INK,
	});
	top += boxHeight + 26;

	placed.push({
		type: 'text',
		x: MARGIN,
		y: top,
		size: SIZE.footnote,
		text: content.footnote,
		color: MUTED,
	});
	top += MARGIN + 4;

	const height = Math.ceil(top);
	const ops = placed.map((op): DrawOp => {
		switch (op.type) {
			case 'rect':
				return { ...op, y: height - op.y - op.height };
			case 'text':
				return { ...op, y: height - op.y };
			case 'circle':
				return { ...op, cy: height - op.cy };
		}
	});
	return { ops, size: { width: PAGE_WIDTH, height } };
}
