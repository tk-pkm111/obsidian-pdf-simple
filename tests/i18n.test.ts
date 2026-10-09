import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/en';
import { messagesFor } from '../src/i18n';
import { ja } from '../src/i18n/ja';

const placeholders = (text: string) =>
	[...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n', () => {
	it('日本語なら日本語、それ以外は英語', () => {
		expect(messagesFor('ja')).toBe(ja);
		expect(messagesFor('ja-JP')).toBe(ja);
		expect(messagesFor('en')).toBe(en);
		expect(messagesFor('de')).toBe(en);
		expect(messagesFor('')).toBe(en);
	});

	it('英語の辞書は、日本語と同じキーと差し込み（{name} など）を持ち、空でない', () => {
		for (const key of Object.keys(ja) as Array<keyof typeof ja>) {
			expect(en[key], key).toBeTruthy();
			expect(placeholders(en[key]), key).toEqual(placeholders(ja[key]));
		}
		expect(Object.keys(en).sort()).toEqual(Object.keys(ja).sort());
	});
});
