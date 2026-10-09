import {
	PluginSettingTab,
	type App,
	type SettingDefinitionItem,
} from 'obsidian';
import { t } from './i18n';
import { invalidHeadingLine } from './lib/heading-spec';
import {
	DEFAULT_SETTINGS,
	isReservedProperty,
	isValidPropertyName,
	normalizeHex,
	type PdfToolsSettings,
} from './lib/settings';
import type { PaletteEntry } from './lib/types';
import type PdfToolsPlugin from './main';
import { colorLabel, headingKindLabel } from './ui/labels';
import { AddColorModal } from './ui/modals';

const PALETTE_KEY = /^palette\.(\d+)\.color$/;

/** 「ハイライトを入れる見出し」の説明（一般の人向けに、書き方・2 つ以上あるとき・ノートの最後の扱い） */
function insertHeadingDesc(): DocumentFragment {
	return createFragment((fragment) => {
		fragment.appendText(t('settings.insertHeadingDesc'));
		const list = fragment.createEl('ul');
		for (const key of [
			'settings.insertHeadingDescFormat',
			'settings.insertHeadingDescConflict',
			'settings.insertHeadingDescEnd',
		] as const)
			list.createEl('li', { text: t(key) });
	});
}

/** 設定タブ（宣言的。Obsidian が描画・保存・検索を受け持つ） */
export class PdfToolsSettingTab extends PluginSettingTab {
	plugin: PdfToolsPlugin;

