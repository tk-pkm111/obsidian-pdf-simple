/**
 * wikilink（[[…]]）の文字列を扱う。
 * linktext は [[ と ]] の間のうち別名（| 以降）を除いた部分で、Obsidian の parseLinktext と同じく
 * 最初の # より前がパス、# から後ろ（# を含む）がサブパス。
 */

export function splitLinktext(linktext: string): {
	path: string;
	subpath: string;
} {
	const hash = linktext.indexOf('#');
	return hash < 0
		? { path: linktext, subpath: '' }
		: { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}

export interface Wikilink {
	embed: boolean;
	/** パス + サブパス */
	linktext: string;
	alias: string | null;
}

const WIKILINK = /^\s*(!?)\[\[([^[\]|]*)(?:\|([^[\]]*))?\]\]\s*$/;

/** 文字列全体が 1 つの wikilink のときだけ分解する */
export function parseWikilink(text: string): Wikilink | null {
	const match = WIKILINK.exec(text);
	if (!match) return null;
	return {
		embed: match[1] === '!',
		linktext: match[2] ?? '',
		alias: match[3] ?? null,
	};
}

export function formatWikilink(link: Wikilink): string {
	const alias = link.alias === null ? '' : `|${link.alias}`;
	return `${link.embed ? '!' : ''}[[${link.linktext}${alias}]]`;
}

/** wikilink のパスに入れると壊れる文字（# ^ [ ] |）を含まないか */
export function isLinkSafePath(path: string): boolean {
	return !/[#^[\]|]/.test(path);
}
