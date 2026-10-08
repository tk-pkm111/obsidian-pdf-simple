import { describe, expect, it } from 'vitest';
import {
	headingLevelInSection,
	normalizeHeading,
	planInsertLine,
	planInsertOrdered,
	type InsertOptions,
	type OrderKey,
} from '../../src/lib/note-insert';
import {
	applyEdits,
	fencedLines,
	findHighlightLines,
	offsetToLineCh,
	splitLines,
} from '../../src/lib/note-lines';

const END: InsertOptions = { position: 'end', heading: '## ハイライト' };
const HEADING: InsertOptions = {
	position: 'heading',
	heading: '## ハイライト',
};

function insert(
	content: string,
	line: string,
	options: InsertOptions = END,
): string {
	return applyEdits(content, [planInsertLine(content, line, options)]);
}

describe('planInsertLine（末尾）', () => {
	it('空のノート', () => {
		expect(insert('', 'a ^hl-1')).toBe('a ^hl-1\n');
	});

	it('1 件ごとに空行で区切る（段落ごとにブロック ID が付くように）', () => {
		expect(insert('a ^hl-1\n', 'b ^hl-2')).toBe('a ^hl-1\n\nb ^hl-2\n');
		expect(insert('Some text', 'a ^hl-1')).toBe('Some text\n\na ^hl-1');
	});

	it('見出しの前後にも空行が入る', () => {
		const once = insert('a ^hl-1\n', '## T ^hl-2');
		expect(once).toBe('a ^hl-1\n\n## T ^hl-2\n');
		expect(insert(once, 'b ^hl-3')).toBe(
			'a ^hl-1\n\n## T ^hl-2\n\nb ^hl-3\n',
		);
	});

	it('第 1 弾の箇条書きの後ろには空行を挟んで段落を足す', () => {
		expect(insert('- ==a== ^hl-1\n', 'b ^hl-2')).toBe(
			'- ==a== ^hl-1\n\nb ^hl-2\n',
		);
	});

	it('箇条書きの設定では箇条書きどうしを詰める', () => {
		expect(insert('- a ^hl-1\n', '- b ^hl-2')).toBe(
			'- a ^hl-1\n- b ^hl-2\n',
		);
	});

	it('末尾の空行の手前に足す', () => {
		expect(insert('text\n\n\n', 'a ^hl-1')).toBe('text\n\na ^hl-1\n\n\n');
	});

	it('frontmatter だけのノート', () => {
		expect(insert('---\npdf: "[[d.pdf]]"\n---\n', 'a ^hl-1')).toBe(
			'---\npdf: "[[d.pdf]]"\n---\n\na ^hl-1\n',
		);
	});

	it('CRLF のノートは CRLF で足す', () => {
		expect(insert('a\r\n', 'b ^hl-1')).toBe('a\r\n\r\nb ^hl-1\r\n');
	});
});

describe('planInsertLine（見出しの下）', () => {
	it('見出しの節の最後に足す（次の見出しとの間は空行）', () => {
		const content = '# Title\n\n## ハイライト\n\na ^hl-1\n## Next\ntext\n';
		expect(insert(content, 'b ^hl-2', HEADING)).toBe(
			'# Title\n\n## ハイライト\n\na ^hl-1\n\nb ^hl-2\n\n## Next\ntext\n',
		);
	});

	it('節の中の深い見出しは節の一部として扱う', () => {
		const content = '## ハイライト\n\n### Sub ^hl-1\n\na ^hl-2\n';
		expect(insert(content, 'b ^hl-3', HEADING)).toBe(
			'## ハイライト\n\n### Sub ^hl-1\n\na ^hl-2\n\nb ^hl-3\n',
		);
	});

	it('見出しが無ければ末尾に作る。コードブロックの中の見出しは見ない', () => {
		expect(insert('text\n', 'a ^hl-1', HEADING)).toBe(
			'text\n\n## ハイライト\n\na ^hl-1\n',
		);
		expect(insert('```\n## ハイライト\n```\n', 'a ^hl-1', HEADING)).toBe(
			'```\n## ハイライト\n```\n\n## ハイライト\n\na ^hl-1\n',
		);
		expect(insert('', 'a ^hl-1', HEADING)).toBe(
			'## ハイライト\n\na ^hl-1\n',
		);
	});

	it('normalizeHeading は # が無ければ ## を付ける', () => {
		expect(normalizeHeading('メモ')).toBe('## メモ');
		expect(normalizeHeading('# メモ')).toBe('# メモ');
		expect(normalizeHeading('  ')).toBe('## ハイライト');
	});
});

describe('headingLevelInSection', () => {
	it('末尾に足すときはそのまま、見出しの下に足すときは節の見出しより深くする', () => {
		expect(headingLevelInSection(2, END)).toBe(2);
		expect(headingLevelInSection(1, HEADING)).toBe(3);
		expect(headingLevelInSection(3, HEADING)).toBe(5);
		expect(
			headingLevelInSection(3, {
				position: 'heading',
				heading: '#### X',
			}),
		).toBe(6);
	});
});

