import { Modal, setIcon, type App } from 'obsidian';
import { t } from '../i18n';

/** 使い方の動画（GitHub に置いたもの。再生ボタンを押したときだけ読み込む） */
export const GUIDE_VIDEO_URL =
	'https://github.com/user-attachments/assets/5667a2b6-7cd8-47cd-9c57-350b813780ce';
/** 詳しい使い方（README） */
export const GUIDE_PAGE_URL =
	'https://github.com/tk-pkm111/obsidian-pdf-simple#readme';

const STEPS = [
	{
		icon: 'highlighter',
		title: 'welcome.step1Title',
		body: 'welcome.step1Body',
	},
	{
		icon: 'pen-line',
		title: 'welcome.step2Title',
		body: 'welcome.step2Body',
	},
	{
		icon: 'repeat-2',
		title: 'welcome.step3Title',
		body: 'welcome.step3Body',
	},
	{
		icon: 'folder-input',
		title: 'welcome.step4Title',
		body: 'welcome.step4Body',
	},
] as const;

/**
 * 使い方の画面（はじめて読み込んだときに 1 回だけ開く。コマンド「使い方を見る」でいつでも開ける）。
 * 動画は再生ボタンを押したときだけ GitHub から読み込む（押すまで通信しない）。
 */
export class WelcomeModal extends Modal {
	private video: HTMLVideoElement | null = null;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass('pdf-simple-welcome');
		this.setTitle(t('welcome.title'));
		const { contentEl } = this;
		contentEl.createEl('p', {
			cls: 'pdf-simple-welcome-lead',
			text: t('welcome.lead'),
		});
		// 広い画面では左に動画、右にできることの一覧（狭い画面では縦に並ぶ）
		const main = contentEl.createDiv({ cls: 'pdf-simple-welcome-main' });
		this.renderPoster(main.createDiv({ cls: 'pdf-simple-welcome-video' }));
		const steps = main.createDiv({ cls: 'pdf-simple-welcome-steps' });
		for (const step of STEPS) {
			const card = steps.createDiv({ cls: 'pdf-simple-welcome-step' });
			setIcon(
				card.createDiv({ cls: 'pdf-simple-welcome-step-icon' }),
				step.icon,
			);
			const text = card.createDiv({
				cls: 'pdf-simple-welcome-step-text',
			});
			text.createDiv({
				cls: 'pdf-simple-welcome-step-title',
				text: t(step.title),
			});
			text.createDiv({
				cls: 'pdf-simple-welcome-step-body',
				text: t(step.body),
			});
		}
		const footer = contentEl.createDiv({
			cls: 'pdf-simple-welcome-footer',
		});
		footer.createDiv({
			cls: 'pdf-simple-welcome-hint',
			text: t('welcome.hint'),
		});
		const buttons = footer.createDiv({ cls: 'pdf-simple-welcome-buttons' });
		buttons.createEl('a', {
			cls: 'pdf-simple-welcome-link',
			text: t('welcome.more'),
			href: GUIDE_PAGE_URL,
		});
		const start = buttons.createEl('button', {
			cls: 'mod-cta',
			text: t('welcome.start'),
		});
		start.addEventListener('click', () => this.close());
		// Obsidian は最初のボタン（動画の表紙）に焦点を置くので、「はじめる」に移す
		// （開いた直後に Enter を押しても動画は始まらない。題名が隠れないよう、スクロールもしない）
		window.setTimeout(() => {
			start.focus({ preventScroll: true });
			this.modalEl.scrollTop = 0;
		}, 0);
	}

	/** 動画の表紙（通信しない）。押すと動画を読み込んで再生する */
	private renderPoster(box: HTMLElement): void {
		const poster = box.createEl('button', {
			cls: 'pdf-simple-welcome-poster',
			attr: { 'aria-label': t('welcome.play') },
		});
		const logo = poster.createDiv({ cls: 'pdf-simple-welcome-logo' });
		logo.createSpan({ text: 'PDF' });
		logo.createSpan({ cls: 'pdf-simple-welcome-mark', text: 'Simple' });
		poster.createDiv({
			cls: 'pdf-simple-welcome-sub',
			text: t('welcome.videoTitle'),
		});
		setIcon(poster.createDiv({ cls: 'pdf-simple-welcome-play' }), 'play');
		poster.createDiv({
			cls: 'pdf-simple-welcome-note',
			text: t('welcome.videoNote'),
		});
		poster.addEventListener('click', () => this.play(box));
	}

	private play(box: HTMLElement): void {
		box.empty();
		const video = box.createEl('video', {
			attr: { controls: '', playsinline: '', preload: 'auto' },
		});
		const source = video.createEl('source', {
			attr: { src: GUIDE_VIDEO_URL, type: 'video/mp4' },
		});
		const fail = () => this.showError(box);
		// 読み込めなかったとき（オフラインなど）は <source> に error が来る
		source.addEventListener('error', fail);
		video.addEventListener('error', fail);
		this.video = video;
		void video.play().catch(() => undefined);
	}

	private showError(box: HTMLElement): void {
		this.video = null;
		box.empty();
		const message = box.createDiv({ cls: 'pdf-simple-welcome-error' });
		setIcon(
			message.createDiv({ cls: 'pdf-simple-welcome-error-icon' }),
			'wifi-off',
		);
		message.createDiv({ text: t('welcome.videoError') });
		message.createEl('a', {
			text: t('welcome.openInBrowser'),
			href: GUIDE_VIDEO_URL,
		});
	}

	onClose(): void {
		this.video?.pause();
		this.video = null;
		this.contentEl.empty();
	}
}
