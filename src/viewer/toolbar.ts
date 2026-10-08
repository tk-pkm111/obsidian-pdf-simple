import { Component, Menu, setIcon, setTooltip, type FileView } from 'obsidian';
import { t } from '../i18n';
import { MAX_PEN_HEADING, type SelectAction } from '../lib/settings';
import type PdfToolsPlugin from '../main';
import { colorLabel, headingKindLabel } from '../ui/labels';
import { toolbarSlot } from './dom';
import type { ViewTools } from './tools';

export interface ToolbarHost {
	readonly view: FileView;
	readonly tools: ViewTools;
}

/**
 * PDF ビューの上部ツールバーの右側に置くボタン: ペン（色・書き方・塗り方）／範囲を画像に。
 * 本体のツールバーが見つからなければ出さない（コマンドからは使える）。
 */
export class PdfToolbar extends Component {
	private container: HTMLElement | null = null;
	private pen: HTMLElement | null = null;
	private region: HTMLElement | null = null;

	constructor(
		private readonly plugin: PdfToolsPlugin,
		private readonly host: ToolbarHost,
	) {
		super();
	}

	onload(): void {
		this.register(this.host.tools.onChange(() => this.refresh()));
		this.ensure();
	}

	onunload(): void {
		this.container?.remove();
		this.container = null;
	}

	/** ボタンが無ければ足す（何度呼んでもよい） */
	ensure(): void {
		if (this.container?.isConnected) return;
		const slot = toolbarSlot(this.host.view.contentEl);
		if (!slot) return;
		this.container?.remove();
		const container = slot.createDiv({ cls: 'pdf-tools-toolbar' });
		this.pen = this.button(container, 'pdf-tools-tool-pen', (evt) =>
			this.openPenMenu(evt),
		);
		this.pen.createSpan({ cls: 'pdf-tools-pen-swatch' });
		this.pen.createSpan({ cls: 'pdf-tools-pen-kind' });
		this.region = this.button(container, 'pdf-tools-tool-region', () =>
			this.host.tools.toggleRegion(),
		);
		this.container = container;
		this.refresh();
	}

	/** 設定・道具の状態に合わせて見た目を直す */
	refresh(): void {
		const { pen, region } = this;
		if (!pen || !region) return;
		const { settings } = this.plugin;
		const color = settings.palette.find(
			(entry) => entry.name === settings.defaultColor,
		);
		const off = settings.selectAction === 'none';
		const level = settings.defaultHeading;
		this.setIcon(pen, off ? 'mouse-pointer-2' : 'highlighter');
		pen.toggleClass('is-off', off);
		pen.setCssProps({ '--pdf-tools-hl': color?.color ?? 'transparent' });
		const kind = pen.querySelector('.pdf-tools-pen-kind');
		kind?.setText(level > 0 && !off ? `H${level}` : '');
		const label = color ? colorLabel(color) : '';
		const penLabel = `${label}・${headingKindLabel(level)}`;
		setTooltip(
			pen,
			off
				? t('toolbar.penNone')
				: settings.selectAction === 'popup'
					? t('toolbar.penPopup', { color: penLabel })
					: t('toolbar.penHighlight', { color: penLabel }),
		);

		const capturing = this.host.tools.capturing;
		this.setIcon(region, 'crop');
		region.toggleClass('is-active', capturing);
		setTooltip(
			region,
			capturing ? t('toolbar.regionArmed') : t('toolbar.region'),
		);
	}

	private button(
		parent: HTMLElement,
		cls: string,
		onClick: (evt: MouseEvent) => void,
	): HTMLElement {
		const el = parent.createDiv({
			cls: ['clickable-icon', 'pdf-tools-tool', cls],
		});
		el.createSpan({ cls: 'pdf-tools-tool-icon' });
		el.addEventListener('click', (evt) => {
			evt.preventDefault();
			onClick(evt);
		});
		return el;
	}

	private setIcon(button: HTMLElement, icon: string): void {
		const holder = button.querySelector<HTMLElement>(
			'.pdf-tools-tool-icon',
		);
		if (!holder || holder.dataset.icon === icon) return;
		holder.empty();
		setIcon(holder, icon);
		holder.dataset.icon = icon;
	}

	/** ペンのメニュー: 色 / 書き方（本文・見出し。変えるまで続く）/ 塗り方 */
	private openPenMenu(evt: MouseEvent): void {
		const anchor = evt.currentTarget;
		if (!(anchor instanceof HTMLElement)) return;
		const { settings } = this.plugin;
		const menu = new Menu();
		const label = (title: string) =>
			menu.addItem((item) => item.setTitle(title).setIsLabel(true));

		label(t('menu.sectionColor'));
		for (const entry of settings.palette)
			menu.addItem((item) =>
				item
					.setTitle(
						createFragment((fragment) => {
							fragment
								.createSpan({ cls: 'pdf-tools-color-swatch' })
								.setCssProps({ '--pdf-tools-hl': entry.color });
							fragment.appendText(` ${colorLabel(entry)}`);
						}),
					)
					.setChecked(entry.name === settings.defaultColor)
					.onClick(() => void this.plugin.setPenColor(entry.name)),
			);

		menu.addSeparator();
		label(t('menu.sectionKind'));
		for (let level = 0; level <= MAX_PEN_HEADING; level++)
			menu.addItem((item) =>
				item
					.setTitle(headingKindLabel(level))
					.setChecked(settings.defaultHeading === level)
					.onClick(() => void this.plugin.setPenHeading(level)),
			);

		menu.addSeparator();
		label(t('menu.sectionAction'));
		const modes: Array<[SelectAction, string]> = [
			['highlight', t('menu.selectHighlight')],
			['popup', t('menu.selectPopup')],
			['none', t('menu.selectNone')],
		];
		for (const [mode, title] of modes)
			menu.addItem((item) =>
				item
					.setTitle(title)
					.setChecked(settings.selectAction === mode)
					.onClick(() => void this.plugin.setSelectAction(mode)),
			);

		// macOS のネイティブメニューだと色の見本が出ないので、Obsidian のメニューで出す（別ウィンドウにも対応）
		menu.setUseNativeMenu(false);
		const rect = anchor.getBoundingClientRect();
		menu.showAtPosition({ x: rect.left, y: rect.bottom }, anchor.doc);
	}
}
