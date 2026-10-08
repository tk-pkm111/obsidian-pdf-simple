import {
	MarkdownView,
	Notice,
	type FileView,
	type PaneType,
	type TFile,
	type View,
	type WorkspaceLeaf,
} from 'obsidian';
import { t } from '../i18n';
import type PdfToolsPlugin from '../main';
import { leafShowing, targetLeaf } from '../note/navigate';
import { chooseNote, PdfSuggestModal } from '../ui/modals';
import { isPdfView } from '../viewer/dom';

/** タブごとに覚えておくこと（裏返して戻ったときに元の位置へ戻すため） */
interface LeafMemory {
	notePath?: string;
	noteState?: Record<string, unknown>;
	pdfPath?: string;
	page?: number;
}

/**
 * 表（ノート）と裏（PDF）の切り替え。
 * 既定では同じタブで入れ替え、ノートのスクロール位置と PDF のページをタブごとに覚えておく。
 */
export class FlipController {
	private readonly memory = new WeakMap<WorkspaceLeaf, LeafMemory>();

	constructor(private readonly plugin: PdfToolsPlugin) {}

	private patch(leaf: WorkspaceLeaf, patch: LeafMemory): void {
		this.memory.set(leaf, { ...this.memory.get(leaf), ...patch });
	}

	/** このタブでノートから PDF へ移る前に、ノートとその位置を覚える */
	rememberNote(leaf: WorkspaceLeaf, view: MarkdownView): void {
		if (!view.file) return;
		this.patch(leaf, {
			notePath: view.file.path,
			noteState: view.getEphemeralState(),
		});
	}

	/** このタブで PDF からノートへ移る前に、PDF とページを覚える */
	rememberPdf(leaf: WorkspaceLeaf, view: FileView): void {
		if (!view.file) return;
		const page = this.plugin.viewer.currentPage(view);
		this.patch(leaf, {
			pdfPath: view.file.path,
			...(page === null ? {} : { page }),
		});
	}

	/** ノート → PDF（添付が無ければ選ばせて添付する） */
	async toPdf(
		view: MarkdownView,
		newLeaf: PaneType | boolean = false,
	): Promise<void> {
		const note = view.file;
		if (!note) return;
		const pdf = this.plugin.pairing.pdfFor(note);
		if (pdf) {
			await this.openPdf(view, note, pdf, newLeaf);
			return;
		}
		new PdfSuggestModal(this.plugin.app, (chosen) => {
			void (async () => {
				await this.plugin.pairing.attach(note, chosen);
				new Notice(t('notice.attached', { pdf: chosen.name }));
				await this.openPdf(view, note, chosen, newLeaf);
			})();
		}).open();
	}

	private async openPdf(
		view: MarkdownView,
		note: TFile,
		pdf: TFile,
		newLeaf: PaneType | boolean,
	): Promise<void> {
		const leaf = view.leaf;
		const memory = this.memory.get(leaf);
		const page = memory?.pdfPath === pdf.path ? memory.page : undefined;
		const existing = this.existingSplit(leaf, pdf.path, newLeaf, isPdfView);
		if (existing) {
			await this.plugin.app.workspace.revealLeaf(existing);
			return;
		}
		const target = targetLeaf(this.plugin, { sourceLeaf: leaf, newLeaf });
		if (target === leaf) this.rememberNote(leaf, view);
		this.patch(target, { notePath: note.path, pdfPath: pdf.path });
		await target.openFile(pdf, {
			active: true,
			...(page === undefined
				? {}
				: { eState: { subpath: `#page=${page}` } }),
		});
		this.plugin.viewer.scan();
	}

	/** PDF → ノート（無ければ作る） */
	async toNote(
		view: FileView,
		newLeaf: PaneType | boolean = false,
	): Promise<void> {
		const pdf = view.file;
		if (!pdf) return;
		const leaf = view.leaf;
		const note = await this.noteFor(leaf, pdf, true);
		if (!note) return;
		this.rememberPdf(leaf, view);
		const memory = this.memory.get(leaf);
		const noteState =
			memory?.notePath === note.path ? memory.noteState : undefined;
		const existing = this.existingSplit(
			leaf,
			note.path,
			newLeaf,
			(other) => other instanceof MarkdownView,
		);
		if (existing) {
			await this.plugin.app.workspace.revealLeaf(existing);
			return;
		}
		const target = targetLeaf(this.plugin, { sourceLeaf: leaf, newLeaf });
		this.patch(target, { notePath: note.path, pdfPath: pdf.path });
		await target.openFile(note, {
			active: true,
			...(noteState ? { eState: noteState } : {}),
		});
	}

	/** 「分割して並べる」設定のとき、相手のファイルを既に開いているタブ（あれば分割を増やさずに使う） */
	private existingSplit(
		leaf: WorkspaceLeaf,
		path: string,
		newLeaf: PaneType | boolean,
		accept: (view: View) => boolean,
	): WorkspaceLeaf | null {
		if (newLeaf || this.plugin.settings.flipMode !== 'split') return null;
		return leafShowing(this.plugin, path, accept, leaf);
	}

	/** PDF ファイル（タブで開いていない）から、そのノートを新しいタブで開く */
	async openNoteForFile(pdf: TFile): Promise<void> {
		const note = await this.noteFor(null, pdf, true);
		if (note)
			await this.plugin.app.workspace
				.getLeaf('tab')
				.openFile(note, { active: true });
	}

	/**
	 * ハイライトを書き込むノート。
	 * このタブで覚えているノート → PDF を添付しているノート（複数なら選ぶ） → 無ければ作る（create のとき）。
	 */
	async noteFor(
		leaf: WorkspaceLeaf | null,
		pdf: TFile,
		create: boolean,
	): Promise<TFile | null> {
		const { pairing } = this.plugin;
		const remembered = leaf ? this.memory.get(leaf)?.notePath : undefined;
		if (remembered !== undefined) {
			const file = this.plugin.app.vault.getFileByPath(remembered);
			if (file && pairing.pdfFor(file)?.path === pdf.path) return file;
		}
		const notes = pairing.notesFor(pdf);
		let note: TFile | null = notes.length === 1 ? (notes[0] ?? null) : null;
		if (notes.length > 1) note = await chooseNote(this.plugin.app, notes);
		if (!note && notes.length === 0 && create) {
			note = await pairing.createNoteFor(pdf);
			new Notice(t('notice.noteCreated', { name: note.basename }));
		}
		if (note && leaf)
			this.patch(leaf, { notePath: note.path, pdfPath: pdf.path });
		return note;
	}
}
