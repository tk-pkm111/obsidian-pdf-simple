import {
	ConfirmationModal,
	FuzzySuggestModal,
	Modal,
	Setting,
	TFile,
	type App,
	type FuzzyMatch,
} from 'obsidian';
import { t } from '../i18n';
import { isColorName } from '../lib/pdf-subpath';
import { normalizeHex } from '../lib/settings';
import type { PaletteEntry } from '../lib/types';
import { colorLabel } from './labels';

/** vault の PDF から 1 つ選ぶ */
export class PdfSuggestModal extends FuzzySuggestModal<TFile> {
	constructor(
		app: App,
		private readonly onChoose: (file: TFile) => void,
	) {
		super(app);
		this.setPlaceholder(t('modal.choosePdf'));
		this.emptyStateText = t('modal.noPdfs');
	}

	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((file) => file.extension === 'pdf')
			.sort((a, b) => b.stat.mtime - a.stat.mtime);
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}

/** 候補のノートから 1 つ選ぶ（閉じたら null） */
class NoteSuggestModal extends FuzzySuggestModal<TFile> {
	private chosen = false;

	constructor(
		app: App,
		private readonly notes: TFile[],
		private readonly resolve: (file: TFile | null) => void,
	) {
		super(app);
		this.setPlaceholder(t('modal.chooseNote'));
	}

	getItems(): TFile[] {
		return this.notes;
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.chosen = true;
		this.resolve(file);
	}

	onClose(): void {
		// 候補を選んだときは onClose の後に onChooseItem が呼ばれるので、少し待ってから判定する
		window.setTimeout(() => {
			if (!this.chosen) this.resolve(null);
		}, 0);
	}
}

export function chooseNote(app: App, notes: TFile[]): Promise<TFile | null> {
	return new Promise((resolve) =>
		new NoteSuggestModal(app, notes, resolve).open(),
	);
}

/** 色を 1 つ選ぶ */
export class ColorSuggestModal extends FuzzySuggestModal<PaletteEntry> {
	constructor(
		app: App,
		private readonly palette: PaletteEntry[],
		private readonly onChoose: (entry: PaletteEntry) => void,
	) {
		super(app);
		this.setPlaceholder(t('modal.chooseColor'));
	}

	getItems(): PaletteEntry[] {
		return this.palette;
	}

	getItemText(entry: PaletteEntry): string {
		return colorLabel(entry);
	}

	renderSuggestion(match: FuzzyMatch<PaletteEntry>, el: HTMLElement): void {
		el.addClass('pdf-simple-color-suggestion');
		el.createSpan({ cls: 'pdf-simple-color-swatch' }).setCssProps({
			'--pdf-simple-hl': match.item.color,
		});
		super.renderSuggestion(match, el.createSpan());
	}

	onChooseItem(entry: PaletteEntry): void {
		this.onChoose(entry);
	}
}

/** 見出しの大きさを選ぶ（0 は本文） */
export class HeadingSuggestModal extends FuzzySuggestModal<number> {
	constructor(
		app: App,
		private readonly onChoose: (level: number) => void,
	) {
		super(app);
		this.setPlaceholder(t('modal.chooseHeading'));
	}

	getItems(): number[] {
		return [1, 2, 3, 0];
	}

	getItemText(level: number): string {
		return level === 0
			? t('modal.headingNone')
			: t('menu.headingLevel', { level });
	}

	onChooseItem(level: number): void {
		this.onChoose(level);
	}
}

/** 色を追加する（識別名・表示名・色） */
export class AddColorModal extends Modal {
	private name = '';
	private label = '';
	private color = '#ff8fab';

	constructor(
		app: App,
		private readonly palette: readonly PaletteEntry[],
		private readonly onAdd: (entry: PaletteEntry) => void,
	) {
		super(app);
	}

	onOpen(): void {
		this.setTitle(t('modal.addColorTitle'));
		const nameSetting = new Setting(this.contentEl)
			.setName(t('modal.colorName'))
			.setDesc(t('modal.colorNameDesc'))
			.addText((text) =>
				text.onChange((value) => {
					this.name = value.trim();
					nameSetting.setErrorMessage(this.validate());
				}),
			);
		new Setting(this.contentEl)
			.setName(t('modal.colorLabel'))
			.setDesc(t('modal.colorLabelDesc'))
			.addText((text) =>
				text.onChange((value) => {
					this.label = value.trim();
				}),
			);
		new Setting(this.contentEl)
			.setName(t('modal.colorValue'))
			.addColorPicker((picker) =>
				picker.setValue(this.color).onChange((value) => {
					this.color = value;
				}),
			);
		new Setting(this.contentEl).addButton((button) =>
			button
				.setButtonText(t('modal.add'))
				.setCta()
				.onClick(() => {
					const error = this.validate();
					const color = normalizeHex(this.color);
					if (error !== null || color === null) {
						nameSetting.setErrorMessage(
							error ?? t('modal.invalidColorName'),
						);
						return;
					}
					this.onAdd({ name: this.name, color, label: this.label });
					this.close();
				}),
		);
	}

	private validate(): string | null {
		if (!isColorName(this.name)) return t('modal.invalidColorName');
		if (this.palette.some((entry) => entry.name === this.name))
			return t('modal.duplicateColorName');
		return null;
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * ハイライトを入れる見出しを選ぶ（設定の見出しがノートに 2 つ以上あるとき）。
 * 見出しごとのボタンを出す。選ばずに閉じたら null。
 */
export function chooseInsertHeading(
	app: App,
	headings: readonly string[],
): Promise<string | null> {
	return new Promise((resolve) => {
		let chosen: string | null = null;
		const modal = new ConfirmationModal(app)
			.setTitle(t('modal.insertHeadingTitle'))
			.setContent(t('modal.insertHeadingBody'));
		headings.forEach((heading, i) =>
			modal.addButton((button) => {
				button.setButtonText(heading).onClick(() => {
					chosen = heading;
				});
				if (i === 0) button.setCta().setInitialFocus();
			}),
		);
		modal
			.addCancelButton(t('modal.cancel'))
			.setCloseCallback(() => resolve(chosen))
			.open();
	});
}

/** 削除の確認（はいなら onConfirm） */
export function confirmDelete(
	app: App,
	title: string,
	body: string | DocumentFragment,
	onConfirm: () => void | Promise<void>,
): void {
	new ConfirmationModal(app)
		.setTitle(title)
		.setContent(body)
		.addButton((button) =>
			button
				.setButtonText(t('modal.delete'))
				.setDestructive()
				.onClick(() => onConfirm()),
		)
		.addCancelButton(t('modal.cancel'))
		.open();
}
