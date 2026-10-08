import { formatWikilink, parseWikilink, splitLinktext } from './linktext';
import {
	formatPdfSubpath,
	isHighlightId,
	parsePdfSubpath,
	setParam,
} from './pdf-subpath';
import { truncateText } from './text';
import type { HighlightEntry, PdfAnchor } from './types';

/**
 * ハイライト 1 件 = 本文の行（`テキスト ^hl-xxxxxx`・`## 見出し ^hl-…`・`![[画像]] ^hl-…`）と、
 * プロパティ pdf-highlights の要素（`[[doc.pdf#page=…&selection=…&color=…&id=hl-xxxxxx|p.3 …]]`）の対。
 * 第 1 弾の行（`- ==テキスト== ^hl-…`）も同じ ID で読める。
 */

/** 位置と色を書くプロパティ（名前は固定。プロパティ欄で隠す CSS もこの名前で書いている） */
export const ENTRIES_PROPERTY = 'pdf-highlights';

export const ID_PREFIX = 'hl-';
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 6;
const LABEL_LENGTH = 20;

function defaultRandomBytes(length: number): Uint8Array {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return bytes;
}

/** `hl-` + 英小文字・数字 6 文字。isTaken が true を返す ID は避ける */
export function generateId(
	isTaken: (id: string) => boolean,
	randomBytes: (length: number) => Uint8Array = defaultRandomBytes,
): string {
	for (let attempt = 0; attempt < 50; attempt++) {
		let id = ID_PREFIX;
		for (const byte of randomBytes(ID_LENGTH))
			id += ID_ALPHABET.charAt(byte % ID_ALPHABET.length);
		if (!isTaken(id)) return id;
	}
	throw new Error('Could not generate a unique highlight id');
}

export type BodyLineParts =
	/** 文（text はエスケープ済み。段落の中の改行は \n。最後の行の行末に ID を付ける） */
	| { kind: 'text'; text: string; id: string; bullet: boolean }
	/** 見出し（level は 1〜6） */
	| { kind: 'heading'; text: string; id: string; level: number }
	/** 画像（embed は `![[…]]` などの埋め込み） */
	| { kind: 'image'; embed: string; id: string; bullet: boolean };

/** 本文の 1 行 */
export function buildBodyLine(parts: BodyLineParts): string {
	switch (parts.kind) {
		case 'heading': {
			const level = Math.min(6, Math.max(1, Math.round(parts.level)));
			return `${'#'.repeat(level)} ${parts.text} ^${parts.id}`;
		}
		case 'image':
			return `${parts.bullet ? '- ' : ''}${parts.embed} ^${parts.id}`;
		default: {
			// 箇条書きの項目の 2 行目からは字下げして、同じ項目の続きにする
			const text = parts.bullet
				? parts.text.replace(/\n/g, '\n  ')
				: parts.text;
			return `${parts.bullet ? '- ' : ''}${text} ^${parts.id}`;
		}
	}
}

export interface BlockIdMatch {
	/** 小文字にした ID */
	id: string;
	/** 直前の空白の位置 */
	from: number;
	/** 行末 */
	to: number;
}

const BLOCK_ID_AT_END = /\s+\^(hl-[a-z0-9-]+)\s*$/i;

/** 行末のブロック ID ` ^hl-…` を探す（Obsidian と同じく、直前に空白がある行末のものだけ） */
export function findBlockId(line: string): BlockIdMatch | null {
	const match = BLOCK_ID_AT_END.exec(line);
	const id = match?.[1]?.toLowerCase();
	if (!match || id === undefined || !isHighlightId(id)) return null;
	return { id, from: match.index, to: line.length };
}

/** プロパティの表示名 `p.3 先頭 20 文字…`（リンクの別名に使えない文字は置き換える） */
export function entryLabel(page: number, text: string): string {
	const safe = text
		.replace(/\[/g, '(')
		.replace(/\]/g, ')')
		.replace(/\|/g, '/')
		.replace(/\s+/g, ' ')
		.trim();
	return safe === ''
		? `p.${page}`
		: `p.${page} ${truncateText(safe, LABEL_LENGTH)}`;
}

