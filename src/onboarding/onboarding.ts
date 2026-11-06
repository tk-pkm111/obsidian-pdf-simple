import {
	Component,
	Notice,
	Platform,
	normalizePath,
	type FileView,
	type TFile,
} from 'obsidian';
import { isJapaneseUi, t } from '../i18n';
import { folderChain } from '../lib/file-paths';
import { layoutPractice, practiceContent } from '../lib/practice-content';
import { buildPdf } from '../lib/practice-pdf';
import type PdfSimplePlugin from '../main';
import { revealBlock, revealBlockBeside } from '../note/navigate';

/** 練習用の PDF のファイル名（どちらの言語で作ったものも練習用として扱う） */
const PRACTICE_NAMES = new Set([
	practiceContent(true).fileName,
	practiceContent(false).fileName,
]);

/**
 * はじめての人の案内: 練習用の PDF、PDF の上の 1 行（HintBanner が出す）、最初のハイライトのあとにノートを見せる。
 * 「済んだ」かどうかは設定（onboardingDone / hintDismissed）に覚える。入れたときにもうハイライトがあれば、済んだことにする。
 */
export class Onboarding extends Component {
	/** 最初のハイライトを案内している途中（起動時の確かめで「済んだ」にしないため） */
	private claimed = false;

	constructor(private readonly plugin: PdfSimplePlugin) {
		super();
	}

	/** onLayoutReady の後、索引を作り始めてから呼ぶ */
	start(): void {
		if (this.plugin.settings.onboardingDone) return;
		this.checkExisting();
		// 起動直後はキャッシュの解決が終わっていないことがあるので、最初の resolved でもう一度確かめる
		const { metadataCache } = this.plugin.app;
		const once = metadataCache.on('resolved', () => {
			metadataCache.offref(once);
			this.checkExisting();
		});
		this.registerEvent(once);
	}

	/** 練習用の PDF か */
	isPractice(file: TFile): boolean {
		return file.extension === 'pdf' && PRACTICE_NAMES.has(file.basename);
	}

	/** PDF の上に「なぞってみましょう」を出すか（ノートの無い PDF だけ。練習用の PDF には閉じても出す） */
	shouldShowHint(file: TFile): boolean {
		const { settings, pairing } = this.plugin;
		if (!settings.showOnboarding || file.extension !== 'pdf') return false;
		if (pairing.notesFor(file).length > 0) return false;
		if (this.isPractice(file)) return true;
		return !settings.onboardingDone && !settings.hintDismissed;
	}

	async dismissHint(): Promise<void> {
		if (this.plugin.settings.hintDismissed) return;
		await this.plugin.applySettings({
			...this.plugin.settings,
			hintDismissed: true,
		});
	}

	/**
	 * これから書くハイライトを案内するか（はじめての 1 件、または練習用の PDF の最初の 1 件）。
	 * true を返したら、書き終えたあとに guide か、書かなかったら release を呼ぶ。
	 */
	claim(pdf: TFile): boolean {
		const { settings, pairing } = this.plugin;
		if (!settings.showOnboarding || this.claimed) return false;
		const firstOnPractice =
			this.isPractice(pdf) && pairing.notesFor(pdf).length === 0;
		if (settings.onboardingDone && !firstOnPractice) return false;
		this.claimed = true;
		return true;
	}

	release(): void {
		this.claimed = false;
	}

	/** 最初のハイライトが入ったノートを見せる（パソコンは PDF の右に並べ、スマホは同じ画面で裏返す） */
	async guide(view: FileView, note: TFile, id: string): Promise<void> {
		try {
			await this.markDone();
			const block = { id, notePath: note.path, line: 0 };
			if (Platform.isPhone) {
				await revealBlock(this.plugin, block, {
					sourceLeaf: view.leaf,
					newLeaf: false,
				});
				new Notice(
					t('notice.firstHighlightPhone', { name: note.basename }),
					10000,
				);
			} else {
				await revealBlockBeside(this.plugin, block, view.leaf);
				new Notice(
					t('notice.firstHighlight', { name: note.basename }),
					10000,
				);
			}
		} finally {
			this.claimed = false;
		}
	}

	/** 練習用の PDF を開く（無ければ保存先のフォルダ、未設定なら vault のいちばん上に作る） */
	async openPractice(): Promise<void> {
		const { vault, workspace } = this.plugin.app;
		const content = practiceContent(isJapaneseUi());
		const folder = this.plugin.storage.folder() ?? '';
		const path = normalizePath(
			folder === ''
				? `${content.fileName}.pdf`
				: `${folder}/${content.fileName}.pdf`,
		);
		try {
			let file = vault.getFileByPath(path);
			if (!file) {
				for (const dir of folderChain(folder))
					if (!vault.getFolderByPath(dir))
						await vault.createFolder(dir);
				const { ops } = layoutPractice(content);
				file = await vault.createBinary(
					path,
					buildPdf([ops], content.script, content.title),
				);
			}
			await workspace.getLeaf('tab').openFile(file, { active: true });
		} catch (error) {
			console.error(error);
			new Notice(
				t('notice.practiceFailed', { message: String(error) }),
				8000,
			);
		}
	}

	private checkExisting(): void {
		const { settings, highlights } = this.plugin;
		if (settings.onboardingDone || this.claimed) return;
		if (highlights.index.hasEntries()) void this.markDone();
	}

	private async markDone(): Promise<void> {
		if (this.plugin.settings.onboardingDone) return;
		await this.plugin.applySettings({
			...this.plugin.settings,
			onboardingDone: true,
		});
	}
}