describe('planInsertOrdered（PDF の順）', () => {
	const ORDER: InsertOptions = {
		position: 'order',
		heading: '## ハイライト',
	};
	const keys: Record<string, OrderKey> = {
		'hl-a': { page: 1, pos: 0 },
		'hl-b': { page: 1, pos: 5 },
		'hl-c': { page: 2, pos: 0 },
		'hl-e': { page: 3, pos: 0 },
	};
	const ordered = (content: string, line: string, key: OrderKey) =>
		applyEdits(content, [
			planInsertOrdered(
				content,
				line,
				key,
				(id) => keys[id] ?? null,
				ORDER,
			),
		]);
	const chapters =
		'---\npdf: x\n---\n\n# Ch1 ^hl-a\n\n# Ch2 ^hl-c\n\n# Ch3 ^hl-e\n';

	it('章の見出しを先に引いておくと、本文はその章の下（次の章の手前）に入る', () => {
		const once = ordered(chapters, 't1 ^hl-x', { page: 1, pos: 5 });
		expect(once).toBe(
			'---\npdf: x\n---\n\n# Ch1 ^hl-a\n\nt1 ^hl-x\n\n# Ch2 ^hl-c\n\n# Ch3 ^hl-e\n',
		);
		keys['hl-x'] = { page: 1, pos: 5 };
		// 同じ章で後ろのものは、その章の最後に
		expect(ordered(once, 't2 ^hl-y', { page: 1, pos: 8 })).toContain(
			'# Ch1 ^hl-a\n\nt1 ^hl-x\n\nt2 ^hl-y\n\n# Ch2',
		);
		// 同じ章で前のものは、その手前に
		expect(ordered(once, 't0 ^hl-y', { page: 1, pos: 2 })).toContain(
			'# Ch1 ^hl-a\n\nt0 ^hl-y\n\nt1 ^hl-x\n\n# Ch2',
		);
		delete keys['hl-x'];
	});

	it('いちばん後ろなら、先行の後ろに書いた自分の文の後ろ（次の見出しの手前）', () => {
		const content = 'a ^hl-a\nmy notes\n\n## Summary\nmine\n';
		expect(ordered(content, 'n ^hl-x', { page: 1, pos: 9 })).toBe(
			'a ^hl-a\nmy notes\n\nn ^hl-x\n\n## Summary\nmine\n',
		);
	});

	it('先行が見出しなら、その節の終わり（同じか上の階層の次の見出しの手前）', () => {
		const content = '# Ch3 ^hl-e\nthoughts\n## My sub\nmore\n# Appendix\n';
		expect(ordered(content, 'n ^hl-x', { page: 3, pos: 4 })).toBe(
			'# Ch3 ^hl-e\nthoughts\n## My sub\nmore\n\nn ^hl-x\n\n# Appendix\n',
		);
	});

	it('後続の段落の上に書いた自分の文ごと、その手前に入れる', () => {
		const content = '# Ch1 ^hl-a\n\nintro\nc ^hl-c\n';
		expect(ordered(content, 'n ^hl-x', { page: 1, pos: 9 })).toBe(
			'# Ch1 ^hl-a\n\nn ^hl-x\n\nintro\nc ^hl-c\n',
		);
	});

	it('箇条書きの設定では詰めて差し込む', () => {
		expect(
			ordered('- a ^hl-a\n- c ^hl-c\n', '- n ^hl-x', { page: 1, pos: 9 }),
		).toBe('- a ^hl-a\n- n ^hl-x\n- c ^hl-c\n');
	});

	it('比べられるハイライトが無ければ末尾（別の PDF の行は数えない）', () => {
		expect(ordered('x ^hl-zz\n', 'n ^hl-x', { page: 1, pos: 0 })).toBe(
			'x ^hl-zz\n\nn ^hl-x\n',
		);
		expect(ordered('', 'n ^hl-x', { page: 1, pos: 0 })).toBe('n ^hl-x\n');
	});
});

describe('note-lines', () => {
	it('splitLines は CRLF を行末に含めない', () => {
		expect(splitLines('a\r\nb').map((l) => l.text)).toEqual(['a', 'b']);
	});

	it('fencedLines は囲みの行と中身を true にする', () => {
		expect(fencedLines(splitLines('a\n```\nb\n```\nc'))).toEqual([
			false,
			true,
			true,
			true,
			false,
		]);
	});

	it('findHighlightLines / offsetToLineCh', () => {
		expect(findHighlightLines('x\na ^hl-1\nb ^HL-1\n', 'hl-1')).toEqual([
			1, 2,
		]);
		expect(offsetToLineCh('ab\ncd', 4)).toEqual({ line: 1, ch: 1 });
	});
});
