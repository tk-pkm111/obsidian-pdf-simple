import { Notice } from 'obsidian';
import { t } from './i18n';
import type PdfToolsPlugin from './main';
import { noteName } from './ui/labels';
import { confirmDelete } from './ui/modals';

const ORPHAN_PREVIEW = 8;

/**
 * 本文に無いハイライト項目をプロパティから消す（確認してから）。
 * 段落の途中にあって認識されていないだけの ID は消さないよう、全ノートの本文を読んで確かめる。
 */
export async function cleanOrphans(plugin: PdfToolsPlugin): Promise<void> {
	const { vault } = plugin.app;
	const present = new Set<string>();
	for (const file of vault.getMarkdownFiles()) {
		const content = await vault.cachedRead(file);
		for (const match of content.matchAll(/\^(hl-[a-z0-9-]+)/gi))
			if (match[1]) present.add(match[1].toLowerCase());
	}
	const orphans = plugin.highlights.index
		.orphanEntries()
		.filter((entry) => !present.has(entry.id));
	if (orphans.length === 0) {
		new Notice(t('notice.orphansNone'));
		return;
	}
	const body = createFragment((fragment) => {
		fragment.createEl('p', {
			text: t('modal.orphansBody', { count: orphans.length }),
		});
		const list = fragment.createEl('ul');
		for (const entry of orphans.slice(0, ORPHAN_PREVIEW))
			list.createEl('li', {
				text: `${noteName(entry.notePath)}: ${entry.label}`,
			});
		if (orphans.length > ORPHAN_PREVIEW)
			list.createEl('li', {
				text: t('modal.orphansMore', {
					count: orphans.length - ORPHAN_PREVIEW,
				}),
			});
	});
	confirmDelete(plugin.app, t('modal.orphansTitle'), body, async () => {
		const ids = new Set(orphans.map((entry) => entry.id));
		const notes = [...new Set(orphans.map((entry) => entry.notePath))];
		await plugin.writer.removeEntries(notes, ids);
		new Notice(t('notice.orphansRemoved', { count: ids.size }));
	});
}
