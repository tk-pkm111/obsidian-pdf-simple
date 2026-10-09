import { Notice, normalizePath, type TFile } from 'obsidian';
import { t } from './i18n';
import {
	folderChain,
	isInFolder,
	normalizeFolder,
	uniqueFilePath,
} from './lib/file-paths';
import type PdfSimplePlugin from './main';

/**
 * PDF の保存先（設定のフォルダ）への移動。
 * 移すときは FileManager.renameFile を使うので、ノートのプロパティ（pdf・pdf-highlights）や埋め込みなど、
 * PDF へのリンクはユーザーの設定に従って Obsidian が直す。
 */
export class PdfStorage {
	constructor(private readonly plugin: PdfSimplePlugin) {}

	/** 保存先のフォルダ（未設定なら null） */
	folder(): string | null {
		const folder = normalizeFolder(this.plugin.settings.pdfFolder);
		return folder === '' ? null : normalizePath(folder);
	}

	/** 保存先へ移せるか（保存先が決まっていて、PDF がまだその外にある） */
	canMove(pdf: TFile): boolean {
		const folder = this.folder();
		return (
			pdf.extension === 'pdf' &&
			folder !== null &&
			!isInFolder(pdf.path, folder)
		);
	}

	/** 保存先へ移す（無いフォルダは作る。同じ名前があれば番号を付ける）。移したら true */
	async move(pdf: TFile): Promise<boolean> {
		const folder = this.folder();
		if (folder === null || !this.canMove(pdf)) return false;
		const { vault, fileManager } = this.plugin.app;
		try {
			for (const path of folderChain(folder))
				if (!vault.getFolderByPath(path))
					await vault.createFolder(path);
			const target = uniqueFilePath(
				folder,
				pdf.basename,
				pdf.extension,
				(path) => vault.getAbstractFileByPath(path) !== null,
			);
			await fileManager.renameFile(pdf, target);
			new Notice(t('notice.pdfMoved', { folder }));
			return true;
		} catch (error) {
			console.error(error);
			new Notice(
				t('notice.pdfMoveFailed', { message: String(error) }),
				8000,
			);
			return false;
		}
	}

	/** 自動で移す設定なら移す（PDF にハイライトしたとき・ノートに添付したとき） */
	async moveIfAuto(pdf: TFile): Promise<void> {
		if (this.plugin.settings.autoMovePdf && this.canMove(pdf))
			await this.move(pdf);
	}
}
