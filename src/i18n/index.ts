import { getLanguage } from 'obsidian';
import { en } from './en';
import { ja } from './ja';

/**
 * UI 文言の参照。Obsidian の表示言語が日本語なら日本語、それ以外は英語
 * （Obsidian は言語を変えると再起動するので、最初に使うときに一度だけ決める）。
 * ファイルに書く書式（見出し・列名など）は文言ではなく形式なので、ここには置かない。
 */
export type MessageKey = keyof typeof ja;

/** 表示言語の辞書（ja で始まれば日本語、それ以外は英語） */
export function messagesFor(language: string): Record<MessageKey, string> {
	return language.toLowerCase().startsWith('ja') ? ja : en;
}

let messages: Record<MessageKey, string> | null = null;

function dictionary(): Record<MessageKey, string> {
	messages ??= messagesFor(getLanguage());
	return messages;
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function t(
	key: MessageKey,
	vars?: Record<string, string | number>,
): string {
	const template: string = dictionary()[key];
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
