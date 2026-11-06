import { describe, expect, it } from 'vitest';
import {
	buildPdf,
	buildPdfSource,
	jaTextWidth,
	latinLiteral,
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

describe('ucs2Hex / latinLiteral / jaTextWidth', () => {
	it('日本語は UCS-2 の 16 進。基本多言語面の外の文字は除く', () => {
		expect(ucs2Hex('あA')).toBe('30420041');
		expect(ucs2Hex('a😀b')).toBe('00610062');
	});

	it('標準のフォントの文字列は括弧と \\ を逃がし、ASCII の外は ? にする', () => {
		expect(latinLiteral('a (b) \\ c')).toBe('(a \\(b\\) \\\\ c)');
		expect(latinLiteral('café')).toBe('(caf?)');
	});

	it('日本語の幅は ASCII が半角、それ以外が全角', () => {
		expect(jaTextWidth('あA', 10)).toBe(15);
		expect(jaTextWidth('PDF の', 12)).toBe(12 * (0.5 * 4 + 1));
	});
});

describe('buildPdfSource', () => {
	it('日本語: 埋め込まないフォント（半角の CMap と幅）で、xref が正しく、中身は ASCII だけ', () => {
		const source = buildPdfSource([OPS], 'ja', 'PDF Simple の練習');
		expect(source.startsWith('%PDF-1.7\n')).toBe(true);
		expect(source.endsWith('%%EOF\n')).toBe(true);
		expect(source).toContain('/Encoding /UniJIS-UCS2-HW-H');
		expect(source).toContain('/W [231 325 500]');
		expect(source).toContain(`<${ucs2Hex('PDF の練習（1）')}> Tj`);
		expect(source).toContain('0.2 0.3 0.8 RG 1.2 w 56 700 483 40 re S');
		expect(isPrintableAscii(source)).toBe(true);
		expect(xrefPointsAtObjects(source)).toBe(true);
	});

	it('英語: 標準のフォント（Helvetica）で書く', () => {
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

	it('ページが無くても 1 ページの PDF になる。buildPdf は同じ中身のバイト列', () => {
		const source = buildPdfSource([], 'latin', 'Empty');
		expect(source).toContain('/Count 1');
		const bytes = new Uint8Array(buildPdf([OPS], 'ja', 'x'));
		const again = buildPdfSource([OPS], 'ja', 'x');
		expect(bytes.length).toBe(again.length);
		expect(String.fromCharCode(...bytes.slice(0, 9))).toBe('%PDF-1.7\n');
	});
});
