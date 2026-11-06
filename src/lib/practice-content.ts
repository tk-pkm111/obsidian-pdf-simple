import {
	PAGE_HEIGHT,
	PAGE_WIDTH,
	jaTextWidth,
	type DrawOp,
	type PdfScript,
	type Rgb,
} from './practice-pdf';

/**
 * 練習用の PDF の中身と配置。PDF そのものが手順になっている（上から順に試す）。
 * 行は手で折り返しておく（日本語は jaTextWidth で幅を確かめるテストがある）。
 */

export type PracticeBlock =
	| { kind: 'title'; text: string }
	| { kind: 'lead'; text: string }
	| { kind: 'step'; label: string; lines: readonly string[] }
	| { kind: 'target'; caption: string; text: string; heading?: boolean }
	| { kind: 'after'; lines: readonly string[] };

export interface PracticeContent {
	script: PdfScript;
	/** ファイル名（拡張子なし） */
	fileName: string;
	title: string;
	blocks: readonly PracticeBlock[];
}

export const MARGIN = 56;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
export const BOX_PADDING = 12;

export const SIZE = {
	title: 22,
	lead: 11,
	label: 13,
	body: 12,
	target: 15,
	targetHeading: 17,
	caption: 9,
} as const;

const ACCENT: Rgb = [0.27, 0.35, 0.85];
const MUTED: Rgb = [0.4, 0.42, 0.47];
const INK: Rgb = [0.1, 0.11, 0.14];

const JA: PracticeContent = {
	script: 'ja',
	fileName: 'PDF Simple 練習',
	title: 'PDF Simple の練習',
	blocks: [
		{ kind: 'title', text: 'PDF Simple の練習' },
		{
			kind: 'lead',
			text: 'この PDF は練習用です。上から順に、1 つずつ試してみましょう（2 分ほど）。',
		},
		{
			kind: 'step',
			label: '① なぞってハイライト',
			lines: [
				'下の枠の中の文をマウスでなぞり、出てきた色のどれかを押してください。',
			],
		},
		{
			kind: 'target',
			caption: 'ここをなぞる',
			text: 'なぞった文は、蛍光ペンのように塗られて、ノートに入ります。',
		},
		{
			kind: 'step',
			label: '② ノートを見る',
			lines: [
				'右（スマホでは同じ画面）にノートが開き、なぞった文が入ります。',
				'ノートの文は、普通に書き換えてかまいません。',
			],
		},
		{
			kind: 'step',
			label: '③ PDF とノートを行き来する',
			lines: [
				'ノートの文の後ろの小さな点を押すと、PDF のその場所に戻ります。',
				'PDF の塗った所を押すと、ノートのその行へ移ります。',
				'ヘッダーの「PDF」ボタンと紙のボタンでも、表と裏を切り替えられます。',
			],
		},
		{
			kind: 'step',
			label: '④ 見出しにする',
			lines: [
				'右上のペンで、書き方を「見出し 2」にしてから、下の行をなぞります。',
			],
		},
		{
			kind: 'target',
			caption: 'ここをなぞる',
			text: '第 1 章　はじめに',
			heading: true,
		},
		{
			kind: 'after',
			lines: ['終わったら、ペンの書き方を「本文」に戻しておきましょう。'],
		},
		{
			kind: 'step',
			label: '⑤ 自分の PDF で使う',
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
	blocks: [
		{ kind: 'title', text: 'PDF Simple practice' },
		{
			kind: 'lead',
			text: 'This PDF is for practice. Try each step from the top (about 2 minutes).',
		},
		{
			kind: 'step',
			label: 'Step 1  Highlight by selecting',
			lines: [
				'Select the sentence in the box below with the mouse, then pick a color.',
			],
		},
		{
			kind: 'target',
			caption: 'Select this',
			text: 'Selected text gets highlighted and goes into your note.',
		},
		{
			kind: 'step',
			label: 'Step 2  Look at the note',
			lines: [
				'The note opens on the right (on a phone, in the same tab).',
				'The text you selected is there. Feel free to edit it.',
			],
		},
		{
			kind: 'step',
			label: 'Step 3  Go back and forth',
			lines: [
				'Click the small dot after the text in the note to jump back to the PDF.',
				'Click a highlight in the PDF to jump to its line in the note.',
				'The PDF button and the page button in the header also flip sides.',
			],
		},
		{
			kind: 'step',
			label: 'Step 4  Make a heading',
			lines: [
				'With the pen at the top right, set the style to "Heading 2",',
				'then select the line below.',
			],
		},
		{
			kind: 'target',
			caption: 'Select this',
			text: 'Chapter 1  Introduction',
			heading: true,
		},
		{
			kind: 'after',
			lines: ['When you are done, set the pen back to "Body text".'],
		},
		{
			kind: 'step',
			label: 'Step 5  Use your own PDF',
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

/** 文字の幅（日本語は正確に、英語は Helvetica の平均の幅で大まかに） */
export function textWidth(
	script: PdfScript,
	text: string,
	size: number,
): number {
	return script === 'ja'
		? jaTextWidth(text, size)
		: text.length * size * 0.52;
}

/** 上から順に置く。戻り値の bottom は最後の行の下端（ページに収まるかのテスト用） */
export function layoutPractice(content: PracticeContent): {
	ops: DrawOp[];
	bottom: number;
} {
	const ops: DrawOp[] = [];
	let y = PAGE_HEIGHT - MARGIN;
	const line = (
		text: string,
		size: number,
		options: { bold?: boolean; color?: Rgb; gap?: number } = {},
	): void => {
		y -= size;
		ops.push({
			type: 'text',
			x: MARGIN,
			y,
			size,
			text,
			bold: options.bold,
			color: options.color ?? INK,
		});
		y -= options.gap ?? size * 0.55;
	};
	for (const block of content.blocks) {
		switch (block.kind) {
			case 'title':
				line(block.text, SIZE.title, { bold: true, gap: 12 });
				break;
			case 'lead':
				line(block.text, SIZE.lead, { color: MUTED, gap: 10 });
				break;
			case 'step':
				y -= 16;
				line(block.label, SIZE.label, {
					bold: true,
					color: ACCENT,
					gap: 8,
				});
				for (const text of block.lines) line(text, SIZE.body);
				break;
			case 'target': {
				y -= 8;
				line(block.caption, SIZE.caption, {
					bold: true,
					color: ACCENT,
					gap: 4,
				});
				const size = block.heading ? SIZE.targetHeading : SIZE.target;
				const height = size + BOX_PADDING * 2;
				ops.push({
					type: 'rect',
					x: MARGIN,
					y: y - height,
					width: CONTENT_WIDTH,
					height,
					stroke: ACCENT,
					lineWidth: 1.2,
				});
				ops.push({
					type: 'text',
					x: MARGIN + BOX_PADDING,
					y: y - BOX_PADDING - size * 0.85,
					size,
					text: block.text,
					bold: block.heading,
					color: INK,
				});
				y -= height + 8;
				break;
			}
			case 'after':
				for (const text of block.lines)
					line(text, SIZE.body, { color: MUTED });
				break;
		}
	}
	return { ops, bottom: y };
}
