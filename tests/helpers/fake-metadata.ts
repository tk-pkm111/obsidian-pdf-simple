/**
 * テスト用の metadataCache（仮想 vault の中身から、このプラグインが使う形のキャッシュを作る）。
 * 本物と同じく、ファイルが変わると 'changed' → 'resolve'、消えると 'deleted' を発火する（同期的に）。
 * 読み取るもの: frontmatter / frontmatterLinks（"[[…]]" の文字列とリスト。キーは prop / prop.0）/
 * 本文の [[…]] と ![[…]] / ブロック ID（^id）/ 見出し。
 * ブロック ID は本物と同じく、ブロック（段落・箇条書きの項目・見出し）の最後の行末にあるものだけを読む
 * （空行を挟まずに続く行は 1 つの段落になる。コードブロックの中は読まない）。
 */
import YAML from 'yaml';
import { Events, TFile, type TAbstractFile } from '../__mocks__/obsidian';
import type { FakeVault } from './fake-app';

interface Loc {
	line: number;
	col: number;
	offset: number;
}

interface Reference {
	link: string;
	original: string;
	displayText?: string;
	position: { start: Loc; end: Loc };
}

export interface FakeCache {
	frontmatter?: Record<string, unknown>;
	frontmatterLinks?: Array<{
		key: string;
		link: string;
		original: string;
		displayText?: string;
	}>;
	links?: Reference[];
	embeds?: Reference[];
	blocks?: Record<string, { id: string; position: { start: Loc; end: Loc } }>;
	headings?: Array<{
		heading: string;
		level: number;
		position: { start: Loc; end: Loc };
	}>;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const WIKILINK = /^\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]$/;
