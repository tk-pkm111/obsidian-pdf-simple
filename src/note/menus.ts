import { MarkdownView, Notice, TFile } from 'obsidian';
import { t } from '../i18n';
import type PdfToolsPlugin from '../main';
import { PdfSuggestModal } from '../ui/modals';
import { isPdfView } from '../viewer/dom';
import { takeContextLine } from './decorations';

/** ノートの右クリックメニュー（ハイライトの行）と、ファイルのメニュー（添付・表裏） */
export function registerMenus(plugin: PdfToolsPlugin): void {
	const { workspace } = plugin.app;

	plugin.registerEvent(
		workspace.on('editor-menu', (menu, editor, info) => {
			const line = takeContextLine() ?? editor.getCursor().line;
			const id = plugin.actions.idAtLine(editor, line);
			if (id === null) return;
			const sourceLeaf = info instanceof MarkdownView ? info.leaf : null;
			menu.addItem((item) =>
				item
					.setTitle(t('menu.openInPdf'))
					.setIcon('book-open')
					.onClick(
						() =>
							void plugin.actions.openInPdf(id, {
								sourceLeaf,
								newLeaf: false,
							}),
					),
			);
			menu.addItem((item) =>
				item
					.setTitle(t('menu.recolor'))
					.setIcon('palette')
					.onClick(() => plugin.actions.chooseColor([id])),
			);
			menu.addItem((item) =>
				item
					.setTitle(t('menu.unlink'))
					.setIcon('unlink')
					.onClick(
						() =>
							void plugin.actions.deleteHighlight([id], {
								type: 'unlink',
							}),
					),
			);
			menu.addItem((item) =>
				item
					.setTitle(t('menu.deleteLine'))
					.setIcon('trash-2')
					.setWarning(true)
					.onClick(
						() =>
							void plugin.actions.deleteHighlight([id], {
								type: 'line',
							}),
					),
			);
		}),
	);

	plugin.registerEvent(
		workspace.on('file-menu', (menu, file, _source, leaf) => {
			if (!(file instanceof TFile)) return;
			if (file.extension === 'md') {
				const paired = plugin.pairing.pdfFor(file);
				const view = leaf?.view;
				if (
					paired &&
					view instanceof MarkdownView &&
					view.file === file
				)
					menu.addItem((item) =>
						item
							.setTitle(t('action.openPdf'))
							.setIcon('book-open')
							.onClick(() => void plugin.flip.toPdf(view)),
					);
				menu.addItem((item) =>
					item
						.setTitle(
							paired ? t('menu.changePdf') : t('menu.attachPdf'),
						)
						.setIcon('paperclip')
						.onClick(() =>
							new PdfSuggestModal(plugin.app, (pdf) => {
								void plugin.pairing
									.attach(file, pdf)
									.then(() => {
										new Notice(
											t('notice.attached', {
												pdf: pdf.name,
											}),
										);
									});
							}).open(),
						),
				);
				return;
			}
			if (file.extension === 'pdf') {
				const view = leaf?.view;
				menu.addItem((item) =>
					item
						.setTitle(t('menu.openPairedNote'))
						.setIcon('file-text')
						.onClick(() => {
							if (view && isPdfView(view) && view.file === file)
								void plugin.flip.toNote(view);
							else void plugin.flip.openNoteForFile(file);
						}),
				);
			}
		}),
	);
}
