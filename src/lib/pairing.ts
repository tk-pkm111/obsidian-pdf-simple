import { uniqueFilePath } from './file-paths';
import { splitLinktext } from './linktext';

/**
 * ノートと PDF の対応（ペアリング）。
 * ノートのプロパティ（既定は pdf）の最初のリンクを優先し、プロパティが無ければ本文で最初に出てくる PDF へのリンク・埋め込み。
 */

interface Positioned {
	link: string;
	position: { start: { offset: number } };
}

export interface PairingCacheLike {
	frontmatterLinks?: ReadonlyArray<{ key: string; link: string }>;
	links?: readonly Positioned[];
	embeds?: readonly Positioned[];
}

/** ノートに対応する PDF の vault 内パス。resolvePdf はリンクのパスを PDF のパスに解決する（PDF でなければ null） */
export function pairedPdfPath(
	cache: PairingCacheLike | null | undefined,
	property: string,
	resolvePdf: (linkpath: string) => string | null,
): string | null {
	if (!cache) return null;
	const fromProperty = (cache.frontmatterLinks ?? []).filter(
		(link) => link.key === property || link.key === `${property}.0`,
	);
	if (fromProperty.length > 0) {
		for (const link of fromProperty) {
			const path = resolvePdf(splitLinktext(link.link).path);
			if (path !== null) return path;
		}
		return null;
	}
	const body = [...(cache.embeds ?? []), ...(cache.links ?? [])].sort(
		(a, b) => a.position.start.offset - b.position.start.offset,
	);
	for (const link of body) {
		const path = resolvePdf(splitLinktext(link.link).path);
		if (path !== null) return path;
	}
	return null;
}

/** その PDF とペアになっているノート（resolvedLinks で候補を絞り、pdfOf で確かめる） */
export function pairedNotePaths(
	resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>,
	pdfPath: string,
	pdfOf: (notePath: string) => string | null,
): string[] {
	const notes: string[] = [];
	for (const [source, targets] of Object.entries(resolvedLinks)) {
		if (!source.endsWith('.md') || !targets[pdfPath]) continue;
		if (pdfOf(source) === pdfPath) notes.push(source);
	}
	return notes.sort((a, b) => a.localeCompare(b));
}

/** 新しいノートのパス（`<folder>/<basename>.md`。あれば ` 1`, ` 2` … を付ける） */
export function uniqueNotePath(
	folder: string,
	basename: string,
	exists: (path: string) => boolean,
): string {
	return uniqueFilePath(folder, basename, 'md', exists);
}
