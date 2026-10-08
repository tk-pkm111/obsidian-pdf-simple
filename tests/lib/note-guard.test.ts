import { describe, expect, it } from 'vitest';
import {
	planMoveIdToLineEnd,
	planSeparateHighlights,
} from '../../src/lib/note-guard';
import { applyEdits } from '../../src/lib/note-lines';

const known = (id: string) => id.startsWith('hl-');

describe('planSeparateHighlights', () => {
	const separate = (content: string, lines?: Set<number>) =>
		applyEdits(content, planSeparateHighlights(content, known, lines));

	it('ハイライトのすぐ下に続く文との間に空行を入れる', () => {
		expect(separate('a ^hl-1\nmy note\n')).toBe('a ^hl-1\n\nmy note\n');
		expect(separate('- a ^hl-1\nlazy\n')).toBe('- a ^hl-1\n\nlazy\n');
		expect(separate('a ^hl-1\n![[x.png]] ^hl-2\n')).toBe(
			'a ^hl-1\n\n![[x.png]] ^hl-2\n',
		);
	});

	it('空行・箇条書き・見出し・引用・コード・区切り線が続くときは何もしない', () => {
		for (const content of [
			'a ^hl-1\n\nnote\n',
			'- a ^hl-1\n- b\n',
			'a ^hl-1\n## Next\n',
			'a ^hl-1\n> quote\n',
			'a ^hl-1\n```\n',
			'a ^hl-1\n---\n',
			'a ^hl-1',
		])
			expect(separate(content)).toBe(content);
	});

	it('見出しのハイライト・知らない ID・コードブロックの中は対象外', () => {
		expect(separate('## T ^hl-1\nnote\n')).toBe('## T ^hl-1\nnote\n');
		expect(separate('a ^other\nnote\n')).toBe('a ^other\nnote\n');
		expect(separate('```\na ^hl-1\nnote\n```\n')).toBe(
			'```\na ^hl-1\nnote\n```\n',
		);
	});

	it('lines を渡すと、その近くだけ直す', () => {
		const content = 'a ^hl-1\nx\n\nb ^hl-2\ny\n';
		expect(separate(content, new Set([4]))).toBe(
			'a ^hl-1\nx\n\nb ^hl-2\n\ny\n',
		);
	});
});

describe('planMoveIdToLineEnd', () => {
	const move = (content: string, lines?: Set<number>) =>
		applyEdits(content, planMoveIdToLineEnd(content, known, lines));

	it('ID の後ろに書き足した文を、ID の前へ移す', () => {
		expect(move('text ^hl-1 more\n')).toBe('text more ^hl-1\n');
		expect(move('## T ^hl-1 sub\n')).toBe('## T sub ^hl-1\n');
		expect(move('- a ^HL-1 b c\n')).toBe('- a b c ^HL-1\n');
	});

	it('行末の ID・後ろが空白だけ・知らない ID・コードブロックの中はそのまま', () => {
		for (const content of [
			'text ^hl-1\n',
			'text ^hl-1 \n',
			'text ^note more\n',
			'```\ntext ^hl-1 more\n```\n',
		])
			expect(move(content)).toBe(content);
	});

	it('lines を渡すと、その行だけ', () => {
		const content = 'a ^hl-1 x\n\nb ^hl-2 y\n';
		expect(move(content, new Set([2]))).toBe('a ^hl-1 x\n\nb y ^hl-2\n');
	});
});
