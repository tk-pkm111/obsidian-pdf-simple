import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	SETTINGS_VERSION,
	isValidPropertyName,
	needsMigration,
	normalizeHex,
	normalizeSettings,
	paletteHex,
} from '../../src/lib/settings';

describe('normalizeSettings', () => {
	it('何も無ければ既定値', () => {
		expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
	});

	it('不正な値は既定値に戻す', () => {
		const settings = normalizeSettings({
			settingsVersion: SETTINGS_VERSION,
			insertPosition: 'middle',
			flipMode: 'window',
			selectAction: 'always',
			bulletList: 'yes',
			pairingProperty: 'a.b',
			hideEntriesProperty: 'no',
		});
		expect(settings.insertPosition).toBe('order');
		expect(settings.flipMode).toBe('same-leaf');
		expect(settings.selectAction).toBe('highlight');
		expect(settings.bulletList).toBe(false);
		expect(settings.pairingProperty).toBe('pdf');
		expect(settings.hideEntriesProperty).toBe(true);
	});

	it('版の無い設定（第 1 弾）を移す', () => {
		const settings = normalizeSettings({
			bulletList: true,
			showSelectionPopup: false,
			flipMode: 'split',
			entriesProperty: 'pdf-highlights',
		});
		expect(settings.settingsVersion).toBe(SETTINGS_VERSION);
		expect(settings.bulletList).toBe(false);
		expect(settings.selectAction).toBe('none');
		expect(settings.flipMode).toBe('split');
		expect(settings).not.toHaveProperty('entriesProperty');
		expect(settings).not.toHaveProperty('showSelectionPopup');
		expect(
			normalizeSettings({ showSelectionPopup: true }).selectAction,
		).toBe('highlight');
	});

	it('今の版の設定はそのまま読む', () => {
		const settings = normalizeSettings({
			settingsVersion: SETTINGS_VERSION,
			bulletList: true,
			selectAction: 'popup',
			hideEntriesProperty: false,
		});
		expect(settings.bulletList).toBe(true);
		expect(settings.selectAction).toBe('popup');
		expect(settings.hideEntriesProperty).toBe(false);
	});

	it('版 2 までの「ノートの末尾」は「PDF の順」に移す', () => {
		expect(
			normalizeSettings({ settingsVersion: 2, insertPosition: 'end' })
				.insertPosition,
		).toBe('order');
		expect(
			normalizeSettings({
				settingsVersion: SETTINGS_VERSION,
				insertPosition: 'end',
			}).insertPosition,
		).toBe('end');
	});

	it('版 3 までの「見出しの下」は、その見出しを入れる見出しにして PDF の順に並べる', () => {
		const heading = normalizeSettings({
			settingsVersion: 3,
			insertPosition: 'heading',
			insertHeading: '## メモ',
		});
		expect(heading.insertPosition).toBe('order');
		expect(heading.insertHeading).toBe('メモ');
		expect(
			normalizeSettings({ settingsVersion: 2, insertPosition: 'heading' })
				.insertHeading,
		).toBe('ハイライト');
		// 見出しの下でなかったときの値（保存されていた既定値）は使わない
		expect(
			normalizeSettings({
				settingsVersion: 3,
				insertPosition: 'order',
				insertHeading: '## ハイライト',
			}).insertHeading,
		).toBe('');
		expect(
			normalizeSettings({
				settingsVersion: SETTINGS_VERSION,
				insertHeading: 'Summary',
			}).insertHeading,
		).toBe('Summary');
	});

	it('ペンの書き方は 0（本文）〜 3', () => {
		const read = (value: unknown) =>
			normalizeSettings({
				settingsVersion: SETTINGS_VERSION,
				defaultHeading: value,
			}).defaultHeading;
		expect(read(2)).toBe(2);
		expect(read(0)).toBe(0);
		expect(read(7)).toBe(0);
		expect(read('x')).toBe(0);
		expect(read(1.5)).toBe(0);
	});

	it('移す必要があるか', () => {
		expect(needsMigration({ bulletList: true })).toBe(true);
		expect(needsMigration({ settingsVersion: 2 })).toBe(true);
		expect(needsMigration({ settingsVersion: SETTINGS_VERSION })).toBe(
			false,
		);
		expect(needsMigration(null)).toBe(false);
	});

	it('色: 名前・hex を検証し、重複を捨て、空なら既定の色', () => {
		const settings = normalizeSettings({
			palette: [
				{ name: 'pink', color: '#F0A', label: ' ピンク ' },
				{ name: 'pink', color: '#000000' },
				{ name: 'Bad Name', color: '#000000' },
				{ name: 'gray', color: 'gray' },
				'junk',
			],
			defaultColor: 'yellow',
		});
		expect(settings.palette).toEqual([
			{ name: 'pink', color: '#ff00aa', label: 'ピンク' },
		]);
		expect(settings.defaultColor).toBe('pink');
		expect(normalizeSettings({ palette: [] }).palette).toEqual(
			DEFAULT_SETTINGS.palette,
		);
	});

	it('ペアリングのプロパティに記録のプロパティ名は使えない', () => {
		expect(
			normalizeSettings({
				settingsVersion: SETTINGS_VERSION,
				pairingProperty: 'pdf-highlights',
			}).pairingProperty,
		).toBe('pdf');
	});

	it('既定の配列を共有しない', () => {
		const a = normalizeSettings({});
		a.palette.push({ name: 'x', color: '#000000', label: '' });
		expect(normalizeSettings({}).palette).toHaveLength(6);
	});
});

describe('normalizeHex / isValidPropertyName / paletteHex', () => {
	it('hex', () => {
		expect(normalizeHex('#ABCDEF')).toBe('#abcdef');
		expect(normalizeHex('#abc')).toBe('#aabbcc');
		expect(normalizeHex('abc')).toBeNull();
		expect(normalizeHex(1)).toBeNull();
	});

	it('プロパティ名', () => {
		expect(isValidPropertyName('pdf')).toBe(true);
		expect(isValidPropertyName('論文 PDF')).toBe(true);
		for (const bad of [
			'',
			' pdf',
			'a.b',
			'a:b',
			'a#b',
			'a[b]',
			'pdf-highlights',
			'pdf-highlights-heading',
		])
			expect(isValidPropertyName(bad)).toBe(false);
	});

	it('色の名前 → hex（無ければ既定の色）', () => {
		expect(paletteHex(DEFAULT_SETTINGS, 'red')).toBe('#ff6666');
		expect(paletteHex(DEFAULT_SETTINGS, 'unknown')).toBe('#ffd400');
		expect(paletteHex(DEFAULT_SETTINGS, null)).toBe('#ffd400');
	});
});
