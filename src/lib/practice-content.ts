import {
	PAGE_HEIGHT,
	PAGE_WIDTH,
	latinWidth,
	textWidth,
	type DrawOp,
	type PdfScript,
	type Rgb,
} from './practice-pdf';

/**
 * 練習用の PDF の中身と配置。PDF そのものが手順になっている（上から順に試す）。
 * 上に題名の帯、手順ごとに番号の丸と見出し、なぞる文は「ここをなぞる」の札を付けた枠の中。
 * 行は手で折り返しておく（幅はテストで確かめる）。
 */

export type PracticeBlock =
	| { kind: 'step'; label: string; lines: readonly string[] }
	| { kind: 'target'; text: string; heading?: boolean }
	| { kind: 'after'; lines: readonly string[] };

export interface PracticeContent {
	script: PdfScript;
	/** ファイル名（拡張子なし） */
	fileName: string;
	title: string;
	lead: string;
	/** なぞる枠の札 */
	tag: string;
	blocks: readonly PracticeBlock[];
}

export const MARGIN = 52;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** 手順の本文の字下げ（番号の丸の右） */
export const INDENT = 34;
export const BOX_PADDING = 14;

export const SIZE = {
	title: 24,
	lead: 11,
	number: 12,
	label: 14,
	body: 11.5,
	target: 15,
	targetHeading: 17,
	tag: 9,
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
	lead: 'この PDF は練習用です。上から順に、1 つずつ試してみましょう（2 分ほど）。',
	tag: 'ここをなぞる',
	blocks: [
		{
			kind: 'step',
			label: 'なぞってハイライト',
			lines: [
				'下の枠の中の文をマウスでなぞり、出てきた色のどれかを押してください。',
			],
		},
		{
			kind: 'target',
			text: 'なぞった文は、蛍光ペンのように塗られて、ノートに入ります。',
		},
		{
			kind: 'step',
			label: 'ノートを見る',
			lines: [
				'右（スマホでは同じ画面）にノートが開き、なぞった文が入ります。',
				'ノートの文は、普通に書き換えてかまいません。',
			],
		},
		{
			kind: 'step',
			label: 'PDF とノートを行き来する',
			lines: [
				'ノートの文の後ろの小さな点を押すと、PDF のその場所に戻ります。',
				'PDF の塗った所を押すと、ノートのその行へ移ります。',
				'ヘッダーの「PDF」ボタンと紙のボタンでも、表と裏を切り替えられます。',
			],
		},
		{
			kind: 'step',
			label: '見出しにする',
			lines: [
				'右上のペンで、書き方を「見出し 2」にしてから、下の行をなぞります。',
			],
		},
		{ kind: 'target', text: '第 1 章　はじめに', heading: true },
		{
			kind: 'after',
			lines: ['終わったら、ペンの書き方を「本文」に戻しておきましょう。'],
		},
		{
			kind: 'step',
			label: '自分の PDF で使う',
			lines: [
				'左のリボンの「PDF を取り込む」で、パソコンやスマホの PDF を入れられます。',
				'ファイル一覧へドラッグしても入ります。',
				'練習が終わったら、この PDF とノートは消してかまいません。',
			],
		},
	],
};

