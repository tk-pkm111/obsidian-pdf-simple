import { ja } from './ja';

/**
 * UI 文言の参照。いまは日本語のみ。英語 UI を出すときは言語ごとの辞書を足して切り替える。
 * ファイルに書く書式（見出し・列名など）は文言ではなく形式なので、ここには置かない。
 */
export type MessageKey = keyof typeof ja;

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(
	key: MessageKey,
	vars?: Record<string, string | number>,
): string {
	const template: string = ja[key];
	if (!vars) return template;
	return template.replace(PLACEHOLDER, (whole, name: string) => {
		const value = vars[name];
		return value === undefined ? whole : String(value);
	});
}

/** 文字列が辞書のキーか（色の名前など、実行時に組み立てるキー用） */
export function hasMessage(key: string): key is MessageKey {
	return Object.prototype.hasOwnProperty.call(ja, key);
}
