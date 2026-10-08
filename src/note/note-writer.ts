import { MarkdownView, type TFile } from 'obsidian';
import {
	ENTRIES_PROPERTY,
	HEADING_PROPERTY,
	entryIdOf,
	recolorEntryString,
	toEntryList,
} from '../lib/highlight-entry';
import { planInsertHighlight, type InsertOrder } from '../lib/note-insert';
import { applyEdits, type TextEdit } from '../lib/note-lines';
import {
	planRemoveHighlight,
	planSetHeadingLevel,
	type RemoveMode,
} from '../lib/note-remove';
import type PdfToolsPlugin from '../main';

function unique(values: readonly string[]): string[] {
	return [...new Set(values)];
}

/**
 * ノートへの書き込み。
 * - 本文: そのノートをソースモード（ライブプレビュー含む）で開いていれば Editor（元に戻せる）、無ければ Vault.process
 * - プロパティ: FileManager.processFrontMatter
 * Editor で本文を変えたときは、プロパティを書く前に保存する（ディスク上の古い本文にプロパティを書いて上書きしないため）。
 */
export class NoteWriter {
	constructor(private readonly plugin: PdfToolsPlugin) {}

	private editingView(file: TFile): MarkdownView | null {
		let found: MarkdownView | null = null;
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (
				!found &&
				view instanceof MarkdownView &&
				view.file?.path === file.path &&
				view.getMode() === 'source'
			)
				found = view;
		});
		return found;
	}

	/** 本文を編集する。plan は今の本文から編集を作る */
	async editBody(
		file: TFile,
		plan: (content: string) => TextEdit[],
	): Promise<boolean> {
		const view = this.editingView(file);
		if (view) {
			const editor = view.editor;
			const edits = plan(editor.getValue());
			if (edits.length === 0) return false;
			editor.transaction({
				changes: [...edits]
					.sort((a, b) => a.from - b.from)
					.map((edit) => ({
						from: editor.offsetToPos(edit.from),
						to: editor.offsetToPos(edit.to),
						text: edit.insert,
					})),
			});
			await view.save();
			return true;
		}
		let changed = false;
		await this.plugin.app.vault.process(file, (content) => {
			const edits = plan(content);
			changed = edits.length > 0;
			return changed ? applyEdits(content, edits) : content;
		});
		return changed;
	}

	/** エントリのプロパティ（文字列のリスト）を書き換える。空になればプロパティごと消す */
	async updateEntries(
		file: TFile,
		update: (entries: string[]) => string[],
	): Promise<void> {
		const property = ENTRIES_PROPERTY;
		await this.plugin.app.fileManager.processFrontMatter(
			file,
			(frontmatter: Record<string, unknown>) => {
				const current = toEntryList(frontmatter[property]);
				const next = update(current);
				if (next.length === 0) {
					if (property in frontmatter) delete frontmatter[property];
				} else {
					frontmatter[property] = next;
				}
			},
		);
	}

	/** エントリを足す（同じ ID が既にあれば足さない） */
	async addEntryStrings(
		file: TFile,
		entries: readonly string[],
	): Promise<void> {
		await this.updateEntries(file, (current) => {
			const ids = new Set(current.map(entryIdOf));
			return [
				...current,
				...entries.filter((entry) => !ids.has(entryIdOf(entry))),
			];
		});
	}

	/**
	 * ハイライト 1 件を書く: 本文に 1 行、プロパティに 1 要素。
	 * 入れる場所は、ノートごとの見出し → 設定の見出し → 本文の最後（Excalidraw のデータなどの手前）の順に探す。
	 * order があり、設定が「PDF の順」なら、その場所の中で PDF の順に並ぶ位置に入れる。
	 */
	async insertHighlight(
		note: TFile,
		bodyLine: string,
		entry: string,
		order?: InsertOrder,
	): Promise<void> {
		const { insertPosition, insertHeading } = this.plugin.settings;
		const headings = [this.noteHeading(note), insertHeading].filter(
			(name): name is string => name !== null && name.trim() !== '',
		);
		await this.editBody(note, (content) => [
			planInsertHighlight(content, bodyLine, {
				headings,
				order: insertPosition === 'order' ? (order ?? null) : null,
			}),
		]);
		await this.addEntryStrings(note, [entry]);
	}

	/** ノートごとに決めた、ハイライトを入れる見出しの名前（プロパティ pdf-highlights-heading。無ければ null） */
	noteHeading(note: TFile): string | null {
		const value: unknown =
			this.plugin.app.metadataCache.getFileCache(note)?.frontmatter?.[
				HEADING_PROPERTY
			];
		if (typeof value === 'number') return String(value);
		return typeof value === 'string' && value.trim() !== '' ? value : null;
	}

	/** ノートごとの、ハイライトを入れる見出しを決める（null なら外す） */
	async setNoteHeading(note: TFile, name: string | null): Promise<void> {
		await this.plugin.app.fileManager.processFrontMatter(
			note,
			(frontmatter: Record<string, unknown>) => {
				if (name !== null) frontmatter[HEADING_PROPERTY] = name;
				else if (HEADING_PROPERTY in frontmatter)
					delete frontmatter[HEADING_PROPERTY];
			},
		);
	}

	/**
	 * ハイライトを消す: 本文の行（mode に従って行ごとか、ID だけ外して文を残す）と、プロパティの要素。
	 * 文を残した行があれば true を返す。
	 */
	async removeHighlight(id: string, mode: RemoveMode): Promise<boolean> {
		const { index } = this.plugin.highlights;
		const { vault } = this.plugin.app;
		let kept = false;
		for (const path of unique(
			index.blocksFor(id).map((block) => block.notePath),
		)) {
			const file = vault.getFileByPath(path);
			if (!file) continue;
			await this.editBody(file, (content) => {
				const plan = planRemoveHighlight(content, id, mode);
				if (plan.kept) kept = true;
				return plan.edits;
			});
		}
		await this.removeEntries(
			unique(index.entriesFor(id).map((entry) => entry.notePath)),
			new Set([id]),
		);
		return kept;
	}

	/** 本文の行の見出しの大きさを変える（0 なら本文に戻す） */
	async setHeadingLevel(id: string, level: number): Promise<void> {
		const { vault } = this.plugin.app;
		for (const path of unique(
			this.plugin.highlights.index
				.blocksFor(id)
				.map((block) => block.notePath),
		)) {
			const file = vault.getFileByPath(path);
			if (file)
				await this.editBody(file, (content) =>
					planSetHeadingLevel(content, id, level),
				);
		}
	}

	/** 指定したノートのプロパティから、ID が ids に含まれる要素を消す */
	async removeEntries(
		notePaths: readonly string[],
		ids: ReadonlySet<string>,
	): Promise<void> {
		for (const path of notePaths) {
			const file = this.plugin.app.vault.getFileByPath(path);
			if (!file) continue;
			await this.updateEntries(file, (current) =>
				current.filter((entry) => {
					const id = entryIdOf(entry);
					return id === null || !ids.has(id);
				}),
			);
		}
	}

	/** プロパティの color= だけを書き換える */
	async recolor(id: string, color: string): Promise<void> {
		const { index } = this.plugin.highlights;
		for (const path of unique(
			index.entriesFor(id).map((entry) => entry.notePath),
		)) {
			const file = this.plugin.app.vault.getFileByPath(path);
			if (!file) continue;
			await this.updateEntries(file, (current) =>
				current.map((entry) =>
					entryIdOf(entry) === id
						? (recolorEntryString(entry, color) ?? entry)
						: entry,
				),
			);
		}
	}
}
