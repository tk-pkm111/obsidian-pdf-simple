import { Modal, Platform, setIcon } from 'obsidian';
import { isJapaneseUi, t, type MessageKey } from '../i18n';
import { chapterAt, chapterSpans, type Chapter } from '../lib/chapters';
import type PdfSimplePlugin from '../main';
import { MEDIA_URL } from './media';

/** 使い方の動画（約 3 分・1 本。日本語と英語） */
export const TOUR_VIDEO_URL = {
	ja: `${MEDIA_URL}/tour-ja.mp4`,
	en: `${MEDIA_URL}/tour-en.mp4`,
} as const;
/** 詳しい使い方（README） */
export const GUIDE_PAGE_URL =
	'https://github.com/tk-pkm111/obsidian-pdf-simple#readme';

/** 動画の章の始まり（秒）。動画を録り直したら合わせる（promo/record-tour.mjs compose が出す tour-<lang>-chapters.json の値） */
const chapters = (
	select: number,
	flip: number,
	organize: number,
	settings: number,
): readonly Chapter<MessageKey>[] => [
	{ at: 0, label: 'welcome.chapterStart' },
	{ at: select, label: 'welcome.chapterSelect' },
	{ at: flip, label: 'welcome.chapterFlip' },
	{ at: organize, label: 'welcome.chapterOrganize' },
	{ at: settings, label: 'welcome.chapterSettings' },
];
export const TOUR_CHAPTERS = {
	ja: chapters(34, 64, 87, 153),
	en: chapters(34, 63, 86, 150),
} as const;

/**
 * 使い方の画面（入れた直後に 1 回だけ開く。コマンド「使い方を見る」と PDF のペンのメニューからも開ける）。
 * 置くのは、一言の見出し・動画 1 本（章の目盛りで飛べる）・「やってみる」だけ。説明は動画と GitHub が受け持つ。
 * パソコンでは開くと音なしで流れ始める（そのとき GitHub から動画を読み込む）。スマホは押してから読み込む。
 */
export class WelcomeModal extends Modal {
	private frame: HTMLElement | null = null;
	private video: HTMLVideoElement | null = null;
	private sound: HTMLButtonElement | null = null;
	private chapters: HTMLElement[] = [];
	private readonly tour = isJapaneseUi()
		? TOUR_CHAPTERS.ja
		: TOUR_CHAPTERS.en;

	constructor(private readonly plugin: PdfSimplePlugin) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('pdf-simple-welcome');
		this.titleEl.empty();
		this.titleEl.createDiv({
			cls: 'pdf-simple-welcome-brand',
			text: t('welcome.brand'),
		});
		this.titleEl.createDiv({
			cls: 'pdf-simple-welcome-headline',
			text: t('welcome.headline'),
		});

		const { contentEl } = this;
		const frame = contentEl.createDiv({ cls: 'pdf-simple-welcome-video' });
		this.frame = frame;
		this.renderScene(frame);
		const play = frame.createEl('button', {
			cls: 'pdf-simple-welcome-play',
			attr: { type: 'button', 'aria-label': t('welcome.play') },
		});
		setIcon(play, 'play');
		play.addEventListener('click', () => this.togglePlay());
		this.sound = frame.createEl('button', {
			cls: 'pdf-simple-welcome-sound',
			attr: { type: 'button' },
		});
		this.sound.addEventListener('click', () => this.toggleSound());
		const error = frame.createDiv({ cls: 'pdf-simple-welcome-error' });
		setIcon(error.createDiv(), 'wifi-off');
		error.createDiv({ text: t('welcome.videoError') });

		const bar = contentEl.createDiv({ cls: 'pdf-simple-welcome-chapters' });
		this.chapters = this.tour.map((chapter) => {
			const name = t(chapter.label);
			const button = bar.createEl('button', {
				cls: 'pdf-simple-welcome-chapter',
				attr: {
					type: 'button',
					'aria-label': t('welcome.goTo', { name }),
				},
			});
			button
				.createDiv({ cls: 'pdf-simple-welcome-chapter-track' })
				.createDiv({ cls: 'pdf-simple-welcome-chapter-fill' });
			button.createDiv({
				cls: 'pdf-simple-welcome-chapter-label',
				text: name,
			});
			button.addEventListener('click', () => this.seek(chapter.at));
			return button;
		});
		this.updateChapters(0, Number.NaN);

		const footer = contentEl.createDiv({
			cls: 'pdf-simple-welcome-footer',
		});
		footer.createEl('a', {
			cls: 'pdf-simple-welcome-more',
			text: t('welcome.more'),
			href: GUIDE_PAGE_URL,
		});
		const actions = footer.createDiv({ cls: 'pdf-simple-welcome-actions' });
		const buttons = actions.createDiv({
			cls: 'pdf-simple-welcome-buttons',
		});
		buttons
			.createEl('button', { text: t('welcome.later') })
			.addEventListener('click', () => this.close());
		const start = buttons.createEl('button', {
			cls: 'mod-cta',
			text: t('welcome.try'),
		});
		start.addEventListener('click', () => {
			this.close();
			void this.plugin.onboarding.begin();
		});
		actions.createDiv({
			cls: 'pdf-simple-welcome-try-note',
			text: t('welcome.tryNote'),
		});

