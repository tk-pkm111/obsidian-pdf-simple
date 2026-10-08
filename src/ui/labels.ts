import { hasMessage, t } from '../i18n';
import type { PaletteEntry } from '../lib/types';

/** 色の表示名（設定の表示名 → 既定の訳語 → 識別名） */
export function colorLabel(entry: PaletteEntry): string {
	if (entry.label !== '') return entry.label;
	const key = `color.${entry.name}`;
	return hasMessage(key) ? t(key) : entry.name;
}

/** ノートの表示名（パスからフォルダと .md を除いたもの） */
export function noteName(path: string): string {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return name.endsWith('.md') ? name.slice(0, -3) : name;
}

/** 「本文」「見出し 2」など、書き方の名前（0 は本文） */
export function headingKindLabel(level: number): string {
	return level === 0 ? t('menu.kindText') : t('menu.headingLevel', { level });
}
