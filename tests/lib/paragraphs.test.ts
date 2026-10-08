import { describe, expect, it } from 'vitest';
import {
	columnRightOf,
	joinPdfLines,
	type LineBox,
} from '../../src/lib/paragraphs';

/** 行の高さ 10、行間 6 の行を上から順に作る */
function lines(
	...items: Array<[string, number] | [string, number, number]>
): LineBox[] {
	let top = 0;
	return items.map(([text, right, extraGap = 0]) => {
		top += extraGap;
		const line = { text, left: 0, right, top, bottom: top + 10 };
		top += 16;
		return line;
	});
}

describe('joinPdfLines', () => {
	it('右端まで届いた行は折り返しとしてつなぐ（日本語は詰める、英語は空白）', () => {
		expect(
			joinPdfLines(
				lines(['これは折り返された', 300], ['文章です。', 120]),
			),
		).toBe('これは折り返された文章です。');
		expect(
			joinPdfLines(
				lines(['A long line that wraps', 300], ['onto the next.', 120]),
			),
		).toBe('A long line that wraps onto the next.');
	});

	it('箇条書きの記号で始まる行の前では改行を残す', () => {
		expect(
			joinPdfLines(
				lines(
					[
						'・どの業務にAIエージェントを適用し、どの業務には適用しないか',
						300,
					],
					['・現場にどのように受け入れてもらうか', 180],
					['・投資対効果をどのように説明するか', 170],
				),
			),
		).toBe(
			'・どの業務にAIエージェントを適用し、どの業務には適用しないか\n・現場にどのように受け入れてもらうか\n・投資対効果をどのように説明するか',
		);
		expect(
			joinPdfLines(
				lines(
					['Steps:', 60],
					['1. Open the file', 120],
					['2) Save', 50],
				),
			),
		).toBe('Steps:\n1. Open the file\n2) Save');
	});

	it('日本語は、前の行が右端まで届いていなければ段落の切れ目', () => {
		expect(
			joinPdfLines(
				lines(
					['一つ目の段落の最後の行。', 150],
					['二つ目の段落は右端まで続く長い行で', 300],
					['折り返している。', 100],
				),
			),
		).toBe(
			'一つ目の段落の最後の行。\n二つ目の段落は右端まで続く長い行で折り返している。',
		);
	});

	it('英語は、文の終わりで短い行か、かなり短い行のときだけ切れ目（右端がそろわない文のため）', () => {
		expect(
			joinPdfLines(
				lines(
					['First paragraph ends here.', 200],
					['Second one starts', 300],
					['and wraps', 80],
				),
			),
		).toBe('First paragraph ends here.\nSecond one starts and wraps');
		expect(
			joinPdfLines(
				lines(['A ragged line that', 260], ['continues here', 120]),
			),
		).toBe('A ragged line that continues here');
	});

	it('行の間がはっきり広ければ切れ目', () => {
		expect(
			joinPdfLines(
				lines(
					['Line one of the block', 300],
					['line two', 300],
					['New block after a gap', 300, 14],
				),
			),
		).toBe('Line one of the block line two\nNew block after a gap');
	});

	it('数字の小数・空行・空白の整理', () => {
		expect(
			joinPdfLines(lines(['The value is', 300], ['3.14 here', 80])),
		).toBe('The value is 3.14 here');
		// 空の行は捨てる（その分の行間が空くので、そこは切れ目になる）
		expect(
			joinPdfLines(lines(['  a   b  ', 300], ['', 0], ['c', 20])),
		).toBe('a b\nc');
		expect(joinPdfLines(lines(['  a   b  ', 300], ['c', 20]))).toBe(
			'a b c',
		);
		expect(joinPdfLines([])).toBe('');
	});
});

describe('columnRightOf（段の右端）', () => {
	it('左端がそろう行の右端のいちばん右。短い行ばかり選んでも段落の切れ目が分かる', () => {
		const page = lines(
			['一つ目の段落は右端まで続く長い行で', 300],
			['確かめます。', 120],
			['次の三つが論点です。', 110],
		);
		const selected = page.slice(1);
		const right = columnRightOf(page, selected);
		expect(right).toBe(300);
		expect(joinPdfLines(selected)).toBe('確かめます。次の三つが論点です。');
		expect(joinPdfLines(selected, right)).toBe(
			'確かめます。\n次の三つが論点です。',
		);
	});

	it('別の段（左端が離れた行）は数えない。選んだ行が無ければ undefined', () => {
		const page = [
			{ text: 'a', left: 0, right: 100, top: 0, bottom: 10 },
			{ text: 'b', left: 400, right: 700, top: 0, bottom: 10 },
		];
		expect(columnRightOf(page, [page[0] as LineBox])).toBe(100);
		expect(columnRightOf(page, [])).toBeUndefined();
	});
});
