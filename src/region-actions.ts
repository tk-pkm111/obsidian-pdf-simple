import { Notice, type FileView } from 'obsidian';
import { t } from './i18n';
import { buildBodyLine, entryLabel } from './lib/highlight-entry';
import type PdfSimplePlugin from './main';
import { isPasswordError } from './pdf/pdfjs';
import type { RenderedRegion } from './pdf/render-region';
import type { CapturedRegion } from './viewer/region-capture';

/** 画像のファイル名に使う PDF 名（リンクを壊す文字を除き、長さを抑える） */
function safeName(basename: string): string {
	const cleaned = basename
		.replace(/[#^[\]|\\/:*?"<>]/g, ' ')
		.replace(/\s+/g, '-')
		.replace(/^-+|-+$/g, '');
	return Array.from(cleaned).slice(0, 40).join('') || 'pdf';
}

/**
 * 範囲を画像として取り込む: PNG を添付ファイルの場所に保存し、ノートに `![[画像|幅]] ^hl-…` を足し、
 * PDF 側にはその四角を描く（記録は region= のエントリ）。
 */
export class RegionActions {
	constructor(private readonly plugin: PdfSimplePlugin) {}

	capture(view: FileView, captured: CapturedRegion): Promise<void> {
		const pdf = view.file;
		if (!pdf) return Promise.resolve();
		const { app, settings } = this.plugin;
		return this.plugin.actions.add({
			view,
			page: captured.page,
			anchor: { type: 'region', region: captured.region },
			color: settings.defaultColor,
			label: entryLabel(captured.page, t('label.image')),
			// 画像は自分でボタンを押して取り込むので、ノートが無ければ作る
			allowCreateNote: true,
			line: async (id, notePath) => {
				let image: RenderedRegion;
				try {
					image = await this.plugin.regionRenderer.render(
						pdf,
						captured.page,
						captured.displayed,
						captured.rotation,
					);
				} catch (error) {
					console.error(error);
					new Notice(
						isPasswordError(error)
							? t('notice.regionPassword')
							: t('notice.regionFailed', {
									message: String(error),
								}),
						8000,
					);
					return null;
				}
				const name = `${safeName(pdf.basename)}-p${captured.page}-${id.slice(3)}.png`;
				const path =
					await app.fileManager.getAvailablePathForAttachment(
						name,
						notePath,
					);
				const file = await app.vault.createBinary(path, image.data);
				// 幅は PDF を 100% で見たときの大きさ（3 倍で描いた画像が大きく出すぎないように）
				const link = app.fileManager.generateMarkdownLink(
					file,
					notePath,
					undefined,
					String(image.cssWidth),
				);
				return buildBodyLine({
					kind: 'image',
					embed: `!${link}`,
					id,
					bullet: settings.bulletList,
				});
			},
		});
	}
}
