import { Component, setIcon, setTooltip, type FileView } from 'obsidian';
import { t } from '../i18n';
import type PdfSimplePlugin from '../main';
import { pageFrame } from './dom';

/**
 * ノートの無い PDF の上に出す 1 行の案内（はじめての人向け）。出すかどうかは Onboarding が決める。
 * その PDF に 1 回ハイライトしてノートができれば消える。× で閉じると、ほかの PDF にも出さない（練習用の PDF を除く）。
 */
export class HintBanner extends Component {
	private el: HTMLElement | null = null;
	/** このビューで × を押した PDF（同じビューでは出し直さない） */
	private closedFor: string | null = null;

	constructor(
		private readonly plugin: PdfSimplePlugin,
		private readonly view: FileView,
	) {
		super();
	}

	onload(): void {
		this.register(this.plugin.highlights.onChange(() => this.update()));
		this.update();
	}

	onunload(): void {
		this.el?.remove();
		this.el = null;
	}

	/** 出すべきなら出し、そうでなければ外す（何度呼んでもよい） */
	update(): void {
		const file = this.view.file;
		const show =
			file !== null &&
			this.closedFor !== file.path &&
			this.plugin.onboarding.shouldShowHint(file);
		if (!show) {
			this.el?.remove();
			this.el = null;
			return;
		}
		if (this.el?.isConnected) return;
		const frame = pageFrame(this.view.contentEl);
		if (!frame) return;
		this.el?.remove();
		this.el = this.render(file.path);
		frame.before(this.el);
	}

	private render(path: string): HTMLElement {
		const banner = createDiv({ cls: 'pdf-simple-hint' });
		setIcon(
			banner.createDiv({ cls: 'pdf-simple-hint-icon' }),
			'highlighter',
		);
		const text = banner.createDiv({ cls: 'pdf-simple-hint-text' });
		text.createEl('strong', { text: t('hint.title') });
		text.appendText(' ');
		text.createSpan({ text: t('hint.body') });
		const close = banner.createEl('button', {
			cls: ['clickable-icon', 'pdf-simple-hint-close'],
			attr: { type: 'button', 'aria-label': t('hint.close') },
		});
		setIcon(close, 'x');
		setTooltip(close, t('hint.close'));
		close.addEventListener('click', () => {
			this.closedFor = path;
			this.el?.remove();
			this.el = null;
			void this.plugin.onboarding.dismissHint();
		});
		return banner;
	}
}