const BODY_LINK = /(!?)\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;
const BLOCK_ID = /\s\^([A-Za-z0-9-]+)\s*$/;
const HEADING = /^\s{0,3}(#{1,6})(?:[ \t]+(.*))?$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;
const FENCE = /^\s{0,3}(?:`{3,}|~{3,})/;

function locAt(text: string, offset: number): Loc {
	const before = text.slice(0, offset);
	const line = before.split('\n').length - 1;
	return { line, col: offset - (before.lastIndexOf('\n') + 1), offset };
}

export function parseFakeCache(text: string): FakeCache {
	const cache: FakeCache = {};
	const match = FRONTMATTER.exec(text);
	if (match) {
		const data = YAML.parse(match[1] ?? '') as Record<
			string,
			unknown
		> | null;
		cache.frontmatter = data ?? {};
		const links: NonNullable<FakeCache['frontmatterLinks']> = [];
		for (const [key, value] of Object.entries(cache.frontmatter)) {
			const values = Array.isArray(value) ? value : [value];
			values.forEach((item, index) => {
				if (typeof item !== 'string') return;
				const link = WIKILINK.exec(item);
				if (!link) return;
				links.push({
					key: Array.isArray(value) ? `${key}.${index}` : key,
					link: link[1] ?? '',
					original: item,
					displayText: link[2] ?? link[1] ?? '',
				});
			});
		}
		if (links.length > 0) cache.frontmatterLinks = links;
	}
	const bodyStart = match ? match[0].length : 0;
	const body = text.slice(bodyStart);
	for (const found of body.matchAll(BODY_LINK)) {
		const start = bodyStart + (found.index ?? 0);
		const reference: Reference = {
			link: found[2] ?? '',
			original: found[0],
			displayText: found[3] ?? found[2] ?? '',
			position: {
				start: locAt(text, start),
				end: locAt(text, start + found[0].length),
			},
		};
		const list =
			found[1] === '!' ? (cache.embeds ??= []) : (cache.links ??= []);
		list.push(reference);
	}
	addBlocks(cache, text, locAt(text, bodyStart).line);
	return cache;
}

/** 段落・箇条書きの項目・見出しをブロックに分け、最後の行末の ID と見出しを記録する */
function addBlocks(cache: FakeCache, text: string, firstLine: number): void {
	const lines = text.split('\n');
	const offsets: number[] = [];
	let total = 0;
	for (const line of lines) {
		offsets.push(total);
		total += line.length + 1;
	}
	const loc = (line: number, col: number): Loc => ({
		line,
		col,
		offset: (offsets[line] ?? 0) + col,
	});
	let start = -1;
	const close = (last: number) => {
		if (start < 0) return;
		const lastText = lines[last] ?? '';
		const found = BLOCK_ID.exec(lastText);
		if (found?.[1]) {
			const id = found[1].toLowerCase();
			(cache.blocks ??= {})[id] = {
				id,
				position: {
					start: loc(start, 0),
					end: loc(last, lastText.length),
				},
			};
		}
		start = -1;
	};
	let fenced = false;
	for (let i = firstLine; i < lines.length; i++) {
		const line = lines[i] ?? '';
		if (FENCE.test(line)) {
			close(i - 1);
			fenced = !fenced;
			continue;
		}
		if (fenced) continue;
		if (line.trim() === '') {
			close(i - 1);
			continue;
		}
		const heading = HEADING.exec(line);
		if (heading) {
			close(i - 1);
			(cache.headings ??= []).push({
				heading: heading[2] ?? '',
				level: heading[1]?.length ?? 1,
				position: { start: loc(i, 0), end: loc(i, line.length) },
			});
			start = i;
			close(i);
			continue;
		}
		if (LIST_ITEM.test(line)) close(i - 1);
		if (start < 0) start = i;
	}
	close(lines.length - 1);
}

export class FakeMetadataCache extends Events {
	resolvedLinks: Record<string, Record<string, number>> = {};
	unresolvedLinks: Record<string, Record<string, number>> = {};
	private readonly caches = new Map<string, FakeCache>();

	constructor(private readonly vault: FakeVault) {
		super();
		vault.on('create', (file: TAbstractFile) => this.index(file));
		vault.on('modify', (file: TAbstractFile) => this.index(file));
		vault.on('delete', (file: TAbstractFile) => this.remove(file));
		vault.on('rename', (file: TAbstractFile, oldPath: string) => {
			const cache = this.caches.get(oldPath);
			this.caches.delete(oldPath);
			delete this.resolvedLinks[oldPath];
			if (cache) this.caches.set(file.path, cache);
			this.reindexAll();
		});
	}

	getFileCache(file: TFile): FakeCache | null {
		return this.caches.get(file.path) ?? null;
	}

	getCache(path: string): FakeCache | null {
		return this.caches.get(path) ?? null;
	}

	/** パスが完全一致 → 名前が一意に一致（拡張子なしは .md を補う） */
	getFirstLinkpathDest(linkpath: string, _sourcePath: string): TFile | null {
		const exact =
			this.vault.getFileByPath(linkpath) ??
			this.vault.getFileByPath(`${linkpath}.md`);
		if (exact) return exact;
		const name = linkpath.includes('.') ? linkpath : `${linkpath}.md`;
		const matches = this.vault
			.getFiles()
			.filter((file) => file.name === name);
		return matches.length === 1 ? (matches[0] ?? null) : null;
	}

	fileToLinktext(file: TFile, _sourcePath: string): string {
		const sameName = this.vault
			.getFiles()
			.filter((other) => other.name === file.name);
		const text = sameName.length === 1 ? file.name : file.path;
		return text.endsWith('.md') ? text.slice(0, -3) : text;
	}

	private remove(file: TAbstractFile): void {
		if (!(file instanceof TFile)) return;
		const previous = this.caches.get(file.path) ?? null;
		this.caches.delete(file.path);
		delete this.resolvedLinks[file.path];
		this.trigger('deleted', file, previous);
	}

	private reindexAll(): void {
		for (const file of this.vault.getMarkdownFiles())
			this.index(file, false);
	}

	private index(file: TAbstractFile, notify = true): void {
		if (!(file instanceof TFile) || file.extension !== 'md') return;
		const text = this.vault.text(file.path) ?? '';
		const cache = parseFakeCache(text);
		this.caches.set(file.path, cache);
		const resolved: Record<string, number> = {};
		const references = [
			...(cache.frontmatterLinks ?? []),
			...(cache.links ?? []),
			...(cache.embeds ?? []),
		];
		for (const reference of references) {
			const path = reference.link.split('#')[0] ?? '';
			const target = this.getFirstLinkpathDest(path, file.path);
			if (target)
				resolved[target.path] = (resolved[target.path] ?? 0) + 1;
		}
		this.resolvedLinks[file.path] = resolved;
		if (!notify) return;
		this.trigger('changed', file, text, cache);
		this.trigger('resolve', file);
	}
}
