import { describe, expect, it } from 'vitest';
import { bodyStartLine, splitLines } from '../../src/lib/note-lines';
import { parseHeadingSpec } from '../../src/lib/heading-spec';
import {
	contentEndLine,
	findHeadings,
	resolveInsertHeading,
	scanLines,
	targetHeadingAt,
} from '../../src/lib/note-regions';

function contentEnd(content: string): number {
	const lines = splitLines(content);
	return contentEndLine(lines, scanLines(lines), bodyStartLine(lines));
}

describe('scanLines', () => {
	it('コードブロックと %% コメントを見分ける（コメントの中の ``` は数えない）', () => {
		const scan = scanLines(
			splitLines('a\n```\n%%\n```\n%%\n```\nb %% c\nd'),
		);
		const f = false;
		const T = true;
		expect(scan.fenced).toEqual([f, T, T, T, f, f, f, f]);
		expect(scan.commented).toEqual([f, f, f, f, f, T, T, f]);
		expect(scan.empty).toEqual([f, f, f, f, T, T, f, f]);
	});
});

describe('contentEndLine', () => {
	it('Excalidraw Data の見出し（%% の中ならその %%）、末尾の %% コメント', () => {
		expect(contentEnd('a\n\n# Excalidraw Data\n## Text Elements\n')).toBe(
			2,
		);
		expect(contentEnd('a\n%%\n# Excalidraw Data\n%%\n')).toBe(1);
		expect(contentEnd('a\n\n%% x %%\n\n%%\ny\n%%\n\n')).toBe(2);
		expect(contentEnd('a\nb %%\nhidden\n')).toBe(1);
		expect(contentEnd('a\n%% x %%\nb\n')).toBe(4);
		expect(contentEnd('---\nk: v\n---\n%%\n')).toBe(3);
	});
});

describe('targetHeadingAt', () => {
	const content = [
		'---',
		'# not a heading',
		'---',
		'## Summary',
		'text ^hl-a',
		'## Ch1 ^hl-b',
		'```',
		'## Code',
		'```',
		'# Excalidraw Data',
		'## Text Elements',
	].join('\n');

	it('本文の見出しだけ（ハイライトの見出し・コード・本文の最後より後ろは除く）', () => {
		expect(targetHeadingAt(content, 3)).toBe('## Summary');
		for (const line of [0, 1, 4, 5, 7, 9, 10, 99])
			expect(targetHeadingAt(content, line)).toBeNull();
	});
});

describe('findHeadings / resolveInsertHeading', () => {
	const note = [
		'---',
		'pdf: x',
		'---',
		'## Summary',
		'',
		'## ハイライト ##',
		'',
		'### summary',
		'',
		'# Excalidraw Data',
		'## Notes',
	].join('\n');
	const specs = (...values: string[]) =>
		values.map((value) => {
			const spec = parseHeadingSpec(value);
			if (!spec) throw new Error(value);
			return spec;
		});

	it('指定に合う見出しの形を、ノートの上から順に（本文の最後より後ろは除く）', () => {
		expect(
			findHeadings(note, specs('## ハイライト', 'Summary', 'Notes')),
		).toEqual(['## Summary', '## ハイライト']);
		// 大文字・小文字と # の数まで同じものだけ
		expect(findHeadings(note, specs('summary'))).toEqual(['### summary']);
		expect(findHeadings(note, specs('### Summary'))).toEqual([]);
	});

	it('設定の見出しが 1 つならそれ、無ければ null、2 つ以上なら選ばせる', () => {
		expect(resolveInsertHeading(note, null, '## Summary')).toEqual({
			heading: '## Summary',
		});
		expect(resolveInsertHeading(note, null, 'Missing\n')).toEqual({
			heading: null,
		});
		expect(
			resolveInsertHeading(note, null, '## Summary\n## ハイライト'),
		).toEqual({ choices: ['## Summary', '## ハイライト'] });
	});

	it('ノートで決めた見出しがあれば聞かない（ノートに無ければ設定どおり）', () => {
		const both = '## Summary\n## ハイライト';
		expect(resolveInsertHeading(note, '## ハイライト', both)).toEqual({
			heading: '## ハイライト',
		});
		expect(resolveInsertHeading(note, '## Gone', both)).toEqual({
			choices: ['## Summary', '## ハイライト'],
		});
	});
});
