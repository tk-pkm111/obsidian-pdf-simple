import { describe, expect, it } from 'vitest';
import { applyEdits } from '../../src/lib/note-lines';
import {
	planRemoveHighlight,
	planSetHeadingLevel,
	type RemoveMode,
} from '../../src/lib/note-remove';

function remove(
	content: string,
	mode: RemoveMode,
	id = 'hl-1',
): { text: string; kept: boolean } {
	const plan = planRemoveHighlight(content, id, mode);
	return { text: applyEdits(content, plan.edits), kept: plan.kept };
}

const LINE: RemoveMode = { type: 'line' };
const UNLINK: RemoveMode = { type: 'unlink' };
const match = (expected: string | null): RemoveMode => ({
	type: 'match',
	expected,
});

describe('planRemoveHighlight', () => {
	it('行ごと消す（空行に挟まれた段落は前の空行ごと）', () => {
		expect(remove('a ^hl-2\n\nb ^hl-1\n\nc ^hl-3\n', LINE).text).toBe(
			'a ^hl-2\n\nc ^hl-3\n',
		);
		expect(remove('b ^hl-1\n\nc\n', LINE).text).toBe('c\n');
		expect(remove('- x ^hl-2\n- b ^hl-1\n- y\n', LINE).text).toBe(
			'- x ^hl-2\n- y\n',
		);
		expect(remove('note: b ^hl-1\n', LINE).text).toBe('');
	});

	it('つながりだけ外す（見出しの # と箇条書きの記号は残す）', () => {
		expect(remove('see b ^hl-1\n', UNLINK)).toEqual({
			text: 'see b\n',
			kept: true,
		});
		expect(remove('## T ^hl-1\n', UNLINK).text).toBe('## T\n');
		expect(remove('- ==b== ^hl-1\n', UNLINK).text).toBe('- b\n');
	});

	it('PDF から消すとき: 文が PDF と同じなら行ごと、書き換えられていれば ID だけ外す', () => {
		expect(
			remove('x\n\n3\\. Third item ^hl-1\n', match('3. Third\nitem')),
		).toEqual({
			text: 'x\n',
			kept: false,
		});
		expect(
			remove('## Sample document ^hl-1\n', match('Sample document')).text,
		).toBe('');
		expect(
			remove('Third item and my note ^hl-1\n', match('Third item')),
		).toEqual({
			text: 'Third item and my note\n',
			kept: true,
		});
		expect(remove('Third item ^hl-1\n', match(null)).kept).toBe(true);
	});

	it('画像の行は PDF から消すと行ごと消える', () => {
		expect(remove('![[a.png|300]] ^hl-1\n', match(null)).text).toBe('');
	});

	it('第 1 弾の行: == の外に文が無ければ行ごと、あれば == と ID だけ外す', () => {
		expect(remove('- ==a = = b== ^hl-1\n', match('a == b')).text).toBe('');
		expect(remove('My note: ==x== ^hl-1\n', match('x'))).toEqual({
			text: 'My note: x\n',
			kept: true,
		});
	});

	it('複数行の段落のハイライト: 文ごと消す・PDF と同じ行だけ消す・違えば残す', () => {
		const block = '・一つ目\n・二つ目\n・三つ目 ^hl-1';
		expect(remove(`x\n\n${block}\n\ny\n`, LINE).text).toBe('x\n\ny\n');
		// 上に自分で書いた行が続いていても、PDF の文字と同じ行だけを消す
		expect(
			remove(`memo\n${block}\n`, match('・一つ目\n・二つ目\n・三つ目')),
		).toEqual({ text: 'memo\n', kept: false });
		expect(
			remove(`${block}\n`, match('・一つ目\n・二つ目\n・違う')),
		).toEqual({ text: '・一つ目\n・二つ目\n・三つ目\n', kept: true });
		// 箇条書きの項目の続きの行（字下げ）も 1 つの項目として消す
		expect(remove('- a\n  b ^hl-1\n- c\n', LINE).text).toBe('- c\n');
	});

	it('別の ID・同じ ID の複数行', () => {
		expect(remove('a ^hl-10\n', LINE).text).toBe('a ^hl-10\n');
		expect(remove('a ^hl-1\n\nb ^HL-1\n', LINE).text).toBe('');
	});
});

describe('planSetHeadingLevel', () => {
	const set = (content: string, level: number) =>
		applyEdits(content, planSetHeadingLevel(content, 'hl-1', level));

	it('見出しにする・大きさを変える（箇条書きの記号は外す）', () => {
		expect(set('Title ^hl-1\n', 2)).toBe('## Title ^hl-1\n');
		expect(set('## Title ^hl-1\n', 3)).toBe('### Title ^hl-1\n');
		expect(set('- Title ^hl-1\n', 1)).toBe('# Title ^hl-1\n');
	});

	it('本文に戻すときは、前後の文とつながらないよう空行を入れる', () => {
		expect(set('intro\n## Title ^hl-1\nbody\n', 0)).toBe(
			'intro\n\nTitle ^hl-1\n\nbody\n',
		);
		expect(set('## Title ^hl-1\n', 0)).toBe('Title ^hl-1\n');
		expect(set('---\npdf: x\n---\n## Title ^hl-1\n', 0)).toBe(
			'---\npdf: x\n---\nTitle ^hl-1\n',
		);
	});

	it('複数行の段落を見出しにすると 1 行にまとめる', () => {
		expect(set('x\n\nこれは\n続きです ^hl-1\n', 2)).toBe(
			'x\n\n## これは続きです ^hl-1\n',
		);
		expect(set('- one\n  two ^hl-1\n', 1)).toBe('# one two ^hl-1\n');
	});

	it('変わらなければ編集しない', () => {
		expect(planSetHeadingLevel('## T ^hl-1\n', 'hl-1', 2)).toEqual([]);
	});
});
