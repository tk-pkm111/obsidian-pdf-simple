import { describe, expect, it } from 'vitest';
import {
	folderChain,
	isInFolder,
	normalizeFolder,
	uniqueFilePath,
} from '../../src/lib/file-paths';

describe('normalizeFolder / isInFolder / folderChain', () => {
	it('前後の / と空白を除き、\\ は / に、続く / は 1 つに。空や / は未設定', () => {
		expect(normalizeFolder(' /Library//PDF/ ')).toBe('Library/PDF');
		expect(normalizeFolder('Library\\PDF')).toBe('Library/PDF');
		expect(normalizeFolder('/')).toBe('');
		expect(normalizeFolder('  ')).toBe('');
	});

	it('フォルダの中（下のフォルダも）か。名前が前方一致するだけのフォルダは外', () => {
		expect(isInFolder('Library/PDF/a.pdf', 'Library/PDF')).toBe(true);
		expect(isInFolder('Library/PDF/2026/a.pdf', 'Library/PDF')).toBe(true);
		expect(isInFolder('Library/PDFs/a.pdf', 'Library/PDF')).toBe(false);
		expect(isInFolder('a.pdf', 'Library/PDF')).toBe(false);
		expect(isInFolder('a.pdf', '')).toBe(false);
	});

	it('作るフォルダを上から順に', () => {
		expect(folderChain('a/b/c')).toEqual(['a', 'a/b', 'a/b/c']);
		expect(folderChain('a')).toEqual(['a']);
		expect(folderChain('')).toEqual([]);
	});
});

describe('uniqueFilePath', () => {
	it('同じ名前があれば番号を付ける', () => {
		const taken = new Set(['PDF/doc.pdf', 'PDF/doc 1.pdf']);
		expect(uniqueFilePath('PDF', 'doc', 'pdf', (p) => taken.has(p))).toBe(
			'PDF/doc 2.pdf',
		);
		expect(uniqueFilePath('', 'doc', 'pdf', () => false)).toBe('doc.pdf');
	});
});
