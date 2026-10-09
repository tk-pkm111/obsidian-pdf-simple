import {
	Component,
	Notice,
	TFile,
	debounce,
	type CachedMetadata,
	type TAbstractFile,
} from 'obsidian';
import { t } from '../i18n';
import { extractNoteHighlights } from '../lib/extract';
import { HighlightIndex, type PendingHighlight } from '../lib/highlight-index';
import {
	ENTRIES_PROPERTY,
	entryIdOf,
	relinkEntryString,
	toEntryList,
} from '../lib/highlight-entry';
import { parseWikilink, splitLinktext } from '../lib/linktext';
import type { NoteHighlights } from '../lib/types';
import type PdfSimplePlugin from '../main';

/** 作った直後のハイライトをキャッシュの反映待ちとして描き続ける最長時間 */
const PENDING_MAX_AGE = 15_000;
/** 削除されたノートのエントリを移す前に待つ時間（フォルダごと消したときの連続した削除を待つ） */
const RESCUE_DELAY = 1500;

/** 変わった PDF のパス（null はすべて） */
export type HighlightChangeListener = (
	pdfPaths: ReadonlySet<string> | null,
) => void;

function isMarkdown(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === 'md';
}

function isPdf(file: TAbstractFile): file is TFile {
	return file instanceof TFile && file.extension === 'pdf';
}

/**
 * metadataCache を購読して、ハイライトの索引（src/lib/highlight-index）を最新に保つ。
 * 索引が変わると onChange の購読者（PDF の重ね描き・ノートの装飾）に知らせる。
 */
export class HighlightService extends Component {
	readonly index = new HighlightIndex();
	private readonly listeners = new Set<HighlightChangeListener>();
	private readonly noteData = new Map<string, string>();
	private started = false;
	private readonly rebuildSoon = debounce(() => this.rebuild(), 300, true);

	constructor(private readonly plugin: PdfSimplePlugin) {
		super();
	}

	/** onLayoutReady の後に呼ぶ（起動時の vault 走査を避けるため） */
	start(): void {
		if (this.started) return;
		this.started = true;
		const { metadataCache, vault } = this.plugin.app;
		this.rebuild();
		this.registerEvent(
			metadataCache.on('changed', (file) => this.refreshNote(file)),
		);
		this.registerEvent(
			metadataCache.on('resolve', (file) => this.refreshNote(file)),
		);
		this.registerEvent(
			metadataCache.on('deleted', (file, previous) =>
				this.onDeleted(file, previous),
			),
		);
		this.registerEvent(
			vault.on('rename', (file, oldPath) => this.onRename(file, oldPath)),
		);
		this.registerEvent(
			vault.on('create', (file) => {
				if (isPdf(file)) this.rebuildSoon();
			}),
		);
		this.registerEvent(
			vault.on('delete', (file) => {
				if (isPdf(file)) this.rebuildSoon();
			}),
		);
		// 起動直後はキャッシュの解決が終わっていないことがあるので、最初の resolved でもう一度読む
		const once = metadataCache.on('resolved', () => {
			metadataCache.offref(once);
			this.rebuild();
		});
		this.registerEvent(once);
		this.registerInterval(
			window.setInterval(
				() =>
					this.emit(
						this.index.settlePending(Date.now(), PENDING_MAX_AGE),
					),
				2000,
			),
		);
		this.register(() => this.rebuildSoon.cancel());
	}

