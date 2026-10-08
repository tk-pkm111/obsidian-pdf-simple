import { describe, expect, it } from 'vitest';
import {
	formatWikilink,
	isLinkSafePath,
	parseWikilink,
	splitLinktext,
} from '../../src/lib/linktext';

describe('splitLinktext', () => {
	it('最初の # で分け、サブパスは # を含む', () => {
		expect(splitLinktext('doc.pdf#page=3&selection=1,0,2,5')).toEqual({
			path: 'doc.pdf',
			subpath: '#page=3&selection=1,0,2,5',
		});
		expect(splitLinktext('Note#Heading#Sub')).toEqual({
			path: 'Note',
			subpath: '#Heading#Sub',
		});
		expect(splitLinktext('doc.pdf')).toEqual({
			path: 'doc.pdf',
			subpath: '',
		});
	});
});

describe('parseWikilink / formatWikilink', () => {
	it('別名・埋め込みを読み、同じ形に書き戻す', () => {
		const text = '[[PDF/doc.pdf#page=2&id=hl-abc123|p.2 A short list]]';
		const link = parseWikilink(text);
		expect(link).toEqual({
			embed: false,
			linktext: 'PDF/doc.pdf#page=2&id=hl-abc123',
			alias: 'p.2 A short list',
		});
		expect(link && formatWikilink(link)).toBe(text);
		expect(parseWikilink('![[doc.pdf]]')).toEqual({
			embed: true,
			linktext: 'doc.pdf',
			alias: null,
		});
	});

	it('wikilink でなければ null', () => {
		expect(parseWikilink('doc.pdf')).toBeNull();
		expect(parseWikilink('[[a]] and [[b]]')).toBeNull();
		expect(parseWikilink('[doc](doc.pdf)')).toBeNull();
	});
});

describe('isLinkSafePath', () => {
	it('# ^ [ ] | を含むパスはリンクにできない', () => {
		expect(isLinkSafePath('PDF/論文 2024.pdf')).toBe(true);
		for (const bad of ['a#b.pdf', 'a^b.pdf', 'a[b].pdf', 'a|b.pdf'])
			expect(isLinkSafePath(bad)).toBe(false);
	});
});
