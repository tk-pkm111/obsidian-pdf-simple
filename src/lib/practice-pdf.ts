/**
 * 小さな PDF を組み立てる（練習用の PDF のため。純粋な文字列操作で、外部の素材は使わない）。
 * 日本語は、埋め込まないフォント + 定義済みの CMap（UniJIS-UCS2-HW-H。ASCII は半角幅）で書く。
 * 英語は、標準のフォント（Helvetica）で書く。どちらもフォントを埋め込まないので数 KB に収まる。
 * PDF の中身はすべて ASCII（日本語は 16 進で書く）なので、文字数がそのままバイト数になる。
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
	stroke?: Rgb;
	fill?: Rgb;
	lineWidth?: number;
}

export type DrawOp = TextOp | RectOp;

/** A4（ポイント） */
export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;

/** 日本語の文字の幅（em）。ASCII は半角（0.5）、それ以外は全角（1） */
export function jaTextWidth(text: string, size: number): number {
	let em = 0;
	for (const char of text) {
		const code = char.codePointAt(0) ?? 0;
		em += code >= 0x20 && code <= 0x7e ? 0.5 : 1;
	}
	return em * size;
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
		const code = char.codePointAt(0) ?? 0;
		if (code < 0x20 || code > 0x7e) out += '?';
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

function contentStream(ops: readonly DrawOp[], script: PdfScript): string {
	const lines: string[] = [];
	for (const op of ops) {
		if (op.type === 'rect') {
			const box = `${num(op.x)} ${num(op.y)} ${num(op.width)} ${num(op.height)} re`;
			if (op.fill) lines.push(`${rgb(op.fill, 'rg')} ${box} f`);
			if (op.stroke)
				lines.push(
					`${rgb(op.stroke, 'RG')} ${num(op.lineWidth ?? 1)} w ${box} S`,
				);
			continue;
		}
		const font = op.bold ? 'F2' : 'F1';
		const encoded =
			script === 'ja' ? `<${ucs2Hex(op.text)}>` : latinLiteral(op.text);
		lines.push(
			`BT ${rgb(op.color ?? [0, 0, 0], 'rg')} /${font} ${num(op.size)} Tf ${num(op.x)} ${num(op.y)} Td ${encoded} Tj ET`,
		);
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

/** フォントの辞書（オブジェクト番号 first から並べる）。戻り値は [F1, F2] の番号と、足したオブジェクト */
function fontObjects(
	script: PdfScript,
	first: number,
): { refs: [number, number]; objects: string[] } {
	if (script === 'latin')
		return {
			refs: [first, first + 1],
			objects: [
				'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
				'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
			],
		};
	// 日本語: Type0 → CIDFont → FontDescriptor を太さごとに。ToUnicode は共有する
	const toUnicode = first + 6;
	const objects: string[] = [];
	const refs: number[] = [];
	['KozGoPr6N-Regular', 'KozGoPr6N-Bold'].forEach((name, i) => {
		const base = first + i * 3;
		refs.push(base);
		objects.push(
			`<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /UniJIS-UCS2-HW-H /DescendantFonts [${base + 1} 0 R] /ToUnicode ${toUnicode} 0 R >>`,
			`<< /Type /Font /Subtype /CIDFontType0 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor ${base + 2} 0 R /DW 1000 /W [231 325 500] >>`,
			`<< /Type /FontDescriptor /FontName /${name} /Flags ${i === 0 ? 4 : 262148} /FontBBox [-437 -340 1147 1317] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 742 /StemV ${i === 0 ? 80 : 160} >>`,
		);
	});
	objects.push(stream(identityToUnicode()));
	return { refs: [refs[0] ?? first, refs[1] ?? first + 3], objects };
}

/** ページごとの描画から PDF を作る（ASCII だけの文字列） */
export function buildPdfSource(
	pages: readonly (readonly DrawOp[])[],
	script: PdfScript,
	title: string,
): string {
	// 1: Catalog, 2: Pages, 3: Info, 4..: Page と Contents の組、その後ろにフォント
	const pageCount = Math.max(1, pages.length);
	const firstPage = 4;
	const fontStart = firstPage + pageCount * 2;
	const fonts = fontObjects(script, fontStart);
	const resources = `<< /Font << /F1 ${fonts.refs[0]} 0 R /F2 ${fonts.refs[1]} 0 R >> >>`;
	const kids: string[] = [];
	const pageObjects: string[] = [];
	for (let i = 0; i < pageCount; i++) {
		const pageRef = firstPage + i * 2;
		kids.push(`${pageRef} 0 R`);
		pageObjects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources ${resources} /Contents ${pageRef + 1} 0 R >>`,
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
): ArrayBuffer {
	const source = buildPdfSource(pages, script, title);
	const buffer = new ArrayBuffer(source.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < source.length; i++) bytes[i] = source.charCodeAt(i);
	return buffer;
}
