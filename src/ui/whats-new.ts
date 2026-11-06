import { Modal, setIcon } from 'obsidian';
import { isJapaneseUi, t, type MessageKey } from '../i18n';
import type PdfSimplePlugin from '../main';
import { MEDIA_URL } from './media';

/** 1 枚: その機能を使っている短い動画（くり返し）と、左上のラベル・下の一言 */
interface Slide {
	/** docs/media/whats-new/<版>-<video>-<ja|en>.mp4 */
	video: string;
	/** 動画を読み込めないときに見せる記号 */
	icon: string;
	label: MessageKey;
	body: MessageKey;
}

/** 版ごとの「新しくなったこと」（新しい版を足すときは、ここと i18n と docs/media/whats-new に足す） */
export const RELEASE_NOTES: Readonly<Record<string, readonly Slide[]>> = {
	'0.2.0': [
		{
			video: 'import',
			icon: 'file-input',
			label: 'whatsNew.importLabel',
			body: 'whatsNew.importBody',
		},
		{
			video: 'practice',
			icon: 'graduation-cap',
			label: 'whatsNew.practiceLabel',
			body: 'whatsNew.practiceBody',
		},
		{
			video: 'pdf-button',
			icon: 'file-text',
			label: 'whatsNew.chipLabel',
			body: 'whatsNew.chipBody',
		},
		{
			video: 'heading',
			icon: 'heading',
			label: 'whatsNew.headingLabel',
			body: 'whatsNew.headingBody',
		},
	],
};

interface Shown extends Slide {
	version: string;
}

/**
 * 「新しくなったこと」の画面。アップデートした人にだけ、上げたあとに 1 回開く（新しく入れた人には使い方の画面を開く）。
 * 1 枚ずつめくる。動画は開いた枚のぶんだけ GitHub から読み込む（読み込めなければ記号とラベルだけ）。
 * コマンド「新しくなったことを見る」でいつでも開ける。
 */
export class WhatsNewModal extends Modal {
	private readonly slides: Shown[];
	private index = 0;
	private frame: HTMLElement | null = null;
	private body: HTMLElement | null = null;
	private dots: HTMLElement[] = [];
	private next: HTMLButtonElement | null = null;
	private video: HTMLVideoElement | null = null;

	constructor(plugin: PdfSimplePlugin, versions: readonly string[]) {
		super(plugin.app);
		this.slides = versions.flatMap((version) =>
			(RELEASE_NOTES[version] ?? []).map((slide) => ({
				...slide,
				version,
			})),
		);
	}

	onOpen(): void {
		this.modalEl.addClass('pdf-simple-whats-new');
		this.setTitle(t('whatsNew.title'));
		const { contentEl } = this;
		this.frame = contentEl.createDiv({ cls: 'pdf-simple-whats-new-frame' });
		this.body = contentEl.createEl('p', {
			cls: 'pdf-simple-whats-new-body',
		});
		const footer = contentEl.createDiv({
			cls: 'pdf-simple-whats-new-footer',
		});
		const dots = footer.createDiv({ cls: 'pdf-simple-whats-new-dots' });
		this.dots = this.slides.map((_, i) => {
			const dot = dots.createEl('button', {
				cls: 'pdf-simple-whats-new-dot',
				attr: {
					type: 'button',
					'aria-label': t('whatsNew.goTo', { n: i + 1 }),
				},
			});
			dot.addEventListener('click', () => this.show(i));
			return dot;
		});
		const buttons = footer.createDiv({ cls: 'pdf-simple-welcome-buttons' });
		buttons
			.createEl('button', { text: t('whatsNew.later') })
			.addEventListener('click', () => this.close());
		this.next = buttons.createEl('button', { cls: 'mod-cta' });
		this.next.addEventListener('click', () => {
			if (this.index < this.slides.length - 1) this.show(this.index + 1);
			else this.close();
		});
		this.scope.register([], 'ArrowRight', () => {
			if (this.index < this.slides.length - 1) this.show(this.index + 1);
			return false;
		});
		this.scope.register([], 'ArrowLeft', () => {
			if (this.index > 0) this.show(this.index - 1);
			return false;
		});
		this.show(0);
		window.setTimeout(() => this.next?.focus({ preventScroll: true }), 0);
	}

	private show(index: number): void {
		const slide = this.slides[index];
		const frame = this.frame;
		if (!slide || !frame) return;
		this.index = index;
		this.video?.pause();
		this.video = null;
		frame.empty();
		frame.removeClass('is-offline');
		const video = frame.createEl('video', {
			attr: {
				autoplay: '',
				muted: '',
				loop: '',
				playsinline: '',
				preload: 'auto',
			},
		});
		// 属性だけでは音を消した扱いにならないことがあるので、プロパティでも消す（自動再生の条件）
		video.muted = true;
		const source = video.createEl('source', {
			attr: { src: this.urlOf(slide), type: 'video/mp4' },
		});
		// めくったあとに前の枚の読み込みが失敗しても、今の枚を消さない
		const offline = () => {
			if (this.video === video) this.showOffline(slide);
		};
		source.addEventListener('error', offline);
		video.addEventListener('error', offline);
		void video.play().catch(() => undefined);
		this.video = video;
		frame.createDiv({
			cls: 'pdf-simple-whats-new-label',
			text: t(slide.label),
		});
		frame.createDiv({
			cls: 'pdf-simple-whats-new-count',
			text: t('whatsNew.counter', {
				n: index + 1,
				total: this.slides.length,
			}),
		});
		this.body?.setText(t(slide.body));
		this.dots.forEach((dot, i) =>
			dot.toggleClass('is-active', i === index),
		);
		this.next?.setText(
			index < this.slides.length - 1
				? t('whatsNew.next')
				: t('whatsNew.done'),
		);
	}

	/** 動画を読み込めないとき（オフラインなど）は、記号とラベルだけ */
	private showOffline(slide: Shown): void {
		const frame = this.frame;
		if (!frame) return;
		this.video = null;
		frame.empty();
		frame.addClass('is-offline');
		const center = frame.createDiv({ cls: 'pdf-simple-whats-new-offline' });
		setIcon(
			center.createDiv({ cls: 'pdf-simple-whats-new-offline-icon' }),
			slide.icon,
		);
		center.createDiv({ text: t(slide.label) });
	}

	private urlOf(slide: Shown): string {
		const lang = isJapaneseUi() ? 'ja' : 'en';
		return `${MEDIA_URL}/whats-new/${slide.version}-${slide.video}-${lang}.mp4`;
	}

	onClose(): void {
		this.video?.pause();
		this.video = null;
		this.contentEl.empty();
	}
}
