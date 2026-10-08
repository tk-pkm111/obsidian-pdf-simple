import { describe, expect, it } from 'vitest';
import {
	pairedNotePaths,
	pairedPdfPath,
	uniqueNotePath,
} from '../../src/lib/pairing';

const resolve = (path: string) =>
	path.endsWith('.pdf') ? `PDF/${path}` : null;
const at = (link: string, offset: number) => ({
	link,
	position: { start: { offset } },
});

describe('pairedPdfPath', () => {
	it('プロパティを優先する（別名・リスト）', () => {
		expect(
			pairedPdfPath(
				{
					frontmatterLinks: [{ key: 'pdf', link: 'a.pdf' }],
					embeds: [at('b.pdf', 10)],
				},
				'pdf',
				resolve,
			),
		).toBe('PDF/a.pdf');
		expect(
			pairedPdfPath(
				{ frontmatterLinks: [{ key: 'pdf.0', link: 'a.pdf#page=2' }] },
				'pdf',
				resolve,
			),
		).toBe('PDF/a.pdf');
	});

	it('プロパティがあって解決できなければ本文は見ない', () => {
		expect(
			pairedPdfPath(
				{
					frontmatterLinks: [{ key: 'pdf', link: 'missing.md' }],
					embeds: [at('b.pdf', 10)],
				},
				'pdf',
				resolve,
			),
		).toBeNull();
	});

	it('プロパティが無ければ本文で最初の PDF へのリンク・埋め込み', () => {
		expect(
			pairedPdfPath(
				{
					frontmatterLinks: [
						{ key: 'pdf-highlights.0', link: 'z.pdf#page=1' },
					],
					links: [at('note', 5), at('c.pdf', 30)],
					embeds: [at('b.pdf', 20)],
				},
				'pdf',
				resolve,
			),
		).toBe('PDF/b.pdf');
		expect(
			pairedPdfPath({ links: [at('note', 5)] }, 'pdf', resolve),
		).toBeNull();
		expect(pairedPdfPath(null, 'pdf', resolve)).toBeNull();
	});
});

describe('pairedNotePaths', () => {
	it('PDF へリンクしていて、ペアの PDF がそれであるノートだけ', () => {
		const resolved = {
			'A.md': { 'PDF/a.pdf': 2 },
			'B.md': { 'PDF/a.pdf': 1, 'PDF/b.pdf': 1 },
			'C.md': { 'PDF/b.pdf': 1 },
			'canvas.canvas': { 'PDF/a.pdf': 1 },
		};
		const pdfOf = (note: string) =>
			note === 'B.md' ? 'PDF/b.pdf' : 'PDF/a.pdf';
		expect(pairedNotePaths(resolved, 'PDF/a.pdf', pdfOf)).toEqual(['A.md']);
		expect(pairedNotePaths(resolved, 'PDF/b.pdf', pdfOf)).toEqual(['B.md']);
	});
});

describe('uniqueNotePath', () => {
	it('同じ名前があれば番号を付ける', () => {
		const taken = new Set(['Notes/doc.md', 'Notes/doc 1.md']);
		expect(uniqueNotePath('Notes', 'doc', (p) => taken.has(p))).toBe(
			'Notes/doc 2.md',
		);
		expect(uniqueNotePath('/', 'doc', () => false)).toBe('doc.md');
		expect(uniqueNotePath('', 'doc', () => false)).toBe('doc.md');
	});
});
