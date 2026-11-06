/**
 * 小さな PDF を組み立てる（練習用の PDF のため。純粋な文字列操作で、外部の素材は使わない）。
 * 日本語の文字は、埋め込まないフォント + 定義済みの CMap（UniJIS-UCS2-H）で書く。
 * 英数字は、日本語の中でも英字用の標準のフォント（Helvetica）に切り替えて書く（日本語のフォントの半角で書くと字形が崩れるため）。
 * 日本語の太字は、細字に同じ色の縁を足して描く（太字のフォントを埋め込まずに使うと、字幅が詰まって字間が空いて見えるため）。
 * どちらもフォントを埋め込まないので数 KB に収まる。中身はすべて ASCII（日本語は 16 進）なので、文字数がそのままバイト数になる。
 */

export type PdfScript = 'ja' | 'latin';
export type Rgb = readonly [number, number, number];

export interface TextOp {
	type: 'text';
	x: number;
	y: number;
	size: number;
	text: string;
	bold?: boolean;
	color?: Rgb;
}

export interface RectOp {
	type: 'rect';
	x: number;
	y: number;
	width: number;
	height: number;
	/** 角の丸み（0 なら四角） */
	radius?: number;
	stroke?: Rgb;
	fill?: Rgb;
	lineWidth?: number;
}

export interface CircleOp {
	type: 'circle';
	cx: number;
	cy: number;
	r: number;
	fill: Rgb;
}

export type DrawOp = TextOp | RectOp | CircleOp;

/** A4（ポイント） */
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

/** ページの大きさ（ポイント）。既定は A4 */
export interface PageSize {
	width: number;
	height: number;
}
export const A4: PageSize = { width: PAGE_WIDTH, height: PAGE_HEIGHT };

/** Helvetica の字幅（1000 分の 1 em。ASCII の 32〜126。標準の AFM の値） */
const HELVETICA = [
	278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278,
	278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584,
	584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556,
	833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278,
	278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222,
	500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
	500, 334, 260, 334, 584,
];
const HELVETICA_BOLD = [
	278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278,
	278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584,
	584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611,
	833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333,
	278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278,
	556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
	500, 389, 280, 389, 584,
];

function isAscii(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;
	return code >= 0x20 && code <= 0x7e;
}

/** 英数字（ASCII）と、それ以外（日本語）のひと続きに分ける */
export function splitRuns(text: string): { latin: boolean; text: string }[] {
	const runs: { latin: boolean; text: string }[] = [];
	for (const char of text) {
		const latin = isAscii(char);
		const last = runs[runs.length - 1];
		if (last && last.latin === latin) last.text += char;
		else runs.push({ latin, text: char });
	}
	return runs;
}

/** 英字用のフォントでの幅（ポイント）。ASCII の外の文字は全角として数える */
export function latinWidth(text: string, size: number, bold = false): number {
	const table = bold ? HELVETICA_BOLD : HELVETICA;
	let units = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		units += isAscii(char) ? (table[code - 32] ?? 556) : 1000;
	}
	return (units / 1000) * size;
}

/** 文字の幅（ポイント）。日本語の文字は全角（1 em）、英数字は Helvetica の字幅 */
export function textWidth(text: string, size: number, bold = false): number {
	let width = 0;
	for (const run of splitRuns(text))
		width += run.latin
			? latinWidth(run.text, size, bold)
			: [...run.text].length * size;
	return width;
}

/** UCS-2（ビッグエンディアン）の 16 進。基本多言語面の外の文字は書けないので除く */
export function ucs2Hex(text: string): string {
	let hex = '';
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		if (code > 0xffff) continue;
		hex += code.toString(16).padStart(4, '0');
	}
	return hex;
}

/** 標準のフォントに書ける文字列（括弧と \ を逃がす。ASCII の外の文字は ? にする） */
export function latinLiteral(text: string): string {
	let out = '';
	for (const char of text) {
		if (!isAscii(char)) out += '?';
		else if (char === '(' || char === ')' || char === '\\')
			out += `\\${char}`;
		else out += char;
	}
	return `(${out})`;
}

function num(value: number): string {
	return String(Math.round(value * 100) / 100);
}

function rgb(color: Rgb, op: 'rg' | 'RG'): string {
	return `${color.map(num).join(' ')} ${op}`;
}

