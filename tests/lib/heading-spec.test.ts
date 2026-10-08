import { describe, expect, it } from 'vitest';
import {
	headingForm,
	headingName,
	headingSpecs,
	invalidHeadingLine,
	matchesHeading,
	parseHeadingSpec,
} from '../../src/lib/heading-spec';

describe('headingName / headingForm', () => {
	it('# と末尾の # の並び、ブロック ID を除き、空白を 1 つに', () => {
		expect(headingName('## Summary')).toBe('Summary');
		expect(headingName('## Summary ##')).toBe('Summary');
		expect(headingName('### C#')).toBe('C#');
		expect(headingName('## Summary ^abc')).toBe('Summary');
		expect(headingName('##  Two   words')).toBe('Two words');
		expect(headingName('#')).toBe('');
		expect(headingForm('##  Summary ##')).toBe('## Summary');
	});
});

describe('parseHeadingSpec / headingSpecs / invalidHeadingLine', () => {
	it('Markdown の見出しの形なら大きさも、# が無ければ名前だけ', () => {
		expect(parseHeadingSpec('## Summary')).toEqual({
			level: 2,
			name: 'Summary',
		});
		expect(parseHeadingSpec('  Summary  ')).toEqual({
			level: 0,
			name: 'Summary',
		});
		expect(parseHeadingSpec('C# notes')).toEqual({
			level: 0,
			name: 'C# notes',
		});
	});

	it('# の後に空白が無い・# が 7 つ以上・名前が無いものは読めない', () => {
		for (const bad of ['##Summary', '####### x', '##', '## ##', ''])
			expect(parseHeadingSpec(bad)).toBeNull();
	});

	it('1 行に 1 つ（空行は飛ばす）。誤りのある最初の行', () => {
		expect(headingSpecs('## Summary\n\n  ハイライト\r\n##bad')).toEqual([
			{ level: 2, name: 'Summary' },
			{ level: 0, name: 'ハイライト' },
		]);
		expect(invalidHeadingLine('## Summary\n\n  ##bad \n#x')).toBe('##bad');
		expect(invalidHeadingLine('## Summary\nハイライト\n')).toBeNull();
	});
});

describe('matchesHeading', () => {
	it('大文字・小文字と # の数まで同じものだけ（# が無ければ大きさは問わない）', () => {
		const level2 = parseHeadingSpec('## Summary');
		const any = parseHeadingSpec('Summary');
		if (!level2 || !any) throw new Error('spec');
		expect(matchesHeading(level2, '## Summary')).toBe(true);
		expect(matchesHeading(level2, '## Summary ##')).toBe(true);
		expect(matchesHeading(level2, '### Summary')).toBe(false);
		expect(matchesHeading(level2, '## summary')).toBe(false);
		expect(matchesHeading(any, '### Summary')).toBe(true);
		expect(matchesHeading(any, '# SUMMARY')).toBe(false);
		expect(matchesHeading(any, 'Summary')).toBe(false);
	});
});
