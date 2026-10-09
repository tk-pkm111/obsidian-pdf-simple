/**
 * サービス層のテスト用に、仮想 vault の上で動くプラグインの最小構成を作る。
 */
import { HighlightService } from '../../src/index/highlight-service';
import { PairingService } from '../../src/index/pairing-service';
import {
	SETTINGS_VERSION,
	normalizeSettings,
	type PdfSimpleSettings,
} from '../../src/lib/settings';
import type PdfSimplePlugin from '../../src/main';
import { NoteWriter } from '../../src/note/note-writer';
import { PdfStorage } from '../../src/pdf-storage';
import { createFakeApp, type FakeApp } from './fake-app';

export interface TestPlugin extends FakeApp {
	plugin: PdfSimplePlugin;
	highlights: HighlightService;
	writer: NoteWriter;
	pairing: PairingService;
	storage: PdfStorage;
}

export const PDF_PATH = 'PDF/doc.pdf';

/** 本文 1 行・プロパティ 1 要素のハイライトを持つノートの中身 */
export function noteWith(
	entries: string[],
	body: string,
	pairing: string | null = '[[doc.pdf]]',
): string {
	const lines = ['---'];
	if (pairing !== null) lines.push(`pdf: "${pairing}"`);
	if (entries.length > 0) {
		lines.push('pdf-highlights:');
		for (const entry of entries) lines.push(`  - "${entry}"`);
	}
	lines.push('---', '', body);
	return `${lines.join('\n')}\n`;
}

export function entryText(
	id: string,
	page = 2,
	b = 2,
	color = 'yellow',
): string {
	return `[[doc.pdf#page=${page}&selection=${b},0,${b + 1},4&color=${color}&id=${id}|p.${page} text ${id}]]`;
}

export async function createTestPlugin(
	settings: Partial<PdfSimpleSettings> = {},
): Promise<TestPlugin> {
	const fake = createFakeApp();
	const plugin = {
		app: fake.app,
		settings: normalizeSettings({
			settingsVersion: SETTINGS_VERSION,
			...settings,
		}),
	} as unknown as PdfSimplePlugin;
	const highlights = new HighlightService(plugin);
	const writer = new NoteWriter(plugin);
	const pairing = new PairingService(plugin);
	const storage = new PdfStorage(plugin);
	Object.assign(plugin, { highlights, writer, pairing, storage });
	await fake.vault.createFolder('PDF');
	await fake.vault.create(PDF_PATH, '%PDF-1.7');
	highlights.load();
	return { ...fake, plugin, highlights, writer, pairing, storage };
}