/** プロパティ pdf-highlights に書く文字列 */
export function buildEntryString(parts: {
	linktext: string;
	page: number;
	anchor: PdfAnchor;
	color: string | null;
	id: string;
	label: string;
}): string {
	const subpath = formatPdfSubpath({
		page: parts.page,
		selection: parts.anchor.type === 'text' ? parts.anchor.selection : null,
		region: parts.anchor.type === 'region' ? parts.anchor.region : null,
		color: parts.color,
		id: parts.id,
	});
	return formatWikilink({
		embed: false,
		linktext: `${parts.linktext}${subpath}`,
		alias: parts.label,
	});
}

/** プロパティの文字列からハイライト ID を読む（ハイライトでなければ null） */
export function entryIdOf(text: string): string | null {
	const link = parseWikilink(text);
	if (!link) return null;
	return parsePdfSubpath(splitLinktext(link.linktext).subpath).id;
}

/** プロパティの文字列の color= だけを書き換える（ハイライトでなければ null） */
export function recolorEntryString(
	text: string,
	color: string | null,
): string | null {
	const link = parseWikilink(text);
	if (!link) return null;
	const { path, subpath } = splitLinktext(link.linktext);
	if (parsePdfSubpath(subpath).id === null) return null;
	return formatWikilink({
		...link,
		linktext: `${path}${setParam(subpath, 'color', color)}`,
	});
}

/** プロパティの文字列のパス部分だけを差し替える（別のノートへ移すとき、そのノートから見たリンクにする） */
export function relinkEntryString(
	text: string,
	linkpath: string,
): string | null {
	const link = parseWikilink(text);
	if (!link) return null;
	const { subpath } = splitLinktext(link.linktext);
	if (parsePdfSubpath(subpath).id === null) return null;
	return formatWikilink({ ...link, linktext: `${linkpath}${subpath}` });
}

/** metadataCache の frontmatterLinks の 1 件（key は `pdf-highlights` か `pdf-highlights.0` の形） */
export interface FrontmatterLinkLike {
	key: string;
	link: string;
	displayText?: string;
}

/** プロパティのリンク 1 件をエントリとして読む。resolvePdf はパス部分を PDF の vault 内パスに解決する */
export function entryFromFrontmatterLink(
	notePath: string,
	raw: FrontmatterLinkLike,
	property: string,
	resolvePdf: (linkpath: string) => string | null,
): HighlightEntry | null {
	if (raw.key !== property && !raw.key.startsWith(`${property}.`))
		return null;
	const { path, subpath } = splitLinktext(raw.link);
	const parsed = parsePdfSubpath(subpath);
	if (parsed.page === null || parsed.id === null) return null;
	// 両方書かれていれば文字の範囲を使う
	const anchor: PdfAnchor | null = parsed.selection
		? { type: 'text', selection: parsed.selection }
		: parsed.region
			? { type: 'region', region: parsed.region }
			: null;
	if (anchor === null) return null;
	const pdfPath = resolvePdf(path);
	if (pdfPath === null) return null;
	return {
		id: parsed.id,
		notePath,
		pdfPath,
		page: parsed.page,
		anchor,
		color: parsed.color,
		label: raw.displayText ?? '',
	};
}

/** プロパティの値（文字列 1 つ・リスト・無し）を文字列のリストにする */
export function toEntryList(value: unknown): string[] {
	if (Array.isArray(value))
		return value.filter((item): item is string => typeof item === 'string');
	if (typeof value === 'string' && value !== '') return [value];
	return [];
}

function labelSafe(text: string): string {
	return text.replace(/\[/g, '(').replace(/\]/g, ')').replace(/\|/g, '/');
}

/**
 * PDF の今のテキストが、作ったときの表示名（p.3 先頭 20 文字…）と合っているか。
 * PDF を差し替えて位置がずれたハイライトを見分けるのに使う（空白の違いは無視する）。
 */
export function matchesLabel(label: string, actual: string): boolean {
	const expected = labelSafe(
		label.replace(/^p\.\d+\s*/, '').replace(/…$/, ''),
	).replace(/\s+/g, '');
	if (expected === '') return true;
	return labelSafe(actual).replace(/\s+/g, '').startsWith(expected);
}
