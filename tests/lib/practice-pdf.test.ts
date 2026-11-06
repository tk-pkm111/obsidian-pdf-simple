import { describe, expect, it } from 'vitest';
import {
	buildPdf,
	buildPdfSource,
	latinLiteral,
	latinWidth,
	splitRuns,
	textWidth,
	ucs2Hex,
	type DrawOp,
} from '../../src/lib/practice-pdf';

/** 改行と表示できる ASCII だけか */
function isPrintableAscii(text: string): boolean {
	return [...text].every((c) => c === '\n' || (c >= ' ' && c <= '~'));
}

const OPS: DrawOp[] = [
	{ type: 'text', x: 56, y: 760, size: 12, text: 'PDF の練習（1）' },
	{
		type: 'rect',
		x: 56,
		y: 700,
		width: 483,
		height: 40,
		stroke: [0.2, 0.3, 0.8],
		lineWidth: 1.2,
	},
	{ type: 'circle', cx: 60, cy: 600, r: 10, fill: [0.4, 0.3, 0.9] },
];

/** xref に書いた位置が、それぞれ `N 0 obj` の始まりを指しているか */
function xrefPointsAtObjects(source: string): boolean {
	const start = Number(/startxref\n(\d+)\n/.exec(source)?.[1]);
	const table = source.slice(start).split('\n');
	const count = Number(/^0 (\d+)$/.exec(table[1] ?? '')?.[1]);
	for (let n = 1; n < count; n++) {
		const offset = Number(table[2 + n]?.slice(0, 10));
		if (!source.startsWith(`${n} 0 obj\n`, offset)) return false;
	}
	return count > 1;
}

describe('文字の扱い', () => {
	it('英数字（ASCII）とそれ以外のひと続きに分ける', () => {
		expect(splitRuns('この PDF は')).toEqual([
			{ latin: false, text: 'この' },
			{ latin: true, text: ' PDF ' },
			{ latin: false, text: 'は' },
		]);
	});

	it('幅: 日本語は全角、英数字は Helvetica の字幅（太字は別の字幅）', () => {
		expect(latinWidth('PDF', 10)).toBeCloseTo(
			((667 + 722 + 611) / 1000) * 10,
		);
		expect(latinWidth('PDF', 10, true)).toBeCloseTo(
			((667 + 722 + 611) / 1000) * 10,
		);
		expect(latinWidth('i', 10, true)).toBeCloseTo(2.78);
		expect(textWidth('あi', 10)).toBeCloseTo(10 + 2.22);
	});

	it('日本語は UCS-2 の 16 進。基本多言語面の外の文字は除く', () => {
		expect(ucs2Hex('あA')).toBe('30420041');
		expect(ucs2Hex('a😀b')).toBe('00610062');
	});

	it('標準のフォントの文字列は括弧と \\ を逃がし、ASCII の外は ? にする', () => {
		expect(latinLiteral('a (b) \\ c')).toBe('(a \\(b\\) \\\\ c)');
		expect(latinLiteral('café')).toBe('(caf?)');
	});
});

describe('buildPdfSource', () => {
	it('日本語: 日本語の字は埋め込まないフォント、英数字は Helvetica に切り替える。xref が正しく、中身は ASCII だけ', () => {
		const source = buildPdfSource([OPS], 'ja', 'PDF Simple の練習');
		expect(source.startsWith('%PDF-1.7\n')).toBe(true);
		expect(source.endsWith('%%EOF\n')).toBe(true);
		expect(source).toContain('/Encoding /UniJIS-UCS2-H ');
		expect(source).toContain(
			'/BaseFont /Helvetica /Encoding /WinAnsiEncoding',
		);
		// 「PDF」は英字のフォント（F3）、続く日本語は日本語のフォント（F1）で、英字の幅だけ右に置く
		expect(source).toContain('/F3 12 Tf 56 760 Td (PDF ) Tj');
		const x = 56 + latinWidth('PDF ', 12);
		expect(source).toContain(
			`/F1 12 Tf ${Math.round(x * 100) / 100} 760 Td <${ucs2Hex('の練習（')}> Tj`,
		);
		expect(source).toContain('0.2 0.3 0.8 RG 1.2 w 56 700 483 40 re S');
		expect(source).not.toContain('KozGoPr6N-Bold');
		expect(source).toMatch(/0\.4 0\.3 0\.9 rg 60 590 m .* h f/);
		expect(isPrintableAscii(source)).toBe(true);
		expect(xrefPointsAtObjects(source)).toBe(true);
	});

	it('日本語の太字は、細字に同じ色の縁を足して描く（q … Q で囲む）。英字の太字は Helvetica-Bold', () => {
		const source = buildPdfSource(
			[
				[
					{
						type: 'text',
						x: 10,
						y: 20,
						size: 20,
						text: 'PDF の練習',
						bold: true,
						color: [0.1, 0.2, 0.3],
					},
				],
			],
			'ja',
			'x',
		);
		expect(source).toContain('/F4 20 Tf 10 20 Td (PDF ) Tj');
		expect(source).toMatch(
			/q 0\.1 0\.2 0\.3 rg 0\.1 0\.2 0\.3 RG 0\.7 w BT 2 Tr \/F1 20 Tf [\d.]+ 20 Td <[0-9a-f]+> Tj ET Q/,
		);
	});

	it('英語: 標準のフォント（Helvetica）だけで書く', () => {
		const source = buildPdfSource(
			[
				[
					{
						type: 'text',
						x: 56,
						y: 760,
						size: 12,
						text: 'Hi (there)',
						bold: true,
					},
				],
			],
			'latin',
			'Practice',
		);
		expect(source).toContain('/BaseFont /Helvetica-Bold');
		expect(source).toContain('/F2 12 Tf 56 760 Td (Hi \\(there\\)) Tj');
		expect(source).not.toContain('UniJIS');
		expect(xrefPointsAtObjects(source)).toBe(true);
	});

	it('角を丸めた四角は曲線で、塗りと線の両方なら B', () => {
		const source = buildPdfSource(
			[
				[
					{
						type: 'rect',
						x: 0,
						y: 0,
						width: 100,
						height: 40,
						radius: 8,
						fill: [1, 1, 1],
						stroke: [0, 0, 0],
					},
				],
			],
			'latin',
			'x',
		);
		expect(source).toMatch(/1 1 1 rg 0 0 0 RG 1 w 8 0 m .* c h B/);
	});

	it('ページが無くても 1 ページの PDF になる。buildPdf は同じ中身のバイト列', () => {
		const source = buildPdfSource([], 'latin', 'Empty');
		expect(source).toContain('/Count 1');
		const bytes = new Uint8Array(buildPdf([OPS], 'ja', 'x'));
		const again = buildPdfSource([OPS], 'ja', 'x');
		expect(bytes.length).toBe(again.length);
		expect(String.fromCharCode(...bytes.slice(0, 9))).toBe('%PDF-1.7\n');
	});
});
