import { ENTRIES_PROPERTY, HEADING_PROPERTY } from './highlight-entry';
import { headingLevel } from './note-lines';
import { isColorName } from './pdf-subpath';
import type { PaletteEntry } from './types';

/** 入れる場所の中での並べ方: PDF の順 / 最後に足す */
export type InsertPosition = 'order' | 'end';
export type FlipMode = 'same-leaf' | 'split';
/** PDF で文字をマウスで選んだとき: すぐ塗る / 色の吹き出しを出す / 何もしない */
export type SelectAction = 'highlight' | 'popup' | 'none';

/** data.json の形の版。上げたときは normalizeSettings に移し方を書く */
export const SETTINGS_VERSION = 4;

/** ペンで書く見出しの大きさの上限（メニューに出すのは 1〜3） */
export const MAX_PEN_HEADING = 3;

export interface PdfToolsSettings {
	settingsVersion: number;
	/** ハイライトの色（並び順がそのまま吹き出しとメニューの並び） */
	palette: PaletteEntry[];
	/** いまの色（すぐ塗るとき・色を指定しないコマンドで使う色の name） */
	defaultColor: string;
	/** PDF で文字をマウスで選んだときの動き */
	selectAction: SelectAction;
	/** いまの書き方: 0 は本文、1〜3 は見出しの大きさ（ペンの設定。変えるまで続く） */
	defaultHeading: number;
	/** 入れる場所の中での並べ方 */
	insertPosition: InsertPosition;
	/**
	 * ハイライトを入れる見出し（入力欄の文字のまま。1 行に 1 つ、`## Summary` か `Summary`）。
	 * その見出しがあるノートでは、その節に入れる。無ければ本文の最後
	 */
	insertHeading: string;
	/** 行頭に `- ` を付ける */
	bulletList: boolean;
	/** 表⇄裏を同じタブで入れ替えるか、分割して並べるか */
	flipMode: FlipMode;
	/** ノートと PDF の対応を書くプロパティ */
	pairingProperty: string;
	/** ノートのプロパティ欄で pdf-highlights の行を隠す */
	hideEntriesProperty: boolean;
}

/** 既定の色（白い紙面の上で読みやすい蛍光ペンの色） */
export const DEFAULT_PALETTE: readonly PaletteEntry[] = [
	{ name: 'yellow', color: '#ffd400', label: '' },
	{ name: 'red', color: '#ff6666', label: '' },
	{ name: 'green', color: '#5fb236', label: '' },
	{ name: 'blue', color: '#2ea8e5', label: '' },
	{ name: 'purple', color: '#a28ae5', label: '' },
	{ name: 'orange', color: '#f19837', label: '' },
];

export const DEFAULT_SETTINGS: Readonly<PdfToolsSettings> = {
	settingsVersion: SETTINGS_VERSION,
	palette: DEFAULT_PALETTE.map((entry) => ({ ...entry })),
	defaultColor: 'yellow',
	selectAction: 'highlight',
	defaultHeading: 0,
	insertPosition: 'order',
	insertHeading: '',
	bulletList: false,
	flipMode: 'same-leaf',
	pairingProperty: 'pdf',
	hideEntriesProperty: true,
};

