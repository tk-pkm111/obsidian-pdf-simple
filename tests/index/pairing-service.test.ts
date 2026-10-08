import { describe, expect, it } from 'vitest';
import { FakeFileManager } from '../helpers/fake-app';
import { PDF_PATH, createTestPlugin, noteWith } from '../helpers/plugin';

describe('PairingService', () => {
	it('プロパティ → 本文の最初の PDF の順にペアを探す', async () => {
		const t = await createTestPlugin();
		const byProperty = await t.vault.create('A.md', noteWith([], ''));
		const byEmbed = await t.vault.create('B.md', '# B\n\n![[doc.pdf]]\n');
		const none = await t.vault.create('C.md', '# C\n\n[[A]]\n');
		expect(t.pairing.pdfFor(byProperty)?.path).toBe(PDF_PATH);
		expect(t.pairing.pdfFor(byEmbed)?.path).toBe(PDF_PATH);
		expect(t.pairing.pdfFor(none)).toBeNull();
	});

	it('PDF を添付しているノート', async () => {
		const t = await createTestPlugin();
		await t.vault.create('A.md', noteWith([], ''));
		await t.vault.create('Other.md', noteWith([], '', null));
		const pdf = t.vault.getFileByPath(PDF_PATH);
		expect(pdf && t.pairing.notesFor(pdf).map((note) => note.path)).toEqual(
			['A.md'],
		);
	});

	it('添付: プロパティに PDF へのリンクを書く', async () => {
		const t = await createTestPlugin();
		const note = await t.vault.create('A.md', '# A\n');
		const pdf = t.vault.getFileByPath(PDF_PATH);
		if (!pdf) throw new Error('no pdf');
		await t.pairing.attach(note, pdf);
		expect(FakeFileManager.read(t.vault.text('A.md')).pdf).toBe(
			'[[doc.pdf]]',
		);
		expect(t.vault.text('A.md')).toContain('# A');
	});

	it('PDF のノートを作る（同じ名前があれば番号を付ける）', async () => {
		const t = await createTestPlugin();
		await t.vault.create('doc.md', '# existing\n');
		const pdf = t.vault.getFileByPath(PDF_PATH);
		if (!pdf) throw new Error('no pdf');
		const note = await t.pairing.createNoteFor(pdf);
		expect(note.path).toBe('doc 1.md');
		expect(FakeFileManager.read(t.vault.text('doc 1.md')).pdf).toBe(
			'[[doc.pdf]]',
		);
		expect(t.pairing.notesFor(pdf).map((file) => file.path)).toEqual([
			'doc 1.md',
		]);
	});
});
