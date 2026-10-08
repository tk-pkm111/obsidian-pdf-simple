import { describe, expect, it } from 'vitest';
import {
	escapeNoteText,
	normalizeSelectedText,
	textKey,
	truncateText,
} from '../../src/lib/text';

describe('normalizeSelectedText', () => {
	it('改行と連続する空白を 1 つの空白にまとめる', () => {
		expect(
			normalizeSelectedText('  First item\n2. Second\t\titem \r\n3. T  '),
		).toBe('First item 2. Second item 3. T');
	});

	it('日本語どうしの改行は詰める', () => {
		expect(
			normalizeSelectedText('これは折り返された\n文章です。\nNext line'),
		).toBe('これは折り返された文章です。 Next line');
	});

	it('空行・NUL 文字は捨てる', () => {
		expect(normalizeSelectedText('\n\n a\u0000b \n\n')).toBe('ab');
		expect(normalizeSelectedText(' \n ')).toBe('');
	});
});

describe('escapeNoteText', () => {
	it('普通の文はそのまま', () => {
		expect(escapeNoteText('A short list (2024) - 日本語も OK')).toBe(
			'A short list (2024) - 日本語も OK',
		);
	});

	it('行頭の記号で見出し・箇条書き・引用・表・コード・区切り線にならない', () => {
		expect(escapeNoteText('# of items')).toBe('\\# of items');
		expect(escapeNoteText('## Title')).toBe('\\## Title');
		expect(escapeNoteText('- item')).toBe('\\- item');
		expect(escapeNoteText('* item')).toBe('\\* item');
		expect(escapeNoteText('+ item')).toBe('\\+ item');
		expect(escapeNoteText('3. Third item')).toBe('3\\. Third item');
		expect(escapeNoteText('12) x')).toBe('12\\) x');
		expect(escapeNoteText('> quote')).toBe('\\> quote');
		expect(escapeNoteText('| a | b |')).toBe('\\| a | b |');
		expect(escapeNoteText('```js')).toBe('\\```js');
		expect(escapeNoteText('---')).toBe('\\---');
		expect(escapeNoteText('* * *')).toBe('\\* * *');
		expect(escapeNoteText('3.14 is pi')).toBe('3.14 is pi');
		expect(escapeNoteText('-5 degrees')).toBe('-5 degrees');
	});

	it('リンク・脚注・タグ・HTML・数式・コメント・ハイライトにならない', () => {
		expect(escapeNoteText('see [[note]]')).toBe('see [\\[note]]');
		expect(escapeNoteText('text[^1]')).toBe('text[\\^1]');
		expect(escapeNoteText('#tag and C# and # alone')).toBe(
			'\\#tag and C# and # alone',
		);
		expect(escapeNoteText('a <b>bold</b>')).toBe('a \\<b>bold\\</b>');
		expect(escapeNoteText('$5 and $10')).toBe('\\$5 and \\$10');
		expect(escapeNoteText('50%% off')).toBe('50%\\% off');
		expect(escapeNoteText('a == b')).toBe('a \\== b');
		expect(escapeNoteText('x === y')).toBe('x \\=\\== y');
		expect(escapeNoteText('x=1')).toBe('x=1');
	});

	it('元の \\ が記号を打ち消さない', () => {
		expect(escapeNoteText('a\\*b')).toBe('a\\\\*b');
		expect(escapeNoteText('C:\\Users')).toBe('C:\\Users');
	});
});

describe('textKey', () => {
	it('エスケープと空白を除いて比べられる形にする', () => {
		const original = '3. Third  item == $5 [[x]]';
		expect(textKey(escapeNoteText(normalizeSelectedText(original)))).toBe(
			textKey(original),
		);
		expect(textKey('a\\\\*b')).toBe('a\\*b');
		expect(textKey('A short\nlist')).toBe('Ashortlist');
	});
});

describe('truncateText', () => {
	it('max 文字を超えたら切って … を付ける（サロゲートペアは分けない）', () => {
		expect(truncateText('abcdef', 3)).toBe('abc…');
		expect(truncateText('abc', 3)).toBe('abc');
		expect(truncateText('😀😀😀', 2)).toBe('😀😀…');
	});
});
