import { TFile, normalizePath } from 'obsidian';
import { pairedNotePaths, pairedPdfPath, uniqueNotePath } from '../lib/pairing';
import type PdfSimplePlugin from '../main';

/** ノートと PDF の対応（プロパティ pdf: "[[doc.pdf]]"、無ければ本文で最初の PDF） */
export class PairingService {
	constructor(private readonly plugin: PdfSimplePlugin) {}

	private resolvePdf(linkpath: string, sourcePath: string): string | null {
		const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			sourcePath,
		);
		return file && file.extension === 'pdf' ? file.path : null;
	}

	private pdfPathFor(notePath: string): string | null {
		return pairedPdfPath(
			this.plugin.app.metadataCache.getCache(notePath),
			this.plugin.settings.pairingProperty,
			(linkpath) => this.resolvePdf(linkpath, notePath),
		);
	}

	/** ノートに添付された PDF */
	pdfFor(note: TFile): TFile | null {
		const path = this.pdfPathFor(note.path);
		return path === null ? null : this.plugin.app.vault.getFileByPath(path);
	}

	/** その PDF を添付しているノート（名前順） */
	notesFor(pdf: TFile): TFile[] {
		const { metadataCache, vault } = this.plugin.app;
		return pairedNotePaths(
			metadataCache.resolvedLinks,
			pdf.path,
			(notePath) => this.pdfPathFor(notePath),
		)
			.map((path) => vault.getFileByPath(path))
			.filter((file): file is TFile => file !== null);
	}

	/** ノートのプロパティに PDF へのリンクを書く */
	async attach(note: TFile, pdf: TFile): Promise<void> {
		const { fileManager, metadataCache } = this.plugin.app;
		// 保存先へ移す設定なら、先に移してから新しい場所へのリンクを書く
		await this.plugin.storage.moveIfAuto(pdf);
		const link = `[[${metadataCache.fileToLinktext(pdf, note.path)}]]`;
		const property = this.plugin.settings.pairingProperty;
		await fileManager.processFrontMatter(
			note,
			(frontmatter: Record<string, unknown>) => {
				frontmatter[property] = link;
			},
		);
	}

	/** PDF のノートを作る（新しいノートの既定の場所に `<PDF の名前>.md`。あれば番号を付ける） */
	async createNoteFor(pdf: TFile): Promise<TFile> {
		const { fileManager, vault } = this.plugin.app;
		const parent = fileManager.getNewFileParent(
			pdf.path,
			`${pdf.basename}.md`,
		);
		const path = normalizePath(
			uniqueNotePath(
				parent.isRoot() ? '' : parent.path,
				pdf.basename,
				(candidate) =>
					vault.getAbstractFileByPath(normalizePath(candidate)) !==
					null,
			),
		);
		const note = await vault.create(path, '');
		await this.attach(note, pdf);
		return note;
	}
}
