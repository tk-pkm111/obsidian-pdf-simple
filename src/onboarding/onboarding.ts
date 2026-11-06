import {
	Component,
	FileView,
	MarkdownView,
	Notice,
	Platform,
	normalizePath,
	type TFile,
} from 'obsidian';
import { isJapaneseUi, t } from '../i18n';
import { folderChain } from '../lib/file-paths';
import { ENTRIES_PROPERTY } from '../lib/highlight-entry';
import { layoutPractice, practiceContent } from '../lib/practice-content';
import { buildPdf } from '../lib/practice-pdf';
import type { TipId } from '../lib/settings';
import type PdfSimplePlugin from '../main';
import { leafShowing, revealBlock, revealBlockBeside } from '../note/navigate';
import { isPdfView } from '../viewer/dom';
import { GuideCard, type GuideStep } from './guide-card';
import { showTip } from './tip';

/** 練習用の PDF のファイル名（どちらの言語で作ったものも練習用として扱う） */
const PRACTICE_NAMES = new Set([
	practiceContent(true).fileName,
	practiceContent(false).fileName,
]);

/** ペンのヒントを出すのは、その PDF のハイライトがこの数になったとき */
const PEN_TIP_AFTER = 3;

/**
 * はじめての人の案内。
 * - 右下のガイド（3 ステップ: なぞる → ノートの ● で PDF に戻る → 自分の PDF）。済むか × で、二度と出ない。
 *   まだ済んでいない人には、最初に PDF を開いたときに出す。「やってみる」とコマンドで、済んでいても最初から出す。
 * - 使い始めてからのヒント 2 つ（ペン・ノートの「PDF」ボタン）。1 回ずつ。
 * 「済んだ」は設定の onboardingDone に覚える。入れたときにもうハイライトがあれば、済んだことにする。
 */
export class Onboarding extends Component {
	/** 書こうとしているハイライトを案内に使う（書き終えたら guide、書けなかったら release） */
	private claimed = false;
	/** 「やってみる」・コマンドで始めた（済んでいても出す） */
	private active = false;
	private step: GuideStep = 'select';
	/** ガイドで最初にハイライトした PDF とノート */
	private pdfPath: string | null = null;
	private notePath: string | null = null;
	private readonly card: GuideCard;
	private closeTip: (() => void) | null = null;
	private tipTimer: number | null = null;

	constructor(private readonly plugin: PdfSimplePlugin) {
		super();
		this.card = new GuideCard({
			close: () => void this.finish(),
			later: () => void this.finish(),
			importPdf: () => {
				// ファイルを選ぶ画面は、押した直後に開く必要がある（待たずに呼ぶ）
				this.plugin.importer.pick();
				void this.finish();
			},
			cleanup: () => void this.cleanup(),
		});
	}

	/** onLayoutReady の後、索引を作り始めてから呼ぶ */
	start(): void {
		const { metadataCache, workspace } = this.plugin.app;
		if (!this.plugin.settings.onboardingDone) {
			this.checkExisting();
			// 起動直後はキャッシュの解決が終わっていないことがあるので、最初の resolved でもう一度確かめる
			const once = metadataCache.on('resolved', () => {
				metadataCache.offref(once);
				this.checkExisting();
			});
			this.registerEvent(once);
		}
		this.registerEvent(
			workspace.on('active-leaf-change', () => {
				this.refresh();
				this.scheduleChipTip();
			}),
		);
		this.registerEvent(workspace.on('layout-change', () => this.refresh()));
		this.register(() => {
			this.card.hide();
			this.closeTip?.();
			if (this.tipTimer !== null) window.clearTimeout(this.tipTimer);
			activeDocument.body.removeClass('pdf-simple-tour-back');
		});
		this.refresh();
	}

	/** 練習用の PDF か */
	isPractice(file: TFile): boolean {
		return file.extension === 'pdf' && PRACTICE_NAMES.has(file.basename);
	}

	/** 「やってみる」・コマンド: 練習用の PDF を開いて、ガイドを最初から出す */
	async begin(): Promise<void> {
		this.active = true;
		this.step = 'select';
		this.pdfPath = null;
		this.notePath = null;
		await this.openPractice();
		this.refresh();
	}

	/**
	 * これから書くハイライトを案内に使うか（ガイドの①のとき）。
	 * true を返したら、書き終えたあとに guide か、書かなかったら release を呼ぶ。
	 */
	claim(): boolean {
		if (!this.guiding || this.claimed || this.step !== 'select')
			return false;
		this.claimed = true;
		return true;
	}

	release(): void {
		this.claimed = false;
	}

	/** ①が済んだ: 入ったノートを見せて②へ（パソコンは PDF の右に並べ、スマホは同じ画面で裏返す） */
	async guide(view: FileView, note: TFile, id: string): Promise<void> {
		try {
			this.pdfPath = view.file?.path ?? null;
			this.notePath = note.path;
			this.step = 'back';
			this.refresh();
			const block = { id, notePath: note.path, line: 0 };
			if (Platform.isPhone)
				await revealBlock(this.plugin, block, {
					sourceLeaf: view.leaf,
					newLeaf: false,
				});
			else await revealBlockBeside(this.plugin, block, view.leaf);
		} finally {
			this.claimed = false;
			this.refresh();
		}
	}

	/** ノートから PDF に移った（● ・「PDF」ボタン・メニュー）。②のときは③へ */
	returnedToPdf(): void {
		if (!this.guiding || this.step !== 'back') return;
		this.step = 'done';
		this.refresh();
	}

