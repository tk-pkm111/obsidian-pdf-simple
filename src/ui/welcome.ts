import { Modal, setIcon } from 'obsidian';
import { isJapaneseUi, t } from '../i18n';
import type PdfSimplePlugin from '../main';
import { MEDIA_URL } from './media';

/** はじめての 1 回の動画（30 秒。再生ボタンを押したときだけ読み込む） */
export const FIRST_RUN_VIDEO_URL = {
	ja: `${MEDIA_URL}/first-run-ja.mp4`,
	en: `${MEDIA_URL}/first-run-en.mp4`,
} as const;
/** すべての機能の動画（約 2 分・日本語。同じ docs/media） */
export const GUIDE_VIDEO_URL = `${MEDIA_URL}/guide-ja.mp4`;
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
 * いちばん大きいボタンは「練習用の PDF で試す」（その場で練習用の PDF を開く）。「自分の PDF を取り込む」も並べる。
 * 動画は再生ボタンを押したときだけ GitHub から読み込む（押すまで通信しない）。
 */
export class WelcomeModal extends Modal {
	private video: HTMLVideoElement | null = null;

	constructor(private readonly plugin: PdfSimplePlugin) {
		super(plugin.app);
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
		const media = main.createDiv({ cls: 'pdf-simple-welcome-media' });
		const box = media.createDiv({ cls: 'pdf-simple-welcome-video' });
		this.renderPoster(box);
		// すべての機能の動画は、同じ枠で流す（ブラウザで開くと、動画ではなくファイルの保存になるため）
		const full = media.createEl('a', {
			cls: 'pdf-simple-welcome-full',
			text: t('welcome.fullVideo'),
			href: GUIDE_VIDEO_URL,
		});
		full.addEventListener('click', (evt) => {
			evt.preventDefault();
			this.play(box, GUIDE_VIDEO_URL);
		});
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
		const importButton = buttons.createEl('button', {
			text: t('welcome.import'),
		});
		importButton.addEventListener('click', () => {
			// ファイルを選ぶ画面は、押した直後に開く必要がある（待たずに呼ぶ）
			this.plugin.importer.pick();
			this.close();
		});
		const start = buttons.createEl('button', {
			cls: 'mod-cta',
			text: t('welcome.practice'),
		});
		start.addEventListener('click', () => {
			this.close();
			void this.plugin.onboarding.openPractice();
		});
		// Obsidian は最初のボタン（動画の表紙）に焦点を置くので、「練習用の PDF で試す」に移す
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
		poster.addEventListener('click', () =>
			this.play(
				box,
				isJapaneseUi()
					? FIRST_RUN_VIDEO_URL.ja
					: FIRST_RUN_VIDEO_URL.en,
			),
		);
	}

	private play(box: HTMLElement, url: string): void {
		this.video?.pause();
		box.empty();
		const video = box.createEl('video', {
			attr: { controls: '', playsinline: '', preload: 'auto' },
		});
		const source = video.createEl('source', {
			attr: { src: url, type: 'video/mp4' },
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
			href: GUIDE_PAGE_URL,
		});
	}

	onClose(): void {
		this.video?.pause();
		this.video = null;
		this.contentEl.empty();
	}
}
