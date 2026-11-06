import { Modal, setIcon } from 'obsidian';
import { t, type MessageKey } from '../i18n';
import type PdfSimplePlugin from '../main';

interface NoteItem {
	/** Lucide の記号か、記号の代わりに見せる文字（ボタンの見た目そのもの） */
	icon?: string;
	label?: string;
	title: MessageKey;
	body: MessageKey;
}

/** 版ごとの「新しくなったこと」（新しい版を足すときは、ここと i18n に足す） */
export const RELEASE_NOTES: Readonly<Record<string, readonly NoteItem[]>> = {
	'0.2.0': [
		{
			icon: 'file-input',
			title: 'whatsNew.importTitle',
			body: 'whatsNew.importBody',
		},
		{
			icon: 'graduation-cap',
			title: 'whatsNew.practiceTitle',
			body: 'whatsNew.practiceBody',
		},
		{
			label: 'PDF',
			title: 'whatsNew.chipTitle',
			body: 'whatsNew.chipBody',
		},
		{
			label: 'H',
			title: 'whatsNew.headingTitle',
			body: 'whatsNew.headingBody',
		},
		{
			icon: 'circle-play',
			title: 'whatsNew.videoTitle',
			body: 'whatsNew.videoBody',
		},
	],
};

/**
 * 「新しくなったこと」の画面。アップデートした人にだけ、上げたあとに 1 回開く（新しく入れた人には使い方の画面を開く）。
 * コマンド「新しくなったことを見る」でいつでも開ける。
 */
export class WhatsNewModal extends Modal {
	constructor(
		private readonly plugin: PdfSimplePlugin,
		private readonly versions: readonly string[],
	) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass('pdf-simple-whats-new');
		this.setTitle(t('whatsNew.title'));
		const { contentEl } = this;
		const newest = this.versions[0] ?? this.plugin.manifest.version;
		contentEl.createEl('p', {
			cls: 'pdf-simple-welcome-lead',
			text: t('whatsNew.lead', { version: newest }),
		});
		const list = contentEl.createDiv({ cls: 'pdf-simple-welcome-steps' });
		for (const version of this.versions)
			for (const item of RELEASE_NOTES[version] ?? []) {
				const card = list.createDiv({ cls: 'pdf-simple-welcome-step' });
				const mark = card.createDiv({
					cls: 'pdf-simple-welcome-step-icon',
				});
				if (item.icon) setIcon(mark, item.icon);
				else {
					mark.addClass('mod-label');
					mark.setText(item.label ?? '');
				}
				const text = card.createDiv({
					cls: 'pdf-simple-welcome-step-text',
				});
				text.createDiv({
					cls: 'pdf-simple-welcome-step-title',
					text: t(item.title),
				});
				text.createDiv({
					cls: 'pdf-simple-welcome-step-body',
					text: t(item.body),
				});
			}
		const footer = contentEl.createDiv({
			cls: 'pdf-simple-welcome-footer',
		});
		footer.createDiv({
			cls: 'pdf-simple-welcome-hint',
			text: t('whatsNew.hint'),
		});
		const buttons = footer.createDiv({ cls: 'pdf-simple-welcome-buttons' });
		buttons
			.createEl('button', { text: t('whatsNew.close') })
			.addEventListener('click', () => this.close());
		const practice = buttons.createEl('button', {
			cls: 'mod-cta',
			text: t('welcome.practice'),
		});
		practice.addEventListener('click', () => {
			this.close();
			void this.plugin.onboarding.openPractice();
		});
		window.setTimeout(() => practice.focus({ preventScroll: true }), 0);
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
