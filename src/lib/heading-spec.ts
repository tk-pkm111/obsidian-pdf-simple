import { headingLevel } from './note-lines';

/**
 * ハイライトを入れる見出しの指定と、見出しの行との照合。
 * 設定の「ハイライトを入れる見出し」（1 行に 1 つ）と、ノートのプロパティ pdf-highlights-heading に書く形。
 */

/** 見出しの行の名前（行頭の #、末尾の # の並びとブロック ID を除き、続く空白を 1 つに） */
export function headingName(text: string): string {
	return text
		.replace(/^\s{0,3}#{1,6}(?=[ \t]|$)/, '')
		.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/, '')
		.replace(/(?:^|[ \t])#+[ \t]*$/, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/** 見出しの行の形（`## Summary`。末尾の # の並びとブロック ID は除く） */
export function headingForm(text: string): string {
	return `${'#'.repeat(headingLevel(text))} ${headingName(text)}`;
}

/**
 * 見出しの指定（設定の「ハイライトを入れる見出し」と、プロパティ pdf-highlights-heading に書く形）。
 * Markdown の見出しと同じ `## Summary` なら大きさ（# の数）も、`Summary` なら名前だけを比べる。
 * 名前は大文字・小文字も含めて同じものだけ（続く空白は 1 つとみなす）。
 */
export interface HeadingSpec {
	/** 0 なら大きさを問わない */
	level: number;
	name: string;
}

/** 見出しの指定を読む（`##Summary` のように # の後に空白が無いもの・名前が無いものは null） */
export function parseHeadingSpec(value: string): HeadingSpec | null {
	const trimmed = value.trim();
	if (trimmed === '') return null;
	if (!trimmed.startsWith('#'))
		return { level: 0, name: trimmed.replace(/\s+/g, ' ') };
	const level = /^(#{1,6})[ \t]+\S/.exec(trimmed)?.[1]?.length ?? 0;
	const name = headingName(trimmed);
	return level === 0 || name === '' ? null : { level, name };
}

/** 設定の「ハイライトを入れる見出し」（1 行に 1 つ）の指定。読めない行は飛ばす */
export function headingSpecs(text: string): HeadingSpec[] {
	return text
		.split(/\r?\n/)
		.map(parseHeadingSpec)
		.filter((spec): spec is HeadingSpec => spec !== null);
}

/** 書き方の誤り（# の後に空白が無い・# が 7 つ以上・名前が無い）がある最初の行（無ければ null） */
export function invalidHeadingLine(text: string): string | null {
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed !== '' && parseHeadingSpec(trimmed) === null)
			return trimmed;
	}
	return null;
}

/** 見出しの行が指定に合うか */
export function matchesHeading(spec: HeadingSpec, text: string): boolean {
	const level = headingLevel(text);
	if (level === 0 || (spec.level > 0 && spec.level !== level)) return false;
	return headingName(text) === spec.name;
}