const EN: PracticeContent = {
	script: 'latin',
	fileName: 'PDF Simple practice',
	title: 'PDF Simple practice',
	lead: 'This PDF is for practice. Try each step from the top (about 2 minutes).',
	tag: 'Select this',
	blocks: [
		{
			kind: 'step',
			label: 'Highlight by selecting',
			lines: [
				'Select the sentence in the box below with the mouse, then pick a color.',
			],
		},
		{
			kind: 'target',
			text: 'Selected text gets highlighted and goes into your note.',
		},
		{
			kind: 'step',
			label: 'Look at the note',
			lines: [
				'The note opens on the right (on a phone, in the same tab).',
				'The text you selected is there. Feel free to edit it.',
			],
		},
		{
			kind: 'step',
			label: 'Go back and forth',
			lines: [
				'Click the small dot after the text in the note to jump back to the PDF.',
				'Click a highlight in the PDF to jump to its line in the note.',
				'The PDF button and the page button in the header also flip sides.',
			],
		},
		{
			kind: 'step',
			label: 'Make a heading',
			lines: [
				'With the pen at the top right, set the style to "Heading 2",',
				'then select the line below.',
			],
		},
		{ kind: 'target', text: 'Chapter 1  Introduction', heading: true },
		{
			kind: 'after',
			lines: ['When you are done, set the pen back to "Body text".'],
		},
		{
			kind: 'step',
			label: 'Use your own PDF',
			lines: [
				'Use "Import PDF" in the left ribbon to add a PDF from your computer.',
				'You can also drag a PDF into the file explorer.',
				'When you finish, feel free to delete this PDF and its note.',
			],
		},
	],
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

/** 上から順に置く。戻り値の bottom は最後の要素の下端（ページに収まるかのテスト用） */
export function layoutPractice(content: PracticeContent): {
	ops: DrawOp[];
	bottom: number;
} {
	const ops: DrawOp[] = [];
	const width = (text: string, size: number, bold = false) =>
		measure(content.script, text, size, bold);
	const left = MARGIN + INDENT;
	let y = PAGE_HEIGHT - MARGIN;

	// 題名の帯
	const bandHeight = 84;
	ops.push({
		type: 'rect',
		x: MARGIN,
		y: y - bandHeight,
		width: CONTENT_WIDTH,
		height: bandHeight,
		radius: 12,
		fill: ACCENT_SOFT,
	});
	ops.push({
		type: 'text',
		x: MARGIN + 20,
		y: y - 40,
		size: SIZE.title,
		text: content.title,
		bold: true,
		color: INK,
	});
	ops.push({
		type: 'text',
		x: MARGIN + 20,
		y: y - 64,
		size: SIZE.lead,
		text: content.lead,
		color: MUTED,
	});
	y -= bandHeight + 8;

	const line = (text: string, color: Rgb = INK) => {
		y -= SIZE.body;
		ops.push({ type: 'text', x: left, y, size: SIZE.body, text, color });
		y -= SIZE.body * 0.62;
	};
	let step = 0;
	for (const block of content.blocks) {
		switch (block.kind) {
			case 'step': {
				step++;
				y -= 24;
				const cy = y - 10;
				ops.push({
					type: 'circle',
					cx: MARGIN + 11,
					cy,
					r: 11,
					fill: ACCENT,
				});
				const digit = String(step);
				ops.push({
					type: 'text',
					x: MARGIN + 11 - width(digit, SIZE.number, true) / 2,
					y: cy - SIZE.number * 0.36,
					size: SIZE.number,
					text: digit,
					bold: true,
					color: WHITE,
				});
				ops.push({
					type: 'text',
					x: left,
					y: cy - SIZE.label * 0.36,
					size: SIZE.label,
					text: block.label,
					bold: true,
					color: INK,
				});
				y -= 26;
				for (const text of block.lines) line(text);
				break;
			}
			case 'target': {
				y -= 10;
				// 札（「ここをなぞる」）
				const tagWidth = width(content.tag, SIZE.tag, true) + 16;
				const tagHeight = 16;
				ops.push({
					type: 'rect',
					x: left,
					y: y - tagHeight,
					width: tagWidth,
					height: tagHeight,
					radius: 8,
					fill: ACCENT,
				});
				ops.push({
					type: 'text',
					x: left + 8,
					y: y - tagHeight + 4.6,
					size: SIZE.tag,
					text: content.tag,
					bold: true,
					color: WHITE,
				});
				y -= tagHeight + 5;
				const size = block.heading ? SIZE.targetHeading : SIZE.target;
				const height = size + BOX_PADDING * 2;
				ops.push({
					type: 'rect',
					x: left,
					y: y - height,
					width: MARGIN + CONTENT_WIDTH - left,
					height,
					radius: 8,
					stroke: ACCENT,
					fill: WHITE,
					lineWidth: 1.4,
				});
				ops.push({
					type: 'text',
					x: left + BOX_PADDING,
					y: y - BOX_PADDING - size * 0.84,
					size,
					text: block.text,
					bold: block.heading,
					color: INK,
				});
				y -= height + 8;
				break;
			}
			case 'after':
				for (const text of block.lines) line(text, MUTED);
				break;
		}
	}
	return { ops, bottom: y };
}