/** 角を丸めた四角の道筋（radius が 0 なら re） */
function roundedPath(
	x: number,
	y: number,
	w: number,
	h: number,
	radius: number,
): string {
	const r = Math.min(radius, w / 2, h / 2);
	if (r <= 0) return `${num(x)} ${num(y)} ${num(w)} ${num(h)} re`;
	const k = 0.5523 * r;
	const p = (...values: number[]) => values.map(num).join(' ');
	return [
		`${p(x + r, y)} m`,
		`${p(x + w - r, y)} l`,
		`${p(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} c`,
		`${p(x + w, y + h - r)} l`,
		`${p(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} c`,
		`${p(x + r, y + h)} l`,
		`${p(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} c`,
		`${p(x, y + r)} l`,
		`${p(x, y + r - k, x + r - k, y, x + r, y)} c`,
		'h',
	].join(' ');
}

function textOps(op: TextOp, script: PdfScript): string[] {
	const color = rgb(op.color ?? [0, 0, 0], 'rg');
	// 英語の PDF は英字用のフォント（F1 / F2）だけ。日本語の PDF は日本語（F1 / F2）と英字（F3 / F4）を切り替える
	if (script === 'latin')
		return [
			`BT ${color} /${op.bold ? 'F2' : 'F1'} ${num(op.size)} Tf ${num(op.x)} ${num(op.y)} Td ${latinLiteral(op.text)} Tj ET`,
		];
	const lines: string[] = [];
	let x = op.x;
	for (const run of splitRuns(op.text)) {
		const at = `${num(op.size)} Tf ${num(x)} ${num(op.y)} Td`;
		if (run.latin)
			lines.push(
				`BT ${color} /${op.bold ? 'F4' : 'F3'} ${at} ${latinLiteral(run.text)} Tj ET`,
			);
		// 日本語の太字は、細字に同じ色の縁を足して描く（2 Tr。太字のフォントは埋め込まないと字幅が崩れて見えるため）。
		// 縁の太さと描き方は描画の状態に残るので q … Q で囲む
		else if (op.bold)
			lines.push(
				`q ${color} ${rgb(op.color ?? [0, 0, 0], 'RG')} ${num(op.size * 0.035)} w BT 2 Tr /F1 ${at} <${ucs2Hex(run.text)}> Tj ET Q`,
			);
		else lines.push(`BT ${color} /F1 ${at} <${ucs2Hex(run.text)}> Tj ET`);
		x += run.latin
			? latinWidth(run.text, op.size, op.bold)
			: [...run.text].length * op.size;
	}
	return lines;
}

function shapeOps(op: RectOp | CircleOp): string {
	const path =
		op.type === 'circle'
			? roundedPath(op.cx - op.r, op.cy - op.r, op.r * 2, op.r * 2, op.r)
			: roundedPath(op.x, op.y, op.width, op.height, op.radius ?? 0);
	const fill = op.fill;
	const stroke = op.type === 'rect' ? op.stroke : undefined;
	const parts: string[] = [];
	if (fill) parts.push(rgb(fill, 'rg'));
	if (stroke && op.type === 'rect')
		parts.push(rgb(stroke, 'RG'), `${num(op.lineWidth ?? 1)} w`);
	parts.push(path, fill && stroke ? 'B' : fill ? 'f' : 'S');
	return parts.join(' ');
}

function contentStream(ops: readonly DrawOp[], script: PdfScript): string {
	const lines: string[] = [];
	for (const op of ops) {
		if (op.type === 'text') lines.push(...textOps(op, script));
		else lines.push(shapeOps(op));
	}
	return lines.join('\n');
}

/** 2 バイトの符号をそのまま Unicode として読む ToUnicode（テキスト層・コピーの文字のため） */
function identityToUnicode(): string {
	const ranges: string[] = [];
	// 1 つの beginbfrange に書けるのは 100 件まで
	for (let from = 0; from < 256; from += 100) {
		const lines: string[] = [];
		for (let i = from; i < Math.min(from + 100, 256); i++) {
			const high = i.toString(16).padStart(2, '0');
			lines.push(`<${high}00> <${high}ff> <${high}00>`);
		}
		ranges.push(`${lines.length} beginbfrange`, ...lines, 'endbfrange');
	}
	return [
		'/CIDInit /ProcSet findresource begin',
		'12 dict begin',
		'begincmap',
		'/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
		'/CMapName /Adobe-Identity-UCS def',
		'/CMapType 2 def',
		'1 begincodespacerange',
		'<0000> <FFFF>',
		'endcodespacerange',
		...ranges,
		'endcmap',
		'CMapName currentdict /CMap defineresource pop',
		'end',
		'end',
	].join('\n');
}