	/** 索引が変わったら呼ばれる。戻り値で購読をやめる */
	onChange(listener: HighlightChangeListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** すべてのノートを読み直す（プロパティ名の変更・PDF の追加や改名のとき） */
	rebuild(): void {
		this.index.clear();
		this.noteData.clear();
		for (const file of this.plugin.app.vault.getMarkdownFiles())
			this.readNote(file);
		this.emit(null);
	}

	addPending(pending: PendingHighlight): void {
		this.emit(this.index.addPending(pending));
	}

	private resolvePdf(linkpath: string, sourcePath: string): string | null {
		const file = this.plugin.app.metadataCache.getFirstLinkpathDest(
			linkpath,
			sourcePath,
		);
		return file && file.extension === 'pdf' ? file.path : null;
	}

	private extract(file: TFile, cache: CachedMetadata | null): NoteHighlights {
		return extractNoteHighlights(
			file.path,
			cache,
			ENTRIES_PROPERTY,
			(linkpath) => this.resolvePdf(linkpath, file.path),
		);
	}

	/** ノートを読み、内容が変わっていれば索引を更新して、描き直す PDF を返す */
	private readNote(file: TFile): Set<string> {
		const data = this.extract(
			file,
			this.plugin.app.metadataCache.getFileCache(file),
		);
		const serialized = JSON.stringify(data);
		if (
			(this.noteData.get(file.path) ?? '{"entries":[],"blocks":[]}') ===
			serialized
		)
			return new Set();
		if (data.entries.length === 0 && data.blocks.length === 0)
			this.noteData.delete(file.path);
		else this.noteData.set(file.path, serialized);
		return this.index.setNote(file.path, data);
	}

	private refreshNote(file: TAbstractFile): void {
		if (!isMarkdown(file)) return;
		const affected = this.readNote(file);
		for (const path of this.index.settlePending(
			Date.now(),
			PENDING_MAX_AGE,
		))
			affected.add(path);
		this.emit(affected);
	}

	private onRename(file: TAbstractFile, oldPath: string): void {
		if (isPdf(file)) {
			this.rebuildSoon();
			return;
		}
		if (!isMarkdown(file)) return;
		const data = this.noteData.get(oldPath);
		this.noteData.delete(oldPath);
		if (data !== undefined) this.noteData.set(file.path, data);
		const affected = this.index.renameNote(oldPath, file.path);
		this.emit(affected);
		// 移動先からの相対リンクは解決先が変わることがある
		this.refreshNote(file);
	}

	private onDeleted(file: TFile, previous: CachedMetadata | null): void {
		if (!isMarkdown(file)) return;
		this.noteData.delete(file.path);
		this.emit(this.index.removeNote(file.path));
		if (previous)
			window.setTimeout(
				() => void this.rescue(file.path, previous),
				RESCUE_DELAY,
			);
	}

	/**
	 * 削除されたノートにあったエントリのうち、本文（^hl-…）が別のノートに残っているものを、そのノートへ移す。
	 * ハイライトの位置の記録が、本文と一緒に生き残るようにするため。
	 */
	private async rescue(
		deletedPath: string,
		previous: CachedMetadata,
	): Promise<void> {
		const { metadataCache, vault } = this.plugin.app;
		const raw: unknown = previous.frontmatter?.[ENTRIES_PROPERTY];
		const moves = new Map<string, string[]>();
		for (const text of toEntryList(raw)) {
			const id = entryIdOf(text);
			if (id === null || this.index.entriesFor(id).length > 0) continue;
			const target = this.index.blocksFor(id)[0]?.notePath;
			const link = parseWikilink(text);
			if (target === undefined || !link) continue;
			const pdf = metadataCache.getFirstLinkpathDest(
				splitLinktext(link.linktext).path,
				deletedPath,
			);
			if (!pdf) continue;
			const relinked = relinkEntryString(
				text,
				metadataCache.fileToLinktext(pdf, target),
			);
			if (relinked === null) continue;
			moves.set(target, [...(moves.get(target) ?? []), relinked]);
		}
		let moved = 0;
		for (const [target, entries] of moves) {
			const file = vault.getFileByPath(target);
			if (!file) continue;
			try {
				await this.plugin.writer.addEntryStrings(file, entries);
				moved += entries.length;
			} catch (error) {
				console.error(error);
			}
		}
		if (moved > 0) new Notice(t('notice.rescued', { count: moved }));
	}

	private emit(pdfPaths: ReadonlySet<string> | null): void {
		if (pdfPaths !== null && pdfPaths.size === 0) return;
		for (const listener of [...this.listeners]) {
			try {
				listener(pdfPaths);
			} catch (error) {
				console.error(error);
			}
		}
	}
}
