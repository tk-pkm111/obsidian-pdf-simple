import { Platform, setIcon, setTooltip, type FileView } from 'obsidian';
import { t } from '../i18n';
import { MAX_PEN_HEADING } from '../lib/settings';
import type PdfSimplePlugin from '../main';
import { colorLabel } from '../ui/labels';
import type { SelectionResult } from './text-range';

const MARGIN = 8;

export interface PopupTarget {
	view: FileView;
	result: SelectionResult;
}

/** 押されたもの: 色（書き方はペンのまま）か、書き方（色はペンのまま。0 は本文） */
export type PopupChoice = { color: string } | { level: number };

/** 押したときに選択が外れないように */
function keepSelection(button: HTMLElement): void {
	button.addEventListener('pointerdown', (evt) => evt.preventDefault());
	button.addEventListener('mousedown', (evt) => evt.preventDefault());
}

/**
 * 色のボタンの吹き出し（スマホでは画面の下のバー）。見た目だけを受け持ち、押されたものを onChoose に渡す。
 * 色の後ろに「見出し」のボタンがあり、マウスを乗せる（スマホは押す）と、上に見出し 1〜3 が出る。
 * 選択はボタンを押す前に覚えておく（押した瞬間に選択が外れても作れるように）。
 */
export class SelectionPopup {
	private el: HTMLElement | null = null;
	private target: PopupTarget | null = null;

	constructor(private readonly plugin: PdfSimplePlugin) {}

	get shown(): PopupTarget | null {
		return this.target;
	}

	contains(node: Node | null): boolean {
		return node !== null && this.el?.contains(node) === true;
	}

	show(target: PopupTarget, onChoose: (choice: PopupChoice) => void): void {
		this.hide();
		this.target = target;
		const doc = target.view.contentEl.doc;
		const popup = doc.body.createDiv({
			cls: [
				'pdf-simple-selection-popup',
				Platform.isMobile ? 'mod-bar' : 'mod-float',
			],
		});
		for (const entry of this.plugin.settings.palette) {
			const label = t('tooltip.highlightWith', {
				color: colorLabel(entry),
			});
			const button = popup.createEl('button', {
				cls: 'pdf-simple-color-dot',
				attr: { 'aria-label': label, type: 'button' },
			});
			button.setCssProps({ '--pdf-simple-hl': entry.color });
			setTooltip(button, label);
			keepSelection(button);
			button.addEventListener('click', () => {
				this.hide();
				onChoose({ color: entry.name });
			});
		}
		this.addHeadingChoice(popup, onChoose);
		this.el = popup;
		this.reposition();
	}

	/** 「見出し」のボタンと、その上に出す見出し 1〜3（ペンが見出しなら「本文」も） */
	private addHeadingChoice(
		popup: HTMLElement,
		onChoose: (choice: PopupChoice) => void,
	): void {
		const choice = popup.createDiv({ cls: 'pdf-simple-heading-choice' });
		const toggle = choice.createEl('button', {
			cls: 'pdf-simple-heading-button',
			attr: { 'aria-label': t('popup.heading'), type: 'button' },
		});
		setIcon(toggle, 'heading');
		setTooltip(toggle, t('popup.heading'));
		keepSelection(toggle);
		// スマホ（マウスを乗せられない）では押して開く
		toggle.addEventListener('click', () =>
			choice.toggleClass('is-open', !choice.hasClass('is-open')),
		);
		const menu = choice
			.createDiv({ cls: 'pdf-simple-heading-menu' })
			.createDiv({ cls: 'pdf-simple-heading-menu-inner' });
		const levels: number[] = [];
		for (let level = 1; level <= MAX_PEN_HEADING; level++)
			levels.push(level);
		if (this.plugin.settings.defaultHeading > 0) levels.push(0);
		for (const level of levels) {
			const button = menu.createEl('button', {
				cls: 'pdf-simple-heading-level',
				text: level === 0 ? t('menu.kindText') : `H${level}`,
				attr: { type: 'button' },
			});
			setTooltip(
				button,
				level === 0
					? t('popup.asText')
					: t('popup.asHeading', { level }),
			);
			keepSelection(button);
			button.addEventListener('click', () => {
				this.hide();
				onChoose({ level });
			});
		}
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
		this.target = null;
	}

	reposition(): void {
		const popup = this.el;
		const target = this.target;
		if (!popup || !target) return;
		const { contentEl } = target.view;
		const win = contentEl.win;
		const width = popup.offsetWidth;
		const height = popup.offsetHeight;
		let left: number;
		let top: number;
		if (Platform.isMobile) {
			const box = contentEl.getBoundingClientRect();
			// 画面の下に浮いているナビゲーションバー（Obsidian 1.14 のスマホ表示）の上に出す
			let bottom = box.bottom;
			const navbar =
				contentEl.doc.querySelector<HTMLElement>('.mobile-navbar');
			if (navbar?.isShown())
				bottom = Math.min(bottom, navbar.getBoundingClientRect().top);
			left = box.left + (box.width - width) / 2;
			top = bottom - height - 12;
		} else {
			const selection = contentEl.doc.getSelection();
			if (
				!selection ||
				selection.rangeCount === 0 ||
				selection.isCollapsed
			) {
				this.hide();
				return;
			}
			const rects = Array.from(
				selection.getRangeAt(0).getClientRects(),
			).filter((rect) => rect.width > 0 && rect.height > 0);
			const last = rects[rects.length - 1];
			const first = rects[0];
			if (!first || !last) {
				this.hide();
				return;
			}
			const box = contentEl.getBoundingClientRect();
			if (last.bottom < box.top || first.top > box.bottom) {
				popup.addClass('is-hidden');
				return;
			}
			popup.removeClass('is-hidden');
			left = last.right - width / 2;
			top = last.bottom + MARGIN;
			if (top + height > win.innerHeight - MARGIN)
				top = first.top - height - MARGIN;
		}
		left = Math.max(
			MARGIN,
			Math.min(left, win.innerWidth - width - MARGIN),
		);
		top = Math.max(
			MARGIN,
			Math.min(top, win.innerHeight - height - MARGIN),
		);
		popup.setCssProps({
			'--pdf-simple-popup-left': `${Math.round(left)}px`,
			'--pdf-simple-popup-top': `${Math.round(top)}px`,
		});
	}
}