	/** ハイライトを書いたあと（ガイドに使ったものを除く）。ペンのヒントを出すか決める */
	afterHighlight(view: FileView): void {
		const pdf = view.file;
		if (!pdf || this.guiding || this.shown('pen')) return;
		if (
			this.plugin.highlights.index.forPdf(pdf.path).length < PEN_TIP_AFTER
		)
			return;
		const pen = view.contentEl.querySelector<HTMLElement>(
			'.pdf-simple-tool-pen',
		);
		if (!pen?.isShown()) return;
		this.tip('pen', pen, t('tip.penTitle'), t('tip.penBody'));
	}

	/** 設定や画面が変わったら、ガイドを出し直す（出さないなら外す） */
	refresh(): void {
		const body = activeDocument.body;
		if (!this.guiding) {
			this.card.hide();
			body.removeClass('pdf-simple-tour-back');
			return;
		}
		body.toggleClass('pdf-simple-tour-back', this.step === 'back');
		const view = this.plugin.app.workspace.getActiveViewOfType(FileView);
		const onPdf = view !== null && isPdfView(view);
		// ①は PDF を開いているときだけ出す（ほかのノートを書いているときに邪魔をしない）
		if (this.step === 'select' && !onPdf) {
			this.card.hide();
			return;
		}
		const file =
			this.step === 'select'
				? (view?.file ?? null)
				: this.pdfPath === null
					? null
					: this.plugin.app.vault.getFileByPath(this.pdfPath);
		// スマホは、開いているビューのヘッダーのすぐ下に出す
		const header = Platform.isPhone
			? view?.containerEl.querySelector('.view-header')
			: null;
		this.card.show(
			{
				step: this.step,
				practice: file !== null && this.isPractice(file),
				paired:
					file !== null &&
					this.plugin.pairing.notesFor(file).length > 0,
				phone: Platform.isPhone,
				selectAction: this.plugin.settings.selectAction,
			},
			header ? header.getBoundingClientRect().bottom + 6 : null,
		);
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
				const { ops, size } = layoutPractice(content);
				file = await vault.createBinary(
					path,
					buildPdf([ops], content.script, content.title, size),
				);
			}
			const leaf = workspace.getLeaf('tab');
			await leaf.openFile(file, { active: true });
			await workspace.revealLeaf(leaf);
		} catch (error) {
			console.error(error);
			new Notice(
				t('notice.practiceFailed', { message: String(error) }),
				8000,
			);
		}
	}

	/** ガイドを終える（済んだことにして、二度と出さない） */
	private async finish(): Promise<void> {
		this.active = false;
		this.step = 'select';
		this.refresh();
		await this.markDone();
		this.refresh();
	}

	/** ③「練習の PDF とノートを片付ける」: 練習に使った PDF と、そのノートをごみ箱へ */
	private async cleanup(): Promise<void> {
		const { vault, fileManager } = this.plugin.app;
		const pdf =
			this.pdfPath === null ? null : vault.getFileByPath(this.pdfPath);
		const note =
			this.notePath === null ? null : vault.getFileByPath(this.notePath);
		await this.finish();
		try {
			if (note) await fileManager.trashFile(note);
			if (pdf && this.isPractice(pdf)) await fileManager.trashFile(pdf);
		} catch (error) {
			console.error(error);
		}
	}

	private get guiding(): boolean {
		return this.active || !this.plugin.settings.onboardingDone;
	}

	private shown(id: TipId): boolean {
		return this.plugin.settings.tipsShown.includes(id);
	}

	/** ノートだけを開いた最初の 1 回、ヘッダーの「PDF」ボタンのヒント（ボタンが付くのを少し待つ） */
	private scheduleChipTip(): void {
		if (this.guiding || this.shown('chip')) return;
		if (this.tipTimer !== null) window.clearTimeout(this.tipTimer);
		this.tipTimer = window.setTimeout(() => {
			this.tipTimer = null;
			this.chipTip();
		}, 400);
	}

	private chipTip(): void {
		if (this.guiding || this.shown('chip') || this.closeTip) return;
		const { workspace, metadataCache } = this.plugin.app;
		const view = workspace.getActiveViewOfType(MarkdownView);
		const note = view?.file;
		if (!view || !note) return;
		const chip = view.containerEl.querySelector<HTMLElement>(
			'.view-action.pdf-simple-pdf-chip',
		);
		if (!chip?.isShown()) return;
		// ハイライトがあるノートだけ（行き来する相手がまだ無いノートには出さない）
		const frontmatter = metadataCache.getFileCache(note)?.frontmatter;
		if (!Array.isArray(frontmatter?.[ENTRIES_PROPERTY])) return;
		// PDF が横に見えているなら、ボタンを使う場面ではない
		const pdf = this.plugin.pairing.pdfFor(note);
		if (!pdf || leafShowing(this.plugin, pdf.path, isPdfView, view.leaf))
			return;
		this.tip('chip', chip, t('tip.chipTitle'), t('tip.chipBody'));
	}

	private tip(id: TipId, anchor: HTMLElement, title: string, body: string) {
		this.closeTip?.();
		this.closeTip = showTip(anchor, title, body, t('tip.ok'), () => {
			this.closeTip = null;
		});
		const settings = this.plugin.settings;
		void this.plugin.applySettings({
			...settings,
			tipsShown: [...settings.tipsShown, id],
		});
	}

	private checkExisting(): void {
		const { settings, highlights } = this.plugin;
		if (settings.onboardingDone || this.claimed || this.active) return;
		if (this.step !== 'select') return;
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
