import { describe, expect, it } from 'vitest';
import {
	buildBodyLine,
	buildEntryString,
	entryFromFrontmatterLink,
	entryIdOf,
	entryLabel,
	findBlockId,
	generateId,
	matchesLabel,
	recolorEntryString,
	relinkEntryString,
	toEntryList,
} from '../../src/lib/highlight-entry';

const selection = { begin: { idx: 2, offset: 0 }, end: { idx: 3, offset: 4 } };
const textAnchor = { type: 'text' as const, selection };
const region = { left: 0.1, top: 0.2, right: 0.5, bottom: 0.6 };

describe('generateId', () => {
	it('hl- + 英小文字・数字 6 文字', () => {
		expect(generateId(() => false)).toMatch(/^hl-[a-z0-9]{6}$/);
	});

	it('使われている ID は避ける', () => {
		let call = 0;
		const bytes = (length: number) => new Uint8Array(length).fill(call++);
		const id = generateId((candidate) => candidate === 'hl-aaaaaa', bytes);
		expect(id).toBe('hl-bbbbbb');
	});

	it('何度やっても空かなければ例外', () => {
		expect(() => generateId(() => true)).toThrow();
	});
});

describe('buildBodyLine / findBlockId', () => {
	it('文（箇条書きの有無）・見出し・画像', () => {
		expect(
			buildBodyLine({
				kind: 'text',
				text: 'A short list',
				id: 'hl-k9f2ab',
				bullet: false,
			}),
		).toBe('A short list ^hl-k9f2ab');
		// 段落の中の改行はそのまま。箇条書きなら 2 行目から字下げ
		expect(
			buildBodyLine({
				kind: 'text',
				text: '・a\n・b',
				id: 'hl-1',
				bullet: false,
			}),
		).toBe('・a\n・b ^hl-1');
		expect(
			buildBodyLine({
				kind: 'text',
				text: 'a\nb',
				id: 'hl-1',
				bullet: true,
			}),
		).toBe('- a\n  b ^hl-1');
		expect(
			buildBodyLine({
				kind: 'text',
				text: 'x',
				id: 'hl-1',
				bullet: true,
			}),
		).toBe('- x ^hl-1');
		expect(
			buildBodyLine({
				kind: 'heading',
				text: 'Title',
				id: 'hl-1',
				level: 2,
			}),
		).toBe('## Title ^hl-1');
		expect(
			buildBodyLine({ kind: 'heading', text: 'T', id: 'hl-1', level: 9 }),
		).toBe('###### T ^hl-1');
		expect(
			buildBodyLine({
				kind: 'image',
				embed: '![[a.png|300]]',
				id: 'hl-1',
				bullet: false,
			}),
		).toBe('![[a.png|300]] ^hl-1');
	});

	it('行末のブロック ID を見つける（直前の空白から）', () => {
		const line = '- ==A short list==  ^hl-k9f2ab ';
		expect(findBlockId(line)).toEqual({
			id: 'hl-k9f2ab',
			from: 18,
			to: line.length,
		});
		expect(findBlockId('My note: ==x== ^HL-ABC')?.id).toBe('hl-abc');
	});

	it('行末でない・空白が無い・別の ID は対象外', () => {
		expect(findBlockId('==x== ^hl-1 more text')).toBeNull();
		expect(findBlockId('==x==^hl-1')).toBeNull();
		expect(findBlockId('==x== ^other-id')).toBeNull();
	});
});

describe('entryLabel', () => {
	it('p.N と先頭 20 文字（リンクを壊す文字は置き換える）', () => {
		expect(entryLabel(3, 'A short list')).toBe('p.3 A short list');
		expect(entryLabel(1, 'abcdefghijklmnopqrstuvwxyz')).toBe(
			'p.1 abcdefghijklmnopqrst…',
		);
		expect(entryLabel(2, 'see [ref] | x')).toBe('p.2 see (ref) / x');
		expect(entryLabel(4, '')).toBe('p.4');
	});
});

describe('buildEntryString とその読み書き', () => {
	const entry = buildEntryString({
		linktext: 'sample-3-pages.pdf',
		page: 2,
		anchor: textAnchor,
		color: 'yellow',
		id: 'hl-k9f2ab',
		label: 'p.2 A short list',
	});

	it('wikilink 1 つの文字列', () => {
		expect(entry).toBe(
			'[[sample-3-pages.pdf#page=2&selection=2,0,3,4&color=yellow&id=hl-k9f2ab|p.2 A short list]]',
		);
		expect(entryIdOf(entry)).toBe('hl-k9f2ab');
		expect(entryIdOf('[[doc.pdf#page=2]]')).toBeNull();
		expect(entryIdOf('not a link')).toBeNull();
	});

	it('色だけを書き換える', () => {
		expect(recolorEntryString(entry, 'red')).toBe(
			'[[sample-3-pages.pdf#page=2&selection=2,0,3,4&color=red&id=hl-k9f2ab|p.2 A short list]]',
		);
		expect(recolorEntryString('[[doc.pdf#page=1]]', 'red')).toBeNull();
	});

	it('範囲（画像）は region= で書く', () => {
		expect(
			buildEntryString({
				linktext: 'doc.pdf',
				page: 3,
				anchor: { type: 'region', region },
				color: 'blue',
				id: 'hl-abc123',
				label: 'p.3 画像',
			}),
		).toBe(
			'[[doc.pdf#page=3&region=0.1,0.2,0.5,0.6&color=blue&id=hl-abc123|p.3 画像]]',
		);
	});

	it('パスだけを差し替える', () => {
		expect(relinkEntryString(entry, 'PDF/sample-3-pages.pdf')).toBe(
			'[[PDF/sample-3-pages.pdf#page=2&selection=2,0,3,4&color=yellow&id=hl-k9f2ab|p.2 A short list]]',
		);
	});
});

