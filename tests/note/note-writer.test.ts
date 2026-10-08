import { describe, expect, it } from 'vitest';
import { FakeFileManager, FakeMarkdownView } from '../helpers/fake-app';
import { createTestPlugin, entryText, noteWith } from '../helpers/plugin';

describe('NoteWriter', () => {
	it('閉じているノートには Vault.process と processFrontMatter で書く', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], 'Intro.'));
		await t.writer.insertHighlight(
			note,
			'- ==A short list== ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		const text = t.vault.text('Note.md') ?? '';
		expect(text).toContain('Intro.\n\n- ==A short list== ^hl-aaaaaa\n');
		expect(FakeFileManager.read(text)['pdf-highlights']).toEqual([
			entryText('hl-aaaaaa'),
		]);
		expect(FakeFileManager.read(text).pdf).toBe('[[doc.pdf]]');
	});

	it('2 件目は箇条書きに続け、同じ ID のエントリは重ねない', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], ''));
		await t.writer.insertHighlight(
			note,
			'- ==a== ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		await t.writer.insertHighlight(
			note,
			'- ==b== ^hl-bbbbbb',
			entryText('hl-bbbbbb'),
		);
		await t.writer.addEntryStrings(note, [entryText('hl-bbbbbb')]);
		const text = t.vault.text('Note.md') ?? '';
		expect(text).toContain('- ==a== ^hl-aaaaaa\n- ==b== ^hl-bbbbbb\n');
		expect(FakeFileManager.read(text)['pdf-highlights']).toHaveLength(2);
	});

	it('設定の見出しがあれば、その節に足す', async () => {
		const t = await createTestPlugin({ insertHeading: '## メモ' });
		const note = await t.vault.create(
			'Note.md',
			noteWith([], '## メモ\n\n- x\n\n## 次'),
		);
		await t.writer.insertHighlight(
			note,
			'- ==a== ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		expect(t.vault.text('Note.md')).toContain(
			'## メモ\n\n- x\n- ==a== ^hl-aaaaaa\n\n## 次',
		);
	});

	it('ノートごとの見出し（プロパティ）が設定の見出しより先。外すと設定の見出しに戻る', async () => {
		const t = await createTestPlugin({ insertHeading: 'メモ' });
		const note = await t.vault.create(
			'Note.md',
			'---\npdf: "[[doc.pdf]]"\n---\n\n## メモ\n\n## 次\n\n%%\ndata\n%%\n',
		);
		await t.writer.setNoteHeading(note, '次');
		expect(t.writer.noteHeading(note)).toBe('次');
		await t.writer.insertHighlight(
			note,
			'a ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		expect(t.vault.text('Note.md')).toContain(
			'## メモ\n\n## 次\n\na ^hl-aaaaaa\n\n%%\ndata\n%%\n',
		);
		await t.writer.setNoteHeading(note, null);
		expect(t.writer.noteHeading(note)).toBeNull();
		expect(
			FakeFileManager.read(t.vault.text('Note.md') ?? ''),
		).not.toHaveProperty('pdf-highlights-heading');
		await t.writer.insertHighlight(
			note,
			'b ^hl-bbbbbb',
			entryText('hl-bbbbbb'),
		);
		expect(t.vault.text('Note.md')).toContain(
			'## メモ\n\nb ^hl-bbbbbb\n\n## 次\n\na ^hl-aaaaaa\n',
		);
	});

	it('ソースモードで開いているノートは Editor で書き、保存してからプロパティを書く', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], 'Intro.'));
		const view = new FakeMarkdownView(t.vault, note);
		t.workspace.leaves.push({ view });
		await t.writer.insertHighlight(
			note,
			'- ==a== ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		expect(view.saves).toBe(1);
		expect(view.editor.getValue()).toContain(
			'Intro.\n\n- ==a== ^hl-aaaaaa\n',
		);
		const text = t.vault.text('Note.md') ?? '';
		expect(text).toContain('- ==a== ^hl-aaaaaa');
		expect(FakeFileManager.read(text)['pdf-highlights']).toEqual([
			entryText('hl-aaaaaa'),
		]);
	});

	it('閲覧モードで開いているだけなら Vault.process で書く', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], 'Intro.'));
		const view = new FakeMarkdownView(t.vault, note, 'preview');
		t.workspace.leaves.push({ view });
		await t.writer.insertHighlight(
			note,
			'- ==a== ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		expect(view.saves).toBe(0);
		expect(t.vault.text('Note.md')).toContain('- ==a== ^hl-aaaaaa');
	});

	it('削除: 本文の行（別のノートでも）とエントリを消す', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith(
				[entryText('hl-aaaaaa'), entryText('hl-bbbbbb', 3)],
				'- ==b== ^hl-bbbbbb',
			),
		);
		await t.vault.create(
			'Essay.md',
			'Before\n\n- ==a== ^hl-aaaaaa\n- keep\n',
		);
		t.highlights.start();
		await t.writer.removeHighlight('hl-aaaaaa', { type: 'line' });
		expect(t.vault.text('Essay.md')).toBe('Before\n\n- keep\n');
		expect(
			FakeFileManager.read(t.vault.text('Note.md'))['pdf-highlights'],
		).toEqual([entryText('hl-bbbbbb', 3)]);
	});

	it('最後のエントリを消すとプロパティごと消す', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], '- ==a== ^hl-aaaaaa'),
		);
		t.highlights.start();
		await t.writer.removeHighlight('hl-aaaaaa', { type: 'line' });
		const frontmatter = FakeFileManager.read(t.vault.text('Note.md'));
		expect(frontmatter).toEqual({ pdf: '[[doc.pdf]]' });
		expect(t.vault.text('Note.md')).not.toContain('hl-aaaaaa');
	});

	it('段落の形: 1 件ずつ空行で区切る', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('Note.md', noteWith([], 'Intro.'));
		await t.writer.insertHighlight(
			note,
			'a ^hl-aaaaaa',
			entryText('hl-aaaaaa'),
		);
		await t.writer.insertHighlight(
			note,
			'## T ^hl-bbbbbb',
			entryText('hl-bbbbbb'),
		);
		expect(t.vault.text('Note.md')).toContain(
			'Intro.\n\na ^hl-aaaaaa\n\n## T ^hl-bbbbbb\n',
		);
	});

	it('PDF から消す: 文がそのままなら行ごと、書き換えられていれば文を残す', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith(
				[entryText('hl-aaaaaa'), entryText('hl-bbbbbb', 3)],
				'Quote ^hl-aaaaaa\n\nQuote and my note ^hl-bbbbbb',
			),
		);
		t.highlights.start();
		const match = { type: 'match' as const, expected: 'Quote' };
		expect(await t.writer.removeHighlight('hl-aaaaaa', match)).toBe(false);
		expect(await t.writer.removeHighlight('hl-bbbbbb', match)).toBe(true);
		const text = t.vault.text('Note.md') ?? '';
		expect(text).toContain('\nQuote and my note\n');
		expect(text).not.toContain('hl-');
	});

	it('見出しの大きさを変える', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], 'Title ^hl-aaaaaa'),
		);
		t.highlights.start();
		await t.writer.setHeadingLevel('hl-aaaaaa', 2);
		expect(t.vault.text('Note.md')).toContain('\n## Title ^hl-aaaaaa\n');
	});

	it('色を変える: エントリの color= だけ', async () => {
		const t = await createTestPlugin();
		await t.vault.create(
			'Note.md',
			noteWith([entryText('hl-aaaaaa')], '- ==a== ^hl-aaaaaa'),
		);
		t.highlights.start();
		await t.writer.recolor('hl-aaaaaa', 'blue');
		expect(
			FakeFileManager.read(t.vault.text('Note.md'))['pdf-highlights'],
		).toEqual([entryText('hl-aaaaaa', 2, 2, 'blue')]);
		expect(t.highlights.index.entry('hl-aaaaaa')?.color).toBe('blue');
	});
});
