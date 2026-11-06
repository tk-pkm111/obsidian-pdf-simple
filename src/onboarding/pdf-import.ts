import { Notice, normalizePath, type TFile } from 'obsidian';
import { t } from '../i18n';
import { folderChain, importBasename, uniqueFilePath } from '../lib/file-paths';
import type PdfSimplePlugin from '../main';

const INPUT_CLASS = 'pdf-simple-file-input';

/**
 * パソコンやスマホの PDF を vault に取り込む（ファイルを選ぶ画面 → 保存先へコピー → 開く）。
 * 保存先のフォルダが決まっていればそこ、無ければ Obsidian の添付ファイルの場所に置く。
 */
export class PdfImporter {
	constructor(private readonly plugin: PdfSimplePlugin) {}

	/** ファイルを選ぶ画面を開く。クリックやコマンドの中から、待たずに呼ぶ（ブラウザが操作の直後しか開かせないため） */
	pick(): void {
		const doc = activeDocument;
		// 前に開いて選ばずに閉じたもの（cancel が来ない環境）を片付ける
		for (const old of Array.from(doc.querySelectorAll(`.${INPUT_CLASS}`)))
			old.remove();
		const input = doc.body.createEl('input', {
			cls: INPUT_CLASS,
			attr: {
				type: 'file',
				accept: '.pdf,application/pdf',
				multiple: '',
			},
		});
		input.addEventListener(
			'change',
			() => {
				const files = Array.from(input.files ?? []);
				input.remove();
				void this.importFiles(files);
			},
			{ once: true },
		);
		input.addEventListener('cancel', () => input.remove(), { once: true });
		input.click();
	}

	/** 選んだファイルを取り込み、最初の 1 つを新しいタブで開く */
	async importFiles(files: readonly File[]): Promise<void> {
		const { vault, workspace } = this.plugin.app;
		const pdfs = files.filter(
			(file) =>
				file.type === 'application/pdf' || /\.pdf$/i.test(file.name),
		);
		for (const file of files)
			if (!pdfs.includes(file))
				new Notice(t('notice.notPdf', { name: file.name }));
		const imported: TFile[] = [];
		for (const file of pdfs) {
			try {
				const data = await file.arrayBuffer();
				const path = await this.targetPath(file.name);
				imported.push(await vault.createBinary(path, data));
			} catch (error) {
				console.error(error);
				new Notice(
					t('notice.importFailed', {
						name: file.name,
						message: String(error),
					}),
					8000,
				);
			}
		}
		const first = imported[0];
		if (!first) return;
		new Notice(
			imported.length === 1
				? t('notice.imported', { name: first.name })
				: t('notice.importedMany', { count: imported.length }),
		);
		await workspace.getLeaf('tab').openFile(first, { active: true });
	}

	private async targetPath(fileName: string): Promise<string> {
		const { vault, fileManager } = this.plugin.app;
		const basename = importBasename(fileName);
		const folder = this.plugin.storage.folder();
		if (folder === null)
			return fileManager.getAvailablePathForAttachment(`${basename}.pdf`);
		for (const dir of folderChain(folder))
			if (!vault.getFolderByPath(dir)) await vault.createFolder(dir);
		return normalizePath(
			uniqueFilePath(
				folder,
				basename,
				'pdf',
				(path) => vault.getAbstractFileByPath(path) !== null,
			),
		);
	}
}
