import { describe, expect, it } from 'vitest';
import {
	planInsertHighlight,
	type InsertTarget,
	type OrderKey,
} from '../../src/lib/note-insert';
import {
	applyEdits,
	fencedLines,
	findHighlightLines,
	offsetToLineCh,
	splitLines,
} from '../../src/lib/note-lines';

const END: InsertTarget = { headings: [], order: null };

function insert(
	content: string,
	line: string,
	target: InsertTarget = END,
): string {
	return applyEdits(content, [planInsertHighlight(content, line, target)]);
}

const under = (...headings: string[]): InsertTarget => ({
	headings,
	order: null,
});

describe('本文の最後に足す', () => {
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

describe('末尾の特別な部分（Excalidraw のデータ・%% コメント）の手前に足す', () => {
	const template = [
		'---',
		'pdf: "[[d.pdf]]"',
		'---',
		'Source:: x',
		'',
		'## Next Action',
		'- [ ] Text Summary',
		'',
		'## Summary',
		'',
		'',
		'# Excalidraw Data',
		'',
		'## Text Elements',
		'%%',
		'## Drawing',
		'```json',
		'{}',
		'```',
		'%%',
		'',
	].join('\n');

	it('Summary と Excalidraw Data の間に、足した順に続ける', () => {
		const once = insert(template, 'a ^hl-1');
		expect(once).toContain(
			'## Summary\n\na ^hl-1\n\n\n# Excalidraw Data\n',
		);
		expect(insert(once, 'b ^hl-2')).toContain(
			'## Summary\n\na ^hl-1\n\nb ^hl-2\n\n\n# Excalidraw Data\n',
		);
	});

	it('データの節が %% の中にあれば、その %% の手前', () => {
		expect(
			insert(
				'text\n\n%%\n# Excalidraw Data\n## Drawing\n%%\n',
				'a ^hl-1',
			),
		).toBe('text\n\na ^hl-1\n\n%%\n# Excalidraw Data\n## Drawing\n%%\n');
	});

	it('末尾の %% コメント（ほかのプラグインの設定など）の手前', () => {
		expect(
			insert('text\n\n%% kanban:settings\n```\n{}\n```\n%%\n', 'a ^hl-1'),
		).toBe('text\n\na ^hl-1\n\n%% kanban:settings\n```\n{}\n```\n%%\n');
		expect(insert('text\n%% x %%\n', 'a ^hl-1')).toBe(
			'text\n\na ^hl-1\n\n%% x %%\n',
		);
		// 閉じていないコメントは文書の最後まで続く
		expect(insert('text\n\n%%\nhidden\n', 'a ^hl-1')).toBe(
			'text\n\na ^hl-1\n\n%%\nhidden\n',
		);
	});

	it('途中のコメントやコードブロックの中の文字は数えない', () => {
		expect(insert('a\n%% c %%\nb\n', 'x ^hl-1')).toBe(
			'a\n%% c %%\nb\n\nx ^hl-1\n',
		);
		expect(insert('```\n# Excalidraw Data\n%%\n```\n', 'x ^hl-1')).toBe(
			'```\n# Excalidraw Data\n%%\n```\n\nx ^hl-1\n',
		);
	});

	it('前に何も無ければ先頭に入れ、データとの間を空ける', () => {
		expect(insert('# Excalidraw Data\n## Text Elements\n', 'a ^hl-1')).toBe(
			'a ^hl-1\n\n# Excalidraw Data\n## Text Elements\n',
		);
		expect(
			insert('---\npdf: x\n---\n%%\n# Excalidraw Data\n%%\n', 'a ^hl-1'),
		).toBe('---\npdf: x\n---\n\na ^hl-1\n\n%%\n# Excalidraw Data\n%%\n');
	});
});

describe('指定した見出しの下に足す', () => {
	it('見出しの節の最後（次の同じか上の階層の見出しとの間は空行）', () => {
		const content = '# Title\n\n## Summary\n\nmine\n## Notes\ntext\n';
		expect(insert(content, 'a ^hl-1', under('Summary'))).toBe(
			'# Title\n\n## Summary\n\nmine\n\na ^hl-1\n\n## Notes\ntext\n',
		);
		expect(
			insert('## Summary\n## Notes\n', 'a ^hl-1', under('Summary')),
		).toBe('## Summary\n\na ^hl-1\n\n## Notes\n');
	});

	it('大文字・小文字と # の数まで同じ見出しだけ（# が無ければ大きさは問わない）', () => {
		const content = '## Summary ##\n\n## Notes\n';
		for (const name of ['## Summary', 'Summary', '  Summary  '])
			expect(insert(content, 'a ^hl-1', under(name))).toBe(
				'## Summary ##\n\na ^hl-1\n\n## Notes\n',
			);
		for (const name of ['summary', '### Summary', 'SUMMARY'])
			expect(insert(content, 'a ^hl-1', under(name))).toBe(
				'## Summary ##\n\n## Notes\n\na ^hl-1\n',
			);
	});

	it('前の名前ほど優先し、無ければ次、どれも無ければ本文の最後', () => {
		const content = '## Summary\n\n## Notes\n\nx\n';
		expect(insert(content, 'a ^hl-1', under('Missing', 'Notes'))).toBe(
			'## Summary\n\n## Notes\n\nx\n\na ^hl-1\n',
		);
		expect(insert(content, 'a ^hl-1', under('Summary', 'Notes'))).toBe(
			'## Summary\n\na ^hl-1\n\n## Notes\n\nx\n',
		);
		expect(insert('text\n', 'a ^hl-1', under('Missing'))).toBe(
			'text\n\na ^hl-1\n',
		);
	});

	it('節は本文の最後まで（Excalidraw のデータには入れない）', () => {
		expect(
			insert(
				'# Summary\n\nx\n\n%%\ndata\n%%\n',
				'a ^hl-1',
				under('Summary'),
			),
		).toBe('# Summary\n\nx\n\na ^hl-1\n\n%%\ndata\n%%\n');
		expect(
			insert(
				'text\n\n# Excalidraw Data\n## Summary\n',
				'a ^hl-1',
				under('Summary'),
			),
		).toBe('text\n\na ^hl-1\n\n# Excalidraw Data\n## Summary\n');
	});

	it('コードやコメントの中の見出し、ハイライトの見出しは使わない', () => {
		expect(
			insert(
				'```\n## Summary\n```\n\n## Summary\n\n## Notes\n',
				'a ^hl-1',
				under('Summary'),
			),
		).toBe('```\n## Summary\n```\n\n## Summary\n\na ^hl-1\n\n## Notes\n');
		expect(insert('## Summary ^hl-a\n', 'b ^hl-2', under('Summary'))).toBe(
			'## Summary ^hl-a\n\nb ^hl-2\n',
		);
	});

	it('見出しのハイライトは節の見出しより深くし、節を切らない', () => {
		const content = '## Summary\n\n## Notes\n';
		const once = insert(content, '# Ch1 ^hl-a', under('Summary'));
		expect(once).toBe('## Summary\n\n### Ch1 ^hl-a\n\n## Notes\n');
		expect(insert(once, '### Deep ^hl-b', under('Summary'))).toBe(
			'## Summary\n\n### Ch1 ^hl-a\n\n##### Deep ^hl-b\n\n## Notes\n',
		);
		// 前の版で入れた浅い見出しのハイライトがあっても、節はそこで終わらない
		expect(
			insert(
				'## Summary\n\n## Ch1 ^hl-a\n\nt ^hl-b\n\n## Notes\n',
				'u ^hl-c',
				under('Summary'),
			),
		).toBe(
			'## Summary\n\n## Ch1 ^hl-a\n\nt ^hl-b\n\nu ^hl-c\n\n## Notes\n',
		);
		// 本文の最後に入れるときは、見出しの大きさはそのまま
		expect(insert('text\n', '# Ch1 ^hl-a')).toBe('text\n\n# Ch1 ^hl-a\n');
	});
});

describe('PDF の順に並べる', () => {
	const keys: Record<string, OrderKey> = {
		'hl-a': { page: 1, pos: 0 },
		'hl-b': { page: 1, pos: 5 },
		'hl-c': { page: 2, pos: 0 },
		'hl-e': { page: 3, pos: 0 },
	};
	const ordered = (
		content: string,
		line: string,
		key: OrderKey,
		headings: string[] = [],
	) =>
		insert(content, line, {
			headings,
			order: { key, keyOf: (id: string) => keys[id] ?? null },
		});
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

	it('frontmatter のすぐ下の段落の手前でも、frontmatter の中には入れない', () => {
		expect(
			ordered('---\npdf: x\n---\nc ^hl-c\n', 'n ^hl-x', {
				page: 1,
				pos: 0,
			}),
		).toBe('---\npdf: x\n---\n\nn ^hl-x\n\nc ^hl-c\n');
	});

	it('箇条書きの設定では詰めて差し込む', () => {
		expect(
			ordered('- a ^hl-a\n- c ^hl-c\n', '- n ^hl-x', { page: 1, pos: 9 }),
		).toBe('- a ^hl-a\n- n ^hl-x\n- c ^hl-c\n');
	});

	it('比べられるハイライトが無ければ最後（別の PDF の行は数えない）', () => {
		expect(ordered('x ^hl-zz\n', 'n ^hl-x', { page: 1, pos: 0 })).toBe(
			'x ^hl-zz\n\nn ^hl-x\n',
		);
		expect(ordered('', 'n ^hl-x', { page: 1, pos: 0 })).toBe('n ^hl-x\n');
	});

	it('入れる場所の外（Excalidraw のデータの中・ほかの節）のハイライトとは比べない', () => {
		expect(
			ordered('a ^hl-a\n\n# Excalidraw Data\n\nc ^hl-c\n', 'n ^hl-x', {
				page: 1,
				pos: 9,
			}),
		).toBe('a ^hl-a\n\nn ^hl-x\n\n# Excalidraw Data\n\nc ^hl-c\n');
		expect(
			ordered(
				'## Summary\n\na ^hl-a\n\n## Notes\n\nc ^hl-c\n',
				'n ^hl-x',
				{ page: 1, pos: 9 },
				['Summary'],
			),
		).toBe('## Summary\n\na ^hl-a\n\nn ^hl-x\n\n## Notes\n\nc ^hl-c\n');
		expect(
			ordered(
				'## Summary\n\n## Notes\n\nc ^hl-c\n',
				'n ^hl-x',
				{
					page: 1,
					pos: 9,
				},
				['Summary'],
			),
		).toBe('## Summary\n\nn ^hl-x\n\n## Notes\n\nc ^hl-c\n');
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
