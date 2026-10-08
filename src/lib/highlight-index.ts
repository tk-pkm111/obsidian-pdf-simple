import { anchorKey, compareAnchors } from './pdf-selection';
import type {
	BlockRef,
	Highlight,
	HighlightEntry,
	NoteHighlights,
} from './types';

/** 作った直後（キャッシュに反映される前）のハイライト */
export interface PendingHighlight {
	entry: HighlightEntry;
	block: BlockRef;
	createdAt: number;
}

function byNotePath<T extends { notePath: string }>(a: T, b: T): number {
	return a.notePath < b.notePath ? -1 : a.notePath > b.notePath ? 1 : 0;
}

/**
 * ノートごとに読み取ったエントリ（位置と色）と本文の ID（テキストの居場所）から、
 * PDF ごとに「描くハイライト」を引けるようにする。
 * エントリがあっても本文の ID がどこにも無ければ描かない（本文を消せば PDF からも消える）。
 * 変更系のメソッドは、描き直しが必要な PDF のパスを返す。
 */
export class HighlightIndex {
	private readonly notes = new Map<string, NoteHighlights>();
	private readonly entriesById = new Map<string, HighlightEntry[]>();
	private readonly blocksById = new Map<string, BlockRef[]>();
	private readonly pending = new Map<string, PendingHighlight>();
	private readonly byPdf = new Map<string, Highlight[]>();

	clear(): void {
		this.notes.clear();
		this.entriesById.clear();
		this.blocksById.clear();
		this.byPdf.clear();
	}

	setNote(notePath: string, data: NoteHighlights): Set<string> {
		const affected = new Set<string>();
		const previous = this.notes.get(notePath);
		if (previous) {
			this.collectPdfs(previous, affected);
			this.unindex(notePath, previous);
			this.notes.delete(notePath);
		}
		if (data.entries.length > 0 || data.blocks.length > 0) {
			this.notes.set(notePath, data);
			this.indexNote(data);
		}
		this.collectPdfs(data, affected);
		this.invalidate(affected);
		return affected;
	}

	removeNote(notePath: string): Set<string> {
		return this.setNote(notePath, { entries: [], blocks: [] });
	}

	renameNote(oldPath: string, newPath: string): Set<string> {
		const data = this.notes.get(oldPath);
		if (!data) return new Set();
		const moved: NoteHighlights = {
			entries: data.entries.map((e) => ({ ...e, notePath: newPath })),
			blocks: data.blocks.map((b) => ({ ...b, notePath: newPath })),
		};
		const affected = this.removeNote(oldPath);
		for (const path of this.setNote(newPath, moved)) affected.add(path);
		return affected;
	}

	/** 作った直後のハイライトを、キャッシュに反映されるまでの間だけ描く */
	addPending(pending: PendingHighlight): Set<string> {
		this.pending.set(pending.entry.id, pending);
		const affected = new Set([pending.entry.pdfPath]);
		this.invalidate(affected);
		return affected;
	}

	/** キャッシュに反映された（エントリと本文の両方が見つかった）ものと、古くなったものを外す */
	settlePending(now: number, maxAgeMs: number): Set<string> {
		const affected = new Set<string>();
		for (const [id, pending] of this.pending) {
			const settled = this.entriesById.has(id) && this.blocksById.has(id);
			if (settled || now - pending.createdAt > maxAgeMs) {
				this.pending.delete(id);
				affected.add(pending.entry.pdfPath);
			}
		}
		this.invalidate(affected);
		return affected;
	}

	hasId(id: string): boolean {
		return (
			this.entriesById.has(id) ||
			this.blocksById.has(id) ||
			this.pending.has(id)
		);
	}

	entriesFor(id: string): HighlightEntry[] {
		const entries = this.entriesById.get(id);
		if (entries && entries.length > 0) return [...entries];
		const pending = this.pending.get(id);
		return pending ? [pending.entry] : [];
	}