/** `#rgb` / `#rrggbb` を小文字の `#rrggbb` に。違えば null */
export function normalizeHex(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const hex = value.trim().toLowerCase();
	if (/^#[0-9a-f]{6}$/.test(hex)) return hex;
	const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(hex);
	return short
		? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
		: null;
}

/** このプラグインが使うプロパティの名前か */
export function isReservedProperty(value: string): boolean {
	const trimmed = value.trim();
	return trimmed === ENTRIES_PROPERTY || trimmed === HEADING_PROPERTY;
}

/** ペアリングのプロパティ名として使えるか（空でなく、YAML とリンクの読み取りを壊す文字を含まず、このプラグインの記録のプロパティと別） */
export function isValidPropertyName(value: string): boolean {
	const trimmed = value.trim();
	return (
		trimmed !== '' &&
		trimmed === value &&
		!isReservedProperty(trimmed) &&
		!/[.:#[\]{},"'`|>&*!%@\n\r\t]/.test(trimmed)
	);
}

/** 保存し直す必要がある（古い版の data.json）か */
export function needsMigration(raw: unknown): boolean {
	return (
		typeof raw === 'object' &&
		raw !== null &&
		(raw as Record<string, unknown>).settingsVersion !== SETTINGS_VERSION
	);
}

function normalizePalette(raw: unknown): PaletteEntry[] {
	if (!Array.isArray(raw))
		return DEFAULT_PALETTE.map((entry) => ({ ...entry }));
	const palette: PaletteEntry[] = [];
	for (const item of raw as unknown[]) {
		if (typeof item !== 'object' || item === null) continue;
		const record = item as Record<string, unknown>;
		const name = typeof record.name === 'string' ? record.name.trim() : '';
		const color = normalizeHex(record.color);
		if (!isColorName(name) || color === null) continue;
		if (palette.some((entry) => entry.name === name)) continue;
		const label =
			typeof record.label === 'string' ? record.label.trim() : '';
		palette.push({ name, color, label });
	}
	return palette.length > 0
		? palette
		: DEFAULT_PALETTE.map((entry) => ({ ...entry }));
}

/**
 * data.json の中身を検証して、欠けているところを既定値で埋める。
 * 版の無いもの（第 1 弾）は移す: 吹き出しの設定 → 文字を選んだときの動き、箇条書き → オフ
 * （第 1 弾は設定画面を開くと既定値ごと保存していたので、保存された true はユーザーが選んだ値とは限らない）。
 * 版 3 までの「見出しの下」は、その見出しを「ハイライトを入れる見出し」にして PDF の順に並べる。
 */
export function normalizeSettings(raw: unknown): PdfToolsSettings {
	const data =
		typeof raw === 'object' && raw !== null
			? (raw as Record<string, unknown>)
			: {};
	const version =
		typeof data.settingsVersion === 'number' ? data.settingsVersion : 1;
	const legacy = version < 2;
	const palette = normalizePalette(data.palette);
	const pick = <T extends string>(
		value: unknown,
		allowed: readonly T[],
		fallback: T,
	): T => allowed.find((option) => option === value) ?? fallback;
	const text = (value: unknown, fallback: string): string =>
		typeof value === 'string' ? value : fallback;
	const property = (value: unknown, fallback: string): string =>
		typeof value === 'string' && isValidPropertyName(value)
			? value
			: fallback;

	const defaultColor =
		typeof data.defaultColor === 'string' &&
		palette.some((entry) => entry.name === data.defaultColor)
			? data.defaultColor
			: (palette[0]?.name ?? DEFAULT_SETTINGS.defaultColor);
	const selectAction = legacy
		? data.showSelectionPopup === false
			? 'none'
			: 'highlight'
		: pick(
				data.selectAction,
				['highlight', 'popup', 'none'] as const,
				DEFAULT_SETTINGS.selectAction,
			);
	const bool = (value: unknown, fallback: boolean): boolean =>
		typeof value === 'boolean' ? value : fallback;
	const position = pick(
		data.insertPosition,
		['order', 'end', 'heading'] as const,
		DEFAULT_SETTINGS.insertPosition,
	);
	// 版 3 で「PDF の順に並べる」を足して既定にした。それまでの既定（末尾）は既定値ごと保存されていたので移す
	const insertPosition: InsertPosition =
		position === 'heading' || (version < 3 && position === 'end')
			? 'order'
			: position;
	// 版 4 で、見出しを「並べ方」と別の設定にした（空なら本文の最後）。
	// 版 3 までは「見出しの下」のときだけ使い、# が無ければ ## を付け、空なら「## ハイライト」だった。
	// ほかのときの値（保存されていた既定値）は使わない
	const legacyText = text(data.insertHeading, '').trim();
	const legacyHeading =
		legacyText === ''
			? '## ハイライト'
			: headingLevel(legacyText) > 0
				? legacyText
				: `## ${legacyText}`;
	const insertHeading =
		version >= 4
			? text(data.insertHeading, DEFAULT_SETTINGS.insertHeading)
			: position === 'heading'
				? legacyHeading
				: '';
	const heading = Number(data.defaultHeading);

	return {
		settingsVersion: SETTINGS_VERSION,
		palette,
		defaultColor,
		selectAction,
		defaultHeading:
			Number.isInteger(heading) &&
			heading >= 0 &&
			heading <= MAX_PEN_HEADING
				? heading
				: DEFAULT_SETTINGS.defaultHeading,
		insertPosition,
		insertHeading,
		bulletList: legacy
			? false
			: bool(data.bulletList, DEFAULT_SETTINGS.bulletList),
		flipMode: pick(
			data.flipMode,
			['same-leaf', 'split'] as const,
			'same-leaf',
		),
		pairingProperty: property(
			data.pairingProperty,
			DEFAULT_SETTINGS.pairingProperty,
		),
		hideEntriesProperty: bool(
			data.hideEntriesProperty,
			DEFAULT_SETTINGS.hideEntriesProperty,
		),
	};
}

/** 色の name → hex（無い name なら既定の色、それも無ければ最初の色） */
export function paletteHex(
	settings: PdfToolsSettings,
	name: string | null,
): string {
	const entry =
		settings.palette.find((item) => item.name === name) ??
		settings.palette.find((item) => item.name === settings.defaultColor) ??
		settings.palette[0];
	return entry?.color ?? DEFAULT_PALETTE[0]?.color ?? '#ffd400';
}