describe('entryFromFrontmatterLink', () => {
	const resolve = (path: string) =>
		path === 'doc.pdf' ? 'PDF/doc.pdf' : null;
	const link = (key: string, raw: string) => ({
		key,
		link: raw,
		displayText: 'p.2 x',
	});

	it('pdf-highlights の要素を読む', () => {
		expect(
			entryFromFrontmatterLink(
				'Note.md',
				link(
					'pdf-highlights.0',
					'doc.pdf#page=2&selection=2,0,3,4&color=red&id=hl-1',
				),
				'pdf-highlights',
				resolve,
			),
		).toEqual({
			id: 'hl-1',
			notePath: 'Note.md',
			pdfPath: 'PDF/doc.pdf',
			page: 2,
			anchor: textAnchor,
			color: 'red',
			label: 'p.2 x',
		});
	});

	it('region の要素も読む（selection もあれば selection を使う）', () => {
		const read = (raw: string) =>
			entryFromFrontmatterLink(
				'Note.md',
				link('pdf-highlights.1', raw),
				'pdf-highlights',
				resolve,
			)?.anchor;
		expect(read('doc.pdf#page=2&region=0.1,0.2,0.5,0.6&id=hl-2')).toEqual({
			type: 'region',
			region,
		});
		expect(
			read(
				'doc.pdf#page=2&region=0.1,0.2,0.5,0.6&selection=2,0,3,4&id=hl-2',
			),
		).toEqual(textAnchor);
		expect(
			read('doc.pdf#page=2&region=0.5,0.2,0.5,0.6&id=hl-2'),
		).toBeUndefined();
	});

	it('別のプロパティ・ID や範囲の無いもの・解決できないものは読まない', () => {
		const ok = 'doc.pdf#page=2&selection=2,0,3,4&id=hl-1';
		expect(
			entryFromFrontmatterLink(
				'N.md',
				link('pdf', ok),
				'pdf-highlights',
				resolve,
			),
		).toBeNull();
		expect(
			entryFromFrontmatterLink(
				'N.md',
				link('pdf-highlights-old.0', ok),
				'pdf-highlights',
				resolve,
			),
		).toBeNull();
		expect(
			entryFromFrontmatterLink(
				'N.md',
				link('pdf-highlights.0', 'doc.pdf#page=2&selection=2,0,3,4'),
				'pdf-highlights',
				resolve,
			),
		).toBeNull();
		expect(
			entryFromFrontmatterLink(
				'N.md',
				link(
					'pdf-highlights.0',
					'other.pdf#page=2&selection=2,0,3,4&id=hl-1',
				),
				'pdf-highlights',
				resolve,
			),
		).toBeNull();
	});

	it('color が無ければ null（既定の色で描く）', () => {
		expect(
			entryFromFrontmatterLink(
				'N.md',
				link(
					'pdf-highlights',
					'doc.pdf#page=1&selection=0,0,0,3&id=hl-2',
				),
				'pdf-highlights',
				resolve,
			)?.color,
		).toBeNull();
	});
});

describe('toEntryList', () => {
	it('文字列 1 つ・リスト・無しを文字列のリストにする', () => {
		expect(toEntryList(['a', 1, 'b', null])).toEqual(['a', 'b']);
		expect(toEntryList('a')).toEqual(['a']);
		expect(toEntryList('')).toEqual([]);
		expect(toEntryList(undefined)).toEqual([]);
	});
});

describe('matchesLabel', () => {
	it('表示名の先頭と PDF の今の文字が合うか（空白・リンク用の置き換えは無視）', () => {
		expect(matchesLabel('p.2 A short list', 'A short\nlist')).toBe(true);
		expect(
			matchesLabel(
				'p.1 abcdefghijklmnopqrst…',
				'abcdefghijklmnopqrstuvwxyz',
			),
		).toBe(true);
		expect(matchesLabel('p.2 see (ref) / x', 'see [ref] | x')).toBe(true);
		expect(matchesLabel('p.2 A short list', 'Something else')).toBe(false);
		expect(matchesLabel('p.4', 'anything')).toBe(true);
	});
});