	blocksFor(id: string): BlockRef[] {
		const blocks = this.blocksById.get(id);
		if (blocks && blocks.length > 0) return [...blocks];
		const pending = this.pending.get(id);
		return pending ? [pending.block] : [];
	}

	entry(id: string): HighlightEntry | null {
		return this.entriesFor(id)[0] ?? null;
	}

	/** 本文の ID がどこにも無いエントリ（作った直後のものは除く） */
	orphanEntries(): HighlightEntry[] {
		const orphans: HighlightEntry[] = [];
		for (const [id, entries] of this.entriesById) {
			if (this.blocksById.has(id) || this.pending.has(id)) continue;
			orphans.push(...entries);
		}
		return orphans.sort(byNotePath);
	}

	/** その PDF に描くハイライト（ページ順） */
	forPdf(pdfPath: string): Highlight[] {
		let highlights = this.byPdf.get(pdfPath);
		if (!highlights) {
			highlights = this.build(pdfPath);
			this.byPdf.set(pdfPath, highlights);
		}
		return highlights;
	}

	/** 索引にあるすべての PDF のパス */
	pdfPaths(): Set<string> {
		const paths = new Set<string>();
		for (const entries of this.entriesById.values())
			for (const entry of entries) paths.add(entry.pdfPath);
		for (const pending of this.pending.values())
			paths.add(pending.entry.pdfPath);
		return paths;
	}

	private build(pdfPath: string): Highlight[] {
		const ids = new Set<string>();
		for (const [id, entries] of this.entriesById)
			if (entries.some((e) => e.pdfPath === pdfPath)) ids.add(id);
		for (const [id, pending] of this.pending)
			if (pending.entry.pdfPath === pdfPath) ids.add(id);

		const groups = new Map<string, Highlight>();
		for (const id of [...ids].sort()) {
			const entries = this.entriesFor(id).filter(
				(e) => e.pdfPath === pdfPath,
			);
			const primary = entries[0];
			const blocks = this.blocksFor(id);
			if (!primary || blocks.length === 0) continue;
			const key = anchorKey(primary.page, primary.anchor);
			const group = groups.get(key);
			if (group) {
				group.ids.push(id);
				group.entries.push(...entries);
				group.blocks.push(...blocks);
				continue;
			}
			groups.set(key, {
				key,
				pdfPath,
				page: primary.page,
				anchor: primary.anchor,
				level: blocks[0]?.level ?? 0,
				color: primary.color,
				ids: [id],
				entries: [...entries],
				blocks: [...blocks],
				label: primary.label,
			});
		}
		return [...groups.values()].sort(compareAnchors);
	}

	private collectPdfs(data: NoteHighlights, into: Set<string>): void {
		for (const entry of data.entries) into.add(entry.pdfPath);
		for (const block of data.blocks)
			for (const entry of this.entriesFor(block.id))
				into.add(entry.pdfPath);
	}

	private indexNote(data: NoteHighlights): void {
		for (const entry of data.entries) {
			const list = this.entriesById.get(entry.id) ?? [];
			list.push(entry);
			list.sort(byNotePath);
			this.entriesById.set(entry.id, list);
		}
		for (const block of data.blocks) {
			const list = this.blocksById.get(block.id) ?? [];
			list.push(block);
			list.sort(byNotePath);
			this.blocksById.set(block.id, list);
		}
	}

	private unindex(notePath: string, data: NoteHighlights): void {
		for (const entry of data.entries) {
			const list = (this.entriesById.get(entry.id) ?? []).filter(
				(e) => e.notePath !== notePath,
			);
			if (list.length > 0) this.entriesById.set(entry.id, list);
			else this.entriesById.delete(entry.id);
		}
		for (const block of data.blocks) {
			const list = (this.blocksById.get(block.id) ?? []).filter(
				(b) => b.notePath !== notePath,
			);
			if (list.length > 0) this.blocksById.set(block.id, list);
			else this.blocksById.delete(block.id);
		}
	}

	private invalidate(pdfPaths: Iterable<string>): void {
		for (const path of pdfPaths) this.byPdf.delete(path);
	}
}
