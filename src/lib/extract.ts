import { entryFromFrontmatterLink } from './highlight-entry';
import { isHighlightId } from './pdf-subpath';
import type { BlockRef, HighlightEntry, NoteHighlights } from './types';

/** metadataCache の CachedMetadata のうち、ここで使う部分 */
export interface HighlightCacheLike {
	frontmatterLinks?: ReadonlyArray<{
		key: string;
		link: string;
		displayText?: string;
	}>;
	blocks?: Readonly<
		Record<string, { id: string; position: { start: { line: number } } }>
	>;
	headings?: ReadonlyArray<{
		level: number;
		position: { start: { line: number } };
	}>;
}

/** 1 つのノートのキャッシュから、ハイライトのエントリと本文の ID（見出しならその大きさ）を読み取る */
export function extractNoteHighlights(
	notePath: string,
	cache: HighlightCacheLike | null | undefined,
	property: string,
	resolvePdf: (linkpath: string) => string | null,
): NoteHighlights {
	const entries: HighlightEntry[] = [];
	const blocks: BlockRef[] = [];
	if (!cache) return { entries, blocks };
	for (const raw of cache.frontmatterLinks ?? []) {
		const entry = entryFromFrontmatterLink(
			notePath,
			raw,
			property,
			resolvePdf,
		);
		if (entry) entries.push(entry);
	}
	const levels = new Map<number, number>();
	for (const heading of cache.headings ?? [])
		levels.set(heading.position.start.line, heading.level);
	for (const block of Object.values(cache.blocks ?? {})) {
		const id = block.id.toLowerCase();
		if (!isHighlightId(id)) continue;
		const line = block.position.start.line;
		blocks.push({ id, notePath, line, level: levels.get(line) ?? 0 });
	}
	return { entries, blocks };
}
