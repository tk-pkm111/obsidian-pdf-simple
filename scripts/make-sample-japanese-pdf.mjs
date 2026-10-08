// dev-vault/PDF/sample-japanese.pdf を作る（自作のテスト用 PDF。個人の情報は含まない）。
// 日本語は、埋め込まないフォント + 定義済みの CMap（UniJIS-UCS2-H）で書く。
// pdf.js で描くとき、cMap の場所（cMapUrl）を渡さないと文字が描かれない種類の PDF（範囲を画像にする機能の確認用）。
// 段落の途中の折り返し・箇条書き・段落の切れ目・図を含む（ハイライトを段落の形でノートに入れる機能の確認用）。
//   node scripts/make-sample-japanese-pdf.mjs
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const OUT = path.join(import.meta.dirname, '..', 'dev-vault', 'PDF', 'sample-japanese.pdf');
const SIZE = 12;
const LEADING = 20;
const PER_LINE = 36;
const LEFT = 72;

/** UCS-2（ビッグエンディアン）の16進 */
const hex = (text) =>
	[...text].map((char) => char.codePointAt(0).toString(16).padStart(4, '0')).join('');

const wrap = (text) => {
	const chars = [...text];
	const lines = [];
	for (let i = 0; i < chars.length; i += PER_LINE) lines.push(chars.slice(i, i + PER_LINE).join(''));
	return lines;
};

const ops = [];
let y = 760;
const text = (line, size = SIZE, x = LEFT) => {
	ops.push(`BT /F1 ${size} Tf ${x} ${y} Td <${hex(line)}> Tj ET`);
	y -= size === SIZE ? LEADING : size + 12;
};

text('試験用の日本語の文書', 18);
y -= 8;
for (const line of wrap(
	'この文書は、プラグインの動きを確かめるために作った試験用の資料です。個人の情報は含みません。段落の途中で行が折り返しても、ノートには一つの段落として入るかを確かめます。',
))
	text(line);
y -= 10;
text('次の三つが論点です。');
text('・一つ目の論点は、どの業務に使うかです');
text('・二つ目の論点は、現場にどう受け入れてもらうかです');
text('・三つ目の論点は、効果をどう説明するかです');
y -= 10;
for (const line of wrap(
	'二つ目の段落です。前の段落とは行の間を少し空けています。この段落も途中で折り返し、最後の行は短くなります。',
))
	text(line);

// 図: 枠と色の付いた棒、その中に日本語の見出し
y -= 20;
const top = y;
ops.push(`0.2 0.4 0.8 RG 1.5 w ${LEFT} ${top - 170} 300 170 re S`);
ops.push(`0.85 0.92 1 rg ${LEFT + 20} ${top - 150} 60 110 re f`);
ops.push(`0.6 0.8 1 rg ${LEFT + 110} ${top - 150} 60 70 re f`);
ops.push(`0.3 0.55 0.9 rg ${LEFT + 200} ${top - 150} 60 130 re f`);
ops.push('0 0 0 rg');
y = top - 20;
text('図１　三つの棒の図', 14, LEFT + 20);
y = top - 166;
text('左から、計画・実行・評価', 10, LEFT + 20);

const content = ops.join('\n');
const toUnicode = [
	'/CIDInit /ProcSet findresource begin',
	'12 dict begin',
	'begincmap',
	'/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
	'/CMapName /Adobe-Identity-UCS def',
	'/CMapType 2 def',
	'1 begincodespacerange',
	'<0000> <FFFF>',
	'endcodespacerange',
	// 1 つの beginbfrange に書けるのは 100 件まで
	...[0, 100, 200].map((from) => {
		const lines = [];
		for (let i = from; i < Math.min(from + 100, 256); i++) {
			const high = i.toString(16).padStart(2, '0');
			lines.push(`<${high}00> <${high}ff> <${high}00>`);
		}
		return [`${lines.length} beginbfrange`, ...lines, 'endbfrange'].join('\n');
	}),
	'endcmap',
	'CMapName currentdict /CMap defineresource pop',
	'end',
	'end',
].join('\n');

const objects = [
	'<< /Type /Catalog /Pages 2 0 R >>',
	'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
	'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
	`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
	'<< /Type /Font /Subtype /Type0 /BaseFont /KozMinPr6N-Regular /Encoding /UniJIS-UCS2-H /DescendantFonts [6 0 R] /ToUnicode 8 0 R >>',
	'<< /Type /Font /Subtype /CIDFontType0 /BaseFont /KozMinPr6N-Regular /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> /FontDescriptor 7 0 R /DW 1000 >>',
	'<< /Type /FontDescriptor /FontName /KozMinPr6N-Regular /Flags 4 /FontBBox [-437 -340 1147 1317] /ItalicAngle 0 /Ascent 880 /Descent -120 /CapHeight 742 /StemV 80 >>',
	`<< /Length ${Buffer.byteLength(toUnicode)} >>\nstream\n${toUnicode}\nendstream`,
];

let pdf = '%PDF-1.7\n';
const offsets = [];
objects.forEach((body, i) => {
	offsets.push(Buffer.byteLength(pdf));
	pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
writeFileSync(OUT, pdf);
console.log(`wrote ${OUT} (${Buffer.byteLength(pdf)} bytes)`);
