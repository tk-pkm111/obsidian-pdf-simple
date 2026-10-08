import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Notice } from '../__mocks__/obsidian';
import { FakeFileManager } from '../helpers/fake-app';
import {
	PDF_PATH,
	createTestPlugin,
	entryText,
	noteWith,
} from '../helpers/plugin';

describe('HighlightService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		Notice.reset();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('起動時に vault を読み、エントリと本文の ID がそろったものを描く', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith(
				[entryText('hl-aaaaaa'), entryText('hl-bbbbbb', 3)],
				'- ==a== ^hl-aaaaaa',
			),
		);
		t.highlights.start();
		const highlights = t.highlights.index.forPdf(PDF_PATH);
		expect(highlights.map((h) => h.ids)).toEqual([['hl-aaaaaa']]);
		expect(highlights[0]?.blocks).toEqual([
			{ id: 'hl-aaaaaa', notePath: 'Note.md', line: 7, level: 0 },
		]);
		expect(t.highlights.index.orphanEntries().map((e) => e.id)).toEqual([
			'hl-bbbbbb',
		]);
	});

	it('本文を消すと描かなくなり、変わった PDF を知らせる', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], '- ==a== ^hl-aaaaaa'),
		);
		t.highlights.start();
		const changes: Array<ReadonlySet<string> | null> = [];
		t.highlights.onChange((paths) => changes.push(paths));
		await t.vault.process(note, (text) =>
			text.replace('- ==a== ^hl-aaaaaa', ''),
		);
		expect(t.highlights.index.forPdf(PDF_PATH)).toEqual([]);
		expect(changes).toContainEqual(new Set([PDF_PATH]));
	});

	it('本文を別のノートへ切り貼りしても描き続ける（行き先も移る）', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], '- ==a== ^hl-aaaaaa'),
		);
		t.highlights.start();
		await t.vault.process(note, (text) =>
			text.replace('- ==a== ^hl-aaaaaa', ''),
		);
		await t.vault.create(
			'Essay.md',
			'# Essay\n\nMy thoughts: ==a== ^hl-aaaaaa\n',
		);
		expect(t.highlights.index.forPdf(PDF_PATH)[0]?.blocks).toEqual([
			{ id: 'hl-aaaaaa', notePath: 'Essay.md', line: 2, level: 0 },
		]);
	});

	it('ノートの改名に追従する', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], '- ==a== ^hl-aaaaaa'),
		);
		t.highlights.start();
		await t.vault.rename(note, 'Moved.md');
		expect(t.highlights.index.entry('hl-aaaaaa')?.notePath).toBe(
			'Moved.md',
		);
		expect(t.highlights.index.blocksFor('hl-aaaaaa')[0]?.notePath).toBe(
			'Moved.md',
		);
	});

	it('エントリのあるノートを消すと、本文が残っているノートへエントリを移す', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith(
				[entryText('hl-aaaaaa'), entryText('hl-bbbbbb', 3)],
				'- ==b== ^hl-bbbbbb',
			),
		);
		await t.vault.create('Essay.md', 'Quote: ==a== ^hl-aaaaaa\n');
		t.highlights.start();
		t.vault.externalDelete('Note.md');
		await vi.advanceTimersByTimeAsync(2000);
		const essay = FakeFileManager.read(t.vault.text('Essay.md'));
		expect(essay['pdf-highlights']).toEqual([
			'[[doc.pdf#page=2&selection=2,0,3,4&color=yellow&id=hl-aaaaaa|p.2 text hl-aaaaaa]]',
		]);
		expect(t.highlights.index.forPdf(PDF_PATH).map((h) => h.ids)).toEqual([
			['hl-aaaaaa'],
		]);
		expect(Notice.shown.some((message) => message.includes('1 件'))).toBe(
			true,
		);
	});

	it('作った直後のハイライトは、キャッシュに反映されるまで描く', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], ''));
		t.highlights.start();
		const selection = {
			begin: { idx: 2, offset: 0 },
			end: { idx: 3, offset: 4 },
		};
		t.highlights.addPending({
			entry: {
				id: 'hl-cccccc',
				notePath: 'Note.md',
				pdfPath: PDF_PATH,
				page: 2,
				anchor: { type: 'text', selection },
				color: 'red',
				label: 'p.2 x',
			},
			block: { id: 'hl-cccccc', notePath: 'Note.md', line: 0 },
			createdAt: Date.now(),
		});
		expect(t.highlights.index.forPdf(PDF_PATH).map((h) => h.color)).toEqual(
			['red'],
		);
		await t.writer.insertHighlight(
			note,
			'- ==x== ^hl-cccccc',
			entryText('hl-cccccc', 2, 2, 'red'),
		);
		vi.advanceTimersByTime(2500);
		expect(t.highlights.index.forPdf(PDF_PATH)[0]?.blocks[0]?.line).toBe(6);
	});

	it('記録は pdf-highlights だけから読む（ほかのプロパティのリンクは読まない）', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			`---\nother:\n  - "${entryText('hl-aaaaaa')}"\n---\n\na ^hl-aaaaaa\n`,
		);
		t.highlights.start();
		expect(t.highlights.index.forPdf(PDF_PATH)).toEqual([]);
	});

	it('段落の途中に入った ID は認識されない（空行で区切った段落だけ）', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith(
				[entryText('hl-aaaaaa'), entryText('hl-bbbbbb', 3)],
				'a ^hl-aaaaaa\nmy note\n\nb ^hl-bbbbbb\n\n## T ^hl-cccccc',
			),
		);
		t.highlights.start();
		expect(t.highlights.index.forPdf(PDF_PATH).map((h) => h.ids)).toEqual([
			['hl-bbbbbb'],
		]);
		expect(t.highlights.index.blocksFor('hl-cccccc')[0]?.level).toBe(2);
	});
});
