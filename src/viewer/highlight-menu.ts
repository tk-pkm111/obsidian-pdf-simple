import { Menu, type FileView } from 'obsidian';
import { t } from '../i18n';
import { normalizeSelectedText } from '../lib/text';
import type { Highlight } from '../lib/types';
import type PdfToolsPlugin from '../main';
import { noteName } from '../ui/labels';

/** PDF 上のハイライトを右クリック（長押し）したときのメニュー */
export function showHighlightMenu(
	plugin: PdfToolsPlugin,
	view: FileView,
	highlight: Highlight,
	evt: MouseEvent,
	text: string | null,
): void {
	const menu = new Menu();
	const sourceLeaf = view.leaf;
	if (highlight.blocks.length <= 1) {
		menu.addItem((item) =>
			item
				.setTitle(t('menu.openNote'))
				.setIcon('file-text')
				.onClick(
					() =>
						void plugin.actions.openInNote(highlight, {
							sourceLeaf,
							newLeaf: false,
						}),
				),
		);
	} else {
		for (const block of highlight.blocks)
			menu.addItem((item) =>
				item
					.setTitle(
						t('menu.openNoteIn', {
							name: noteName(block.notePath),
						}),
					)
					.setIcon('file-text')
					.onClick(
						() =>
							void plugin.actions.openBlock(block, {
								sourceLeaf,
								newLeaf: false,
							}),
					),
			);
	}
	menu.addItem((item) =>
		item
			.setTitle(t('menu.recolor'))
			.setIcon('palette')
			.onClick(() => plugin.actions.chooseColor(highlight.ids)),
	);
	if (highlight.anchor.type === 'text')
		menu.addItem((item) =>
			item
				.setTitle(t('menu.changeHeading'))
				.setIcon('heading')
				.onClick(() =>
					plugin.actions.chooseHeadingLevel(highlight.ids),
				),
		);
	if (text !== null) {
		const copied = normalizeSelectedText(text);
		menu.addItem((item) =>
			item
				.setTitle(t('menu.copyText'))
				.setIcon('copy')
				.onClick(() => void navigator.clipboard.writeText(copied)),
		);
	}
	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle(t('menu.delete'))
			.setIcon('trash-2')
			.setWarning(true)
			.onClick(
				() =>
					// ノートの文が PDF の文字のままなら行ごと、書き換えられていれば文を残す
					void plugin.actions.deleteHighlight(highlight.ids, {
						type: 'match',
						expected: text,
					}),
			),
	);
	menu.showAtMouseEvent(evt);
}
