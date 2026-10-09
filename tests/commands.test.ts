import { describe, expect, it } from 'vitest';
import { registerCommands, registerPaletteCommands } from '../src/commands';
import { normalizeSettings } from '../src/lib/settings';
import type PdfToolsPlugin from '../src/main';
import { Plugin } from './__mocks__/obsidian';

interface RegisteredCommand {
	id: string;
	name: string;
	checkCallback?: (checking: boolean) => boolean;
}

function setup(palette?: unknown): {
	plugin: PdfToolsPlugin;
	commands: () => RegisteredCommand[];
} {
	const mock = new Plugin({ workspace: { getActiveViewOfType: () => null } });
	const plugin = Object.assign(mock, {
		settings: normalizeSettings(palette === undefined ? {} : { palette }),
	}) as unknown as PdfToolsPlugin;
	registerCommands(plugin);
	return { plugin, commands: () => mock.commands as RegisteredCommand[] };
}

describe('registerCommands', () => {
	it('id は固定で、名前にプラグイン名を含めない', () => {
		const { commands } = setup();
		expect(commands().map((c) => c.id)).toEqual([
			'flip',
			'attach-pdf',
			'create-note-for-pdf',
			'highlight-selection',
			'open-highlight-in-pdf',
			'recolor-highlight-at-cursor',
			'remove-highlight-at-cursor',
			'insert-under-heading',
			'move-pdf-to-folder',
			'clean-orphan-entries',
			'toggle-instant-highlight',
			'pen-text',
			'pen-heading-1',
			'pen-heading-2',
			'pen-heading-3',
			'capture-region',
			'undo-last-highlight',
			'highlight-selection-yellow',
			'highlight-selection-red',
			'highlight-selection-green',
			'highlight-selection-blue',
			'highlight-selection-purple',
			'highlight-selection-orange',
		]);
		for (const command of commands())
			expect(command.name).not.toMatch(/pdf tools/i);
		expect(
			commands().find((c) => c.id === 'highlight-selection-red')?.name,
		).toBe('選択範囲をハイライト（赤）');
	});

	it('PDF やノートを開いていなければ、表裏・ハイライトのコマンドは出ない', () => {
		const { commands } = setup();
		for (const id of [
			'flip',
			'attach-pdf',
			'create-note-for-pdf',
			'highlight-selection',
			'capture-region',
		])
			expect(
				commands()
					.find((c) => c.id === id)
					?.checkCallback?.(true),
			).toBe(false);
	});

	it('色を変えたら、色ごとのコマンドを登録し直す', () => {
		const { plugin, commands } = setup();
		plugin.settings = normalizeSettings({
			palette: [{ name: 'pink', color: '#ff8fab', label: 'ピンク' }],
		});
		registerPaletteCommands(plugin);
		const ids = commands().map((c) => c.id);
		expect(
			ids.filter((id) => id.startsWith('highlight-selection-')),
		).toEqual(['highlight-selection-pink']);
		expect(
			commands().find((c) => c.id === 'highlight-selection-pink')?.name,
		).toBe('選択範囲をハイライト（ピンク）');
	});
});
