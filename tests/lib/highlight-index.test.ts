import { describe, expect, it } from 'vitest';
import { extractNoteHighlights } from '../../src/lib/extract';
import { HighlightIndex } from '../../src/lib/highlight-index';
import type { BlockRef, HighlightEntry } from '../../src/lib/types';

function entry(
	id: string,
	notePath: string,
	page = 1,
	b = 0,
	color: string | null = 'yellow',
): HighlightEntry {
	return {
		id,
		notePath,
		pdfPath: 'PDF/doc.pdf',
		page,
		anchor: {
			type: 'text',
			selection: {
				begin: { idx: b, offset: 0 },
				end: { idx: b, offset: 4 },
			},
		},
		color,
		label: `p.${page} ${id}`,
	};
}

function block(id: string, notePath: string, line = 0, level = 0): BlockRef {
	return { id, notePath, line, level };
}

describe('extractNoteHighlights', () => {
	it('プロパティのエントリと hl- のブロック ID だけを読む', () => {
		const data = extractNoteHighlights(
			'Note.md',
			{
				frontmatterLinks: [
					{ key: 'pdf', link: 'doc.pdf' },
					{
						key: 'pdf-highlights.0',
						link: 'doc.pdf#page=2&selection=2,0,3,4&color=red&id=hl-1',
						displayText: 'p.2 x',
					},
				],
				blocks: {
					'hl-1': { id: 'hl-1', position: { start: { line: 7 } } },
					'hl-2': { id: 'hl-2', position: { start: { line: 3 } } },
					'my-block': {
						id: 'my-block',
						position: { start: { line: 9 } },
					},
				},
				headings: [{ level: 2, position: { start: { line: 3 } } }],
			},
			'pdf-highlights',
			(path) => (path === 'doc.pdf' ? 'PDF/doc.pdf' : null),
		);
		expect(
			data.entries.map((e) => [e.id, e.pdfPath, e.page, e.color]),
		).toEqual([['hl-1', 'PDF/doc.pdf', 2, 'red']]);
		expect(data.blocks).toEqual([
			{ id: 'hl-1', notePath: 'Note.md', line: 7, level: 0 },
			{ id: 'hl-2', notePath: 'Note.md', line: 3, level: 2 },
		]);
	});

	it('キャッシュが無ければ空', () => {
		expect(extractNoteHighlights('N.md', null, 'p', () => null)).toEqual({
			entries: [],
			blocks: [],
		});
	});
});