		// パソコンは音なしで流し始める（自動再生は音なしでないと止められる）。スマホは押してから
		if (!Platform.isMobile) this.load(true, 0);
		this.updateSound();
		// 開いた直後に Enter を押すと「やってみる」（題名が隠れないよう、スクロールもしない）
		window.setTimeout(() => {
			start.focus({ preventScroll: true });
			this.modalEl.scrollTop = 0;
		}, 0);
	}

	onClose(): void {
		this.video?.pause();
		this.video = null;
		this.contentEl.empty();
	}

	/** 動画を読み込む前と、読み込めなかったときに見せる絵（このプラグインの中で描く。通信しない） */
	private renderScene(frame: HTMLElement): void {
		const scene = frame.createDiv({ cls: 'pdf-simple-welcome-scene' });
		const page = scene.createDiv({ cls: 'pdf-simple-welcome-scene-page' });
		for (const kind of ['', 'is-short', 'is-hl', 'is-hl is-short', '', ''])
			page.createDiv({
				cls: [
					'pdf-simple-welcome-scene-line',
					...kind.split(' '),
				].filter((c) => c !== ''),
			});
		const note = scene.createDiv({ cls: 'pdf-simple-welcome-scene-note' });
		for (const kind of ['is-title', '', 'is-short', 'is-new'])
			note.createDiv({
				cls: ['pdf-simple-welcome-scene-line', kind].filter(
					(c) => c !== '',
				),
			});
	}

	/** 動画を読み込んで、at 秒から流す */
	private load(muted: boolean, at: number): void {
		const frame = this.frame;
		if (!frame) return;
		frame.removeClass('is-error');
		const video = createEl('video', {
			cls: 'pdf-simple-welcome-player',
			attr: { playsinline: '', preload: 'auto' },
		});
		// 属性だけでは音を消した扱いにならないことがあるので、プロパティでも消す（自動再生の条件）
		video.muted = muted;
		if (muted) video.setAttr('muted', '');
		const source = video.createEl('source', {
			attr: {
				src: isJapaneseUi() ? TOUR_VIDEO_URL.ja : TOUR_VIDEO_URL.en,
				type: 'video/mp4',
			},
		});
		const fail = () => {
			if (this.video !== video) return;
			frame.addClass('is-error');
			frame.removeClass('is-playing');
		};
		source.addEventListener('error', fail);
		video.addEventListener('error', fail);
		video.addEventListener('loadedmetadata', () => {
			if (at > 0) video.currentTime = at;
			this.updateChapters(video.currentTime, video.duration);
		});
		video.addEventListener('loadeddata', () => frame.addClass('is-ready'));
		video.addEventListener('timeupdate', () =>
			this.updateChapters(video.currentTime, video.duration),
		);
		const state = () => {
			frame.toggleClass('is-playing', !video.paused);
			this.updateSound();
		};
		video.addEventListener('play', state);
		video.addEventListener('pause', state);
		video.addEventListener('volumechange', state);
		video.addEventListener('click', () => this.togglePlay());
		// 絵と再生ボタンの下に入れる（読み込むまでは絵が見える）
		frame.prepend(video);
		this.video = video;
		void video.play().catch(() => state());
	}

	private togglePlay(): void {
		const video = this.video;
		if (!video) {
			this.load(false, 0);
			return;
		}
		if (video.paused) void video.play().catch(() => undefined);
		else video.pause();
	}

	private toggleSound(): void {
		const video = this.video;
		if (!video) {
			this.load(false, 0);
			return;
		}
		video.muted = !video.muted;
		if (video.paused) void video.play().catch(() => undefined);
		this.updateSound();
	}

	private seek(at: number): void {
		const video = this.video;
		if (!video) {
			this.load(!Platform.isMobile, at);
			return;
		}
		if (video.readyState >= 1) video.currentTime = at;
		void video.play().catch(() => undefined);
		this.updateChapters(at, video.duration);
	}

	private updateSound(): void {
		const sound = this.sound;
		if (!sound) return;
		const muted = this.video?.muted ?? true;
		sound.empty();
		setIcon(
			sound.createSpan({ cls: 'pdf-simple-welcome-sound-icon' }),
			muted ? 'volume-x' : 'volume-2',
		);
		sound.createSpan({
			text: muted ? t('welcome.unmute') : t('welcome.mute'),
		});
	}

	/** 章の目盛り: 長さに合わせた幅と、どこまで見たか */
	private updateChapters(time: number, duration: number): void {
		const spans = chapterSpans(this.tour, time, duration);
		const current = chapterAt(this.tour, time);
		this.chapters.forEach((el, i) => {
			const span = spans[i];
			if (!span) return;
			el.setCssProps({
				'--pdf-simple-chapter-grow': String(span.length),
				'--pdf-simple-chapter-done': `${Math.round(span.done * 1000) / 10}%`,
			});
			el.toggleClass('is-current', i === current);
		});
	}
}
