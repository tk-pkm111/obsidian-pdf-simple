import { setIcon } from 'obsidian';
import { t, type MessageKey } from '../i18n';
import type { SelectAction } from '../lib/settings';

/** ガイドの段: ① なぞる → ② ノートの ● で PDF に戻る → ③ 自分の PDF */
export type GuideStep = 'select' | 'back' | 'done';

export interface GuideState {
	step: GuideStep;
	/** 練習用の PDF でやっている */
	practice: boolean;
	/** その PDF にもうノートがある（無ければ、最初の 1 回は色のボタンが出て、そこでノートができる） */
	paired: boolean;
	phone: boolean;
	selectAction: SelectAction;
}

export interface GuideHandlers {
	/** × （もう出さない） */
	close(): void;
	/** ③ の「あとで」「閉じる」 */
	later(): void;
	/** ③ の「PDF を選ぶ」（押した直後にファイルを選ぶ画面を開く） */
	importPdf(): void;
	/** ③ の「練習の PDF とノートを片付ける」 */
	cleanup(): void;
}

const STEPS: readonly { step: GuideStep; label: MessageKey }[] = [
	{ step: 'select', label: 'guide.stepSelect' },
	{ step: 'back', label: 'guide.stepBack' },
	{ step: 'done', label: 'guide.stepOwn' },
];

/**
 * 右下の小さなガイド（スマホは上に細く）。PDF にいてもノートにいても、次にやることを同じ場所に出す。
 * 中身は GuideState だけで決まる（同じ状態なら描き直さない）。
 */
export class GuideCard {
	private el: HTMLElement | null = null;
	private key = '';

	constructor(private readonly handlers: GuideHandlers) {}

	/** top: スマホで出す高さ（画面の上からの px。ビューのヘッダーの下） */
	show(state: GuideState, top: number | null = null): void {
		const key = JSON.stringify(state);
		if (!this.el?.isConnected || key !== this.key) {
			this.el?.remove();
			this.key = key;
			this.el = this.render(state);
			activeDocument.body.appendChild(this.el);
		}
		if (top !== null)
			this.el.setCssProps({
				'--pdf-simple-guide-top': `${Math.round(top)}px`,
			});
	}

	hide(): void {
		this.el?.remove();
		this.el = null;
		this.key = '';
	}

	private render(state: GuideState): HTMLElement {
		const card = createDiv({
			cls: 'pdf-simple-guide',
			attr: { role: 'status', 'aria-live': 'polite' },
		});
		if (state.phone) card.addClass('is-phone');
		const index = STEPS.findIndex((s) => s.step === state.step);

		const head = card.createDiv({ cls: 'pdf-simple-guide-head' });
		head.createSpan({
			cls: 'pdf-simple-guide-name',
			text: t('guide.title'),
		});
		head.createSpan({
			cls: 'pdf-simple-guide-count',
			text: t('guide.counter', { n: index + 1, total: STEPS.length }),
		});
		const close = head.createEl('button', {
			cls: ['clickable-icon', 'pdf-simple-guide-close'],
			attr: { type: 'button', 'aria-label': t('guide.close') },
		});
		setIcon(close, 'x');
		close.addEventListener('click', () => this.handlers.close());

		const steps = card.createDiv({ cls: 'pdf-simple-guide-steps' });
		STEPS.forEach((step, i) => {
			const el = steps.createDiv({
				cls: 'pdf-simple-guide-step',
				text: t(step.label),
			});
			if (i < index) el.addClass('is-done');
			if (i === index) el.addClass('is-active');
		});

		const { title, body } = this.text(state);
		card.createDiv({ cls: 'pdf-simple-guide-title', text: title });
		card.createDiv({ cls: 'pdf-simple-guide-body', text: body });

		if (state.step === 'done') {
			const buttons = card.createDiv({ cls: 'pdf-simple-guide-buttons' });
			buttons
				.createEl('button', {
					text: t(state.practice ? 'guide.later' : 'guide.closeOwn'),
				})
				.addEventListener('click', () => this.handlers.later());
			buttons
				.createEl('button', { cls: 'mod-cta', text: t('guide.import') })
				.addEventListener('click', () => this.handlers.importPdf());
			if (state.practice)
				card.createEl('button', {
					cls: 'pdf-simple-guide-cleanup',
					text: t('guide.cleanup'),
					attr: { type: 'button' },
				}).addEventListener('click', () => this.handlers.cleanup());
		}
		return card;
	}

	private text(state: GuideState): { title: string; body: string } {
		switch (state.step) {
			case 'select': {
				// ノートがまだ無い PDF では、塗り方の設定によらず最初の 1 回は色のボタンが出る（押すとノートができる）。
				// スマホの選択は、いつも下の色のボタンで塗る
				const color =
					state.phone ||
					(state.selectAction !== 'none' &&
						(!state.paired || state.selectAction === 'popup'));
				const title = state.phone
					? state.practice
						? t('guide.selectPracticePhone')
						: t('guide.selectOwnPhone')
					: color
						? state.practice
							? t('guide.selectPracticeColor')
							: t('guide.selectOwnColor')
						: state.practice
							? t('guide.selectPractice')
							: t('guide.selectOwn');
				const body =
					state.selectAction === 'none' && !state.phone
						? t('guide.selectNone')
						: !state.paired
							? state.phone
								? t('guide.selectFirstPhone')
								: state.selectAction === 'highlight'
									? t('guide.selectFirst')
									: t('guide.selectFirstPhone')
							: color
								? t('guide.selectPopup')
								: t('guide.selectHighlight');
				return { title, body };
			}
			case 'back':
				return {
					title: t('guide.backTitle'),
					body: t('guide.backBody'),
				};
			case 'done':
				return state.practice
					? { title: t('guide.doneTitle'), body: t('guide.doneBody') }
					: {
							title: t('guide.doneTitleOwn'),
							body: t('guide.doneBodyOwn'),
						};
		}
	}
}