	constructor(app: App, plugin: PdfToolsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const settings = this.plugin.settings;
		return [
			{
				type: 'list',
				heading: t('settings.colors'),
				emptyState: t('settings.colorsEmpty'),
				addItem: {
					name: t('settings.addColor'),
					action: () =>
						new AddColorModal(
							this.app,
							this.plugin.settings.palette,
							(entry) => {
								void this.updatePalette([
									...this.plugin.settings.palette,
									entry,
								]);
							},
						).open(),
				},
				onDelete: (index) => {
					const palette = this.plugin.settings.palette.filter(
						(_, i) => i !== index,
					);
					if (palette.length > 0) void this.updatePalette(palette);
					else this.update();
				},
				onReorder: (from, to) => {
					const palette = [...this.plugin.settings.palette];
					const [moved] = palette.splice(from, 1);
					if (moved) palette.splice(to, 0, moved);
					void this.updatePalette(palette);
				},
				items: settings.palette.map((entry, index) => ({
					name: colorLabel(entry),
					desc: t('settings.colorDesc', { name: entry.name }),
					searchable: false,
					control: { type: 'color', key: `palette.${index}.color` },
				})),
			},
			{
				type: 'group',
				heading: t('settings.groupHighlight'),
				items: [
					{
						name: t('settings.defaultColor'),
						desc: t('settings.defaultColorDesc'),
						control: {
							type: 'dropdown',
							key: 'defaultColor',
							options: Object.fromEntries(
								settings.palette.map((entry: PaletteEntry) => [
									entry.name,
									colorLabel(entry),
								]),
							),
						},
					},
					{
						name: t('settings.defaultHeading'),
						desc: t('settings.defaultHeadingDesc'),
						control: {
							type: 'dropdown',
							key: 'defaultHeading',
							options: Object.fromEntries(
								[0, 1, 2, 3].map((level) => [
									String(level),
									headingKindLabel(level),
								]),
							),
						},
					},
					{
						name: t('settings.selectAction'),
						desc: t('settings.selectActionDesc'),
						control: {
							type: 'dropdown',
							key: 'selectAction',
							options: {
								highlight: t('settings.selectHighlight'),
								popup: t('settings.selectPopup'),
								none: t('settings.selectNone'),
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.groupNote'),
				items: [
					{
						name: t('settings.insertHeading'),
						desc: insertHeadingDesc(),
						control: {
							type: 'textarea',
							key: 'insertHeading',
							rows: 3,
							placeholder: t('settings.insertHeadingPlaceholder'),
							validate: (value) => {
								const line = invalidHeadingLine(value);
								return line === null
									? undefined
									: t('settings.invalidHeading', { line });
							},
						},
					},
					{
						name: t('settings.insertPosition'),
						desc: t('settings.insertPositionDesc'),
						control: {
							type: 'dropdown',
							key: 'insertPosition',
							options: {
								order: t('settings.insertOrder'),
								end: t('settings.insertEnd'),
							},
						},
					},
					{
						name: t('settings.bulletList'),
						desc: t('settings.bulletListDesc'),
						control: { type: 'toggle', key: 'bulletList' },
					},
					{
						name: t('settings.hideEntriesProperty'),
						desc: t('settings.hideEntriesPropertyDesc'),
						control: { type: 'toggle', key: 'hideEntriesProperty' },
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.groupPdf'),
				items: [
					{
						name: t('settings.pdfFolder'),
						desc: t('settings.pdfFolderDesc'),
						control: {
							type: 'folder',
							key: 'pdfFolder',
							placeholder: t('settings.pdfFolderPlaceholder'),
						},
					},
					{
						name: t('settings.autoMovePdf'),
						desc: t('settings.autoMovePdfDesc'),
						control: { type: 'toggle', key: 'autoMovePdf' },
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.groupFlip'),
				items: [
					{
						name: t('settings.flipMode'),
						desc: t('settings.flipModeDesc'),
						control: {
							type: 'dropdown',
							key: 'flipMode',
							options: {
								'same-leaf': t('settings.flipSameLeaf'),
								split: t('settings.flipSplit'),
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.groupAdvanced'),
				items: [
					{
						name: t('settings.pairingProperty'),
						desc: t('settings.pairingPropertyDesc'),
						control: {
							type: 'text',
							key: 'pairingProperty',
							placeholder: DEFAULT_SETTINGS.pairingProperty,
							validate: (value) => this.validateProperty(value),
						},
					},
				],
			},
		];
	}

	private validateProperty(value: string): string | void {
		if (isReservedProperty(value)) return t('settings.reservedProperty');
		if (!isValidPropertyName(value)) return t('settings.invalidProperty');
	}

	getControlValue(key: string): unknown {
		const palette = PALETTE_KEY.exec(key);
		if (palette)
			return this.plugin.settings.palette[Number(palette[1])]?.color;
		// ドロップダウンの値は文字列
		if (key === 'defaultHeading')
			return String(this.plugin.settings.defaultHeading);
		return (this.plugin.settings as unknown as Record<string, unknown>)[
			key
		];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		const palette = PALETTE_KEY.exec(key);
		if (palette) {
			const index = Number(palette[1]);
			const color = normalizeHex(value);
			const entry = settings.palette[index];
			if (!entry || color === null) return;
			await this.updatePalette(
				settings.palette.map((item, i) =>
					i === index ? { ...item, color } : item,
				),
				false,
			);
			return;
		}
		const next: PdfToolsSettings = { ...settings };
		switch (key) {
			case 'defaultColor':
				if (
					typeof value === 'string' &&
					settings.palette.some((entry) => entry.name === value)
				)
					next.defaultColor = value;
				break;
			case 'hideEntriesProperty':
			case 'bulletList':
			case 'autoMovePdf':
				if (typeof value === 'boolean') next[key] = value;
				break;
			case 'pdfFolder':
				if (typeof value === 'string') next.pdfFolder = value;
				break;
			case 'selectAction':
				if (
					value === 'highlight' ||
					value === 'popup' ||
					value === 'none'
				)
					next.selectAction = value;
				break;
			case 'insertPosition':
				if (value === 'order' || value === 'end')
					next.insertPosition = value;
				break;
			case 'defaultHeading': {
				const level = Number(value);
				if (Number.isInteger(level) && level >= 0 && level <= 3)
					next.defaultHeading = level;
				break;
			}
			case 'insertHeading':
				if (typeof value === 'string') next.insertHeading = value;
				break;
			case 'flipMode':
				if (value === 'same-leaf' || value === 'split')
					next.flipMode = value;
				break;
			case 'pairingProperty':
				if (typeof value === 'string' && isValidPropertyName(value))
					next.pairingProperty = value;
				break;
			default:
				return;
		}
		await this.plugin.applySettings(next);
	}

	/** 色を変えて保存し、設定タブ・コマンド・描画を更新する */
	private async updatePalette(
		palette: PaletteEntry[],
		rerender = true,
	): Promise<void> {
		const settings = this.plugin.settings;
		const defaultColor = palette.some(
			(entry) => entry.name === settings.defaultColor,
		)
			? settings.defaultColor
			: (palette[0]?.name ?? settings.defaultColor);
		await this.plugin.applySettings({ ...settings, palette, defaultColor });
		if (rerender) this.update();
	}
}