describe('HighlightIndex', () => {
	it('エントリと本文の ID がそろったものだけを描く', () => {
		const index = new HighlightIndex();
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md', 1, 0), entry('hl-2', 'A.md', 1, 5)],
			blocks: [block('hl-1', 'A.md', 3)],
		});
		const highlights = index.forPdf('PDF/doc.pdf');
		expect(highlights.map((h) => h.ids)).toEqual([['hl-1']]);
		expect(highlights[0]?.blocks).toEqual([block('hl-1', 'A.md', 3)]);
		expect(index.orphanEntries().map((e) => e.id)).toEqual(['hl-2']);
	});

	it('本文を別のノートへ移しても描き続け、本文が消えたら描かない', () => {
		const index = new HighlightIndex();
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md')],
			blocks: [block('hl-1', 'A.md')],
		});
		// 切り取り
		expect(
			index.setNote('A.md', {
				entries: [entry('hl-1', 'A.md')],
				blocks: [],
			}),
		).toEqual(new Set(['PDF/doc.pdf']));
		expect(index.forPdf('PDF/doc.pdf')).toEqual([]);
		// 別のノートに貼り付け
		expect(
			index.setNote('B.md', {
				entries: [],
				blocks: [block('hl-1', 'B.md', 5)],
			}),
		).toEqual(new Set(['PDF/doc.pdf']));
		expect(index.forPdf('PDF/doc.pdf')[0]?.blocks).toEqual([
			block('hl-1', 'B.md', 5),
		]);
		expect(index.orphanEntries()).toEqual([]);
	});

	it('同じ位置のエントリは 1 つにまとめ、行き先を並べる', () => {
		const index = new HighlightIndex();
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md')],
			blocks: [block('hl-1', 'A.md')],
		});
		index.setNote('B.md', {
			entries: [entry('hl-2', 'B.md')],
			blocks: [block('hl-2', 'B.md')],
		});
		const [highlight, ...rest] = index.forPdf('PDF/doc.pdf');
		expect(rest).toEqual([]);
		expect(highlight?.ids).toEqual(['hl-1', 'hl-2']);
		expect(highlight?.blocks.map((b) => b.notePath)).toEqual([
			'A.md',
			'B.md',
		]);
	});

	it('ノートの削除・改名', () => {
		const index = new HighlightIndex();
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md')],
			blocks: [block('hl-1', 'A.md')],
		});
		expect(index.renameNote('A.md', 'Folder/A.md')).toEqual(
			new Set(['PDF/doc.pdf']),
		);
		expect(index.entry('hl-1')?.notePath).toBe('Folder/A.md');
		expect(index.blocksFor('hl-1')).toEqual([block('hl-1', 'Folder/A.md')]);
		expect(index.renameNote('missing.md', 'x.md')).toEqual(new Set());
		index.removeNote('Folder/A.md');
		expect(index.forPdf('PDF/doc.pdf')).toEqual([]);
		expect(index.hasId('hl-1')).toBe(false);
	});

	it('作った直後のものはキャッシュに反映されるまで描き、反映されたら外す', () => {
		const index = new HighlightIndex();
		index.addPending({
			entry: entry('hl-9', 'A.md'),
			block: block('hl-9', 'A.md'),
			createdAt: 0,
		});
		expect(index.hasId('hl-9')).toBe(true);
		expect(index.forPdf('PDF/doc.pdf').map((h) => h.ids)).toEqual([
			['hl-9'],
		]);
		expect(index.settlePending(1000, 15000)).toEqual(new Set());
		index.setNote('A.md', {
			entries: [entry('hl-9', 'A.md')],
			blocks: [block('hl-9', 'A.md', 4)],
		});
		expect(index.settlePending(1000, 15000)).toEqual(
			new Set(['PDF/doc.pdf']),
		);
		expect(index.forPdf('PDF/doc.pdf')[0]?.blocks).toEqual([
			block('hl-9', 'A.md', 4),
		]);
	});

	it('古くなった作成直後のものは捨てる', () => {
		const index = new HighlightIndex();
		index.addPending({
			entry: entry('hl-9', 'A.md'),
			block: block('hl-9', 'A.md'),
			createdAt: 0,
		});
		expect(index.settlePending(20000, 15000)).toEqual(
			new Set(['PDF/doc.pdf']),
		);
		expect(index.forPdf('PDF/doc.pdf')).toEqual([]);
	});

	it('範囲（画像）は位置ごとに別のハイライトにし、見出しの大きさを持つ', () => {
		const index = new HighlightIndex();
		const regionEntry: HighlightEntry = {
			...entry('hl-3', 'A.md', 2),
			anchor: {
				type: 'region',
				region: { left: 0.1, top: 0.2, right: 0.5, bottom: 0.6 },
			},
		};
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md', 2), regionEntry],
			blocks: [block('hl-1', 'A.md', 4, 2), block('hl-3', 'A.md', 6)],
		});
		expect(
			index.forPdf('PDF/doc.pdf').map((h) => [h.key, h.level]),
		).toEqual([
			['2:0:0:0:4', 2],
			['2:r:0.1,0.2,0.5,0.6', 0],
		]);
	});

	it('ページ順に並べ、索引にある PDF を返す', () => {
		const index = new HighlightIndex();
		index.setNote('A.md', {
			entries: [entry('hl-1', 'A.md', 3), entry('hl-2', 'A.md', 1)],
			blocks: [block('hl-1', 'A.md'), block('hl-2', 'A.md')],
		});
		expect(index.forPdf('PDF/doc.pdf').map((h) => h.page)).toEqual([1, 3]);
		expect(index.pdfPaths()).toEqual(new Set(['PDF/doc.pdf']));
		expect(index.forPdf('other.pdf')).toEqual([]);
	});
});
