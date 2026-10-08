import { describe, expect, it } from 'vitest';
import { bodyStartLine, splitLines } from '../../src/lib/note-lines';
import {
	contentEndLine,
	headingKey,
	headingName,
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

describe('headingName / headingKey', () => {
	it('# と末尾の # の並び、ブロック ID を除く', () => {
		expect(headingName('## Summary')).toBe('Summary');
		expect(headingName('## Summary ##')).toBe('Summary');
		expect(headingName('### C#')).toBe('C#');
		expect(headingName('## Summary ^abc')).toBe('Summary');
		expect(headingName('#')).toBe('');
	});

	it('比べる形', () => {
		expect(headingKey('## Summary ')).toBe('summary');
		expect(headingKey('Two  words')).toBe('two words');
		expect(headingKey('  ')).toBe('');
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
		expect(targetHeadingAt(content, 3)).toBe('Summary');
		for (const line of [0, 1, 4, 5, 7, 9, 10, 99])
			expect(targetHeadingAt(content, line)).toBeNull();
	});
});