function stream(body: string): string {
	return `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
}

/** 英字用の標準のフォント（字幅つき。pdf.js の置き方と、こちらの幅の計算を揃える） */
function latinFont(bold: boolean): string {
	const name = bold ? 'Helvetica-Bold' : 'Helvetica';
	const widths = (bold ? HELVETICA_BOLD : HELVETICA).join(' ');
	return `<< /Type /Font /Subtype /Type1 /BaseFont /${name} /Encoding /WinAnsiEncoding /FirstChar 32 /LastChar 126 /Widths [${widths}] >>`;
}

/** フォントの辞書（オブジェクト番号 first から並べる）。戻り値は F1… の名前と番号、足したオブジェクト */
function fontObjects(
	script: PdfScript,
	first: number,
): { refs: [string, number][]; objects: string[] } {
	if (script === 'latin')
		return {
			refs: [
				['F1', first],
				['F2', first + 1],
			],
			objects: [latinFont(false), latinFont(true)],
		};
	// 日本語: Type0 → CIDFont → FontDescriptor → ToUnicode（F1。太字は描き方で出す）。英字は F3 / F4
	const name = 'KozGoPr6N-Regular';
	return {
		refs: [
			['F1', first],
			['F3', first + 4],
			['F4', first + 5],
		],
		objects: [
			`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /UniJIS-UCS2-H /DescendantFonts [${first + 1} 0 R] /ToUnicode ${first + 3} 0 R >>`,
			`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor ${first + 2} 0 R /DW 1000 >>`,
			`<< /Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [-437 -340 1147 1317] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 742 /StemV 80 >>`,
			stream(identityToUnicode()),
			latinFont(false),
			latinFont(true),
		],
	};
}

/** ページごとの描画から PDF を作る（ASCII だけの文字列） */
export function buildPdfSource(
	pages: readonly (readonly DrawOp[])[],
	script: PdfScript,
	title: string,
	size: PageSize = A4,
): string {
	// 1: Catalog, 2: Pages, 3: Info, 4..: Page と Contents の組、その後ろにフォント
	const pageCount = Math.max(1, pages.length);
	const firstPage = 4;
	const fontStart = firstPage + pageCount * 2;
	const fonts = fontObjects(script, fontStart);
	const fontDict = fonts.refs
		.map(([name, ref]) => `/${name} ${ref} 0 R`)
		.join(' ');
	const resources = `<< /Font << ${fontDict} >> >>`;
	const kids: string[] = [];
	const pageObjects: string[] = [];
	for (let i = 0; i < pageCount; i++) {
		const pageRef = firstPage + i * 2;
		kids.push(`${pageRef} 0 R`);
		pageObjects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${size.width} ${size.height}] /Resources ${resources} /Contents ${pageRef + 1} 0 R >>`,
			stream(contentStream(pages[i] ?? [], script)),
		);
	}
	const info =
		script === 'ja'
			? `<< /Title <feff${ucs2Hex(title)}> /Producer (PDF Simple) >>`
			: `<< /Title ${latinLiteral(title)} /Producer (PDF Simple) >>`;
	const objects = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`,
		info,
		...pageObjects,
		...fonts.objects,
	];
	let pdf = '%PDF-1.7\n';
	const offsets: number[] = [];
	objects.forEach((body, i) => {
		offsets.push(pdf.length);
		pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
	});
	const xref = pdf.length;
	pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
	for (const offset of offsets)
		pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return pdf;
}

/** buildPdfSource のバイト列（中身は ASCII だけ。Vault.createBinary にそのまま渡せる形） */
export function buildPdf(
	pages: readonly (readonly DrawOp[])[],
	script: PdfScript,
	title: string,
	size: PageSize = A4,
): ArrayBuffer {
	const source = buildPdfSource(pages, script, title, size);
	const buffer = new ArrayBuffer(source.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i);
	return buffer;
}
