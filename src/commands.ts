import { FileView, MarkdownView, Notice, type Command } from 'obsidian';
import { t } from './i18n';
import type PdfToolsPlugin from './main';
import { cleanOrphans } from './orphans';
import { colorLabel } from './ui/labels';
import { PdfSuggestModal } from './ui/modals';
import { MAX_PEN_HEADING } from './lib/settings';
import { isPdfView } from './viewer/dom';
import type { ViewTools } from './viewer/tools';

/** 色ごとのコマンド（色を変えたら登録し直す） */
let paletteCommandIds: string[] = [];

function activePdfView(plugin: PdfToolsPlugin): FileView | null {
	const view = plugin.app.workspace.getActiveViewOfType(FileView);
	return view && isPdfView(view) ? view : null;
}

/** 選択範囲をハイライトするコマンドの中身（color が null なら今の色。書き方はペンの設定） */
function highlightCommand(
	plugin: PdfToolsPlugin,
	color: string | null,
): Command['checkCallback'] {
	return (checking) => {
		if (!activePdfView(plugin)) return false;
		if (checking) return true;
		const current = plugin.selection.currentSelection();
		if (!current) {
			new Notice(t('notice.noSelection'));
			return true;
		}
		const level = plugin.settings.defaultHeading;
		current.view.contentEl.doc.getSelection()?.removeAllRanges();
		plugin.selection.hide();
		void plugin.actions.createHighlight(current.view, current.result, {
			color: color ?? plugin.settings.defaultColor,
			headingLevel: level > 0 ? level : null,
			allowCreateNote: true,
		});
		return true;
	};
}

/** 今の PDF ビューの道具（無ければ null） */
function activeTools(plugin: PdfToolsPlugin): ViewTools | null {
	const view = activePdfView(plugin);
	return view ? plugin.viewer.toolsFor(view) : null;
}

// コマンド名にプラグイン名は付けない（Obsidian が自動で前に付ける）。id はリリース後に変えない。
export function registerCommands(plugin: PdfToolsPlugin): void {
	plugin.addCommand({
		id: 'flip',
		name: t('command.flip'),
		icon: 'repeat-2',
		checkCallback: (checking) => {
			const markdown =
				plugin.app.workspace.getActiveViewOfType(MarkdownView);
			const pdf = activePdfView(plugin);
			if (!(markdown?.file || pdf)) return false;
			if (!checking) {
				if (pdf) void plugin.flip.toNote(pdf);
				else if (markdown) void plugin.flip.toPdf(markdown);
			}
			return true;
		},
	});

	plugin.addCommand({
		id: 'attach-pdf',
		name: t('command.attachPdf'),
		icon: 'paperclip',
		checkCallback: (checking) => {
			const note =
				plugin.app.workspace.getActiveViewOfType(MarkdownView)?.file;
			if (!note) return false;
			if (!checking)
				new PdfSuggestModal(plugin.app, (pdf) => {
					void plugin.pairing.attach(note, pdf).then(() => {
						new Notice(t('notice.attached', { pdf: pdf.name }));
					});
				}).open();
			return true;
		},
	});

	plugin.addCommand({
		id: 'create-note-for-pdf',
		name: t('command.createNoteForPdf'),
		icon: 'file-plus',
		checkCallback: (checking) => {
			const view = activePdfView(plugin);
			if (!view) return false;
			if (!checking) void plugin.flip.toNote(view);
			return true;
		},
	});

	plugin.addCommand({
		id: 'highlight-selection',
		name: t('command.highlightSelection'),
		icon: 'highlighter',
		checkCallback: highlightCommand(plugin, null),
	});

	plugin.addCommand({
		id: 'open-highlight-in-pdf',
		name: t('command.openHighlightInPdf'),
		icon: 'book-open',
		editorCheckCallback: (checking, editor, info) => {
			const id = plugin.actions.idAtLine(editor, editor.getCursor().line);
			if (id === null) return false;
			if (!checking)
				void plugin.actions.openInPdf(id, {
					sourceLeaf: info instanceof MarkdownView ? info.leaf : null,
					newLeaf: false,
				});
			return true;
		},
	});

	plugin.addCommand({
		id: 'recolor-highlight-at-cursor',
		name: t('command.recolorHighlightAtCursor'),
		icon: 'palette',
		editorCheckCallback: (checking, editor) => {
			const id = plugin.actions.idAtLine(editor, editor.getCursor().line);
			if (id === null) return false;
			if (!checking) plugin.actions.chooseColor([id]);
			return true;
		},
	});

	plugin.addCommand({
		id: 'remove-highlight-at-cursor',
		name: t('command.removeHighlightAtCursor'),
		icon: 'trash-2',
		editorCheckCallback: (checking, editor) => {
			const id = plugin.actions.idAtLine(editor, editor.getCursor().line);
			if (id === null) return false;
			if (!checking)
				void plugin.actions.deleteHighlight([id], { type: 'line' });
			return true;
		},
	});

	plugin.addCommand({
		id: 'insert-under-heading',
		name: t('command.insertUnderHeading'),
		icon: 'arrow-down-to-line',
		editorCheckCallback: (checking, editor, info) => {
			const file = info.file;
			const heading = file
				? plugin.actions.insertHeadingAt(
						editor,
						file,
						editor.getCursor().line,
					)
				: null;
			if (!file || !heading) return false;
			if (!checking)
				void plugin.actions.setInsertHeading(file, heading.heading);
			return true;
		},
	});

	plugin.addCommand({
		id: 'clean-orphan-entries',
		name: t('command.cleanOrphanEntries'),
		icon: 'eraser',
		callback: () => void cleanOrphans(plugin),
	});

	plugin.addCommand({
		id: 'toggle-instant-highlight',
		name: t('command.toggleInstantHighlight'),
		icon: 'highlighter',
		callback: () => {
			const next =
				plugin.settings.selectAction === 'highlight'
					? 'none'
					: 'highlight';
			void plugin.setSelectAction(next).then(() => {
				new Notice(
					next === 'highlight'
						? t('notice.instantOn')
						: t('notice.instantOff'),
				);
			});
		},
	});

	// ペンの書き方（変えるまで続く）。0 は本文
	for (let level = 0; level <= MAX_PEN_HEADING; level++)
		plugin.addCommand({
			id: level === 0 ? 'pen-text' : `pen-heading-${level}`,
			name:
				level === 0
					? t('command.penText')
					: t('command.penHeading', { level }),
			icon: level === 0 ? 'pilcrow' : `heading-${level}`,
			callback: () => {
				void plugin.setPenHeading(level).then(() => {
					new Notice(
						level === 0
							? t('notice.penText')
							: t('notice.penHeading', { level }),
					);
				});
			},
		});

	plugin.addCommand({
		id: 'capture-region',
		name: t('command.captureRegion'),
		icon: 'crop',
		checkCallback: (checking) => {
			const tools = activeTools(plugin);
			if (!tools) return false;
			if (!checking) {
				tools.toggleRegion();
				if (tools.capturing) new Notice(t('notice.regionArmed'));
			}
			return true;
		},
	});

	plugin.addCommand({
		id: 'undo-last-highlight',
		name: t('command.undoLastHighlight'),
		icon: 'undo-2',
		callback: () => void plugin.actions.undoLast(),
	});

	registerPaletteCommands(plugin);
}

/** 色ごとの「選択範囲をハイライト（色）」。色を変えたら呼び直す */
export function registerPaletteCommands(plugin: PdfToolsPlugin): void {
	for (const id of paletteCommandIds) plugin.removeCommand(id);
	paletteCommandIds = [];
	for (const entry of plugin.settings.palette) {
		const id = `highlight-selection-${entry.name}`;
		plugin.addCommand({
			id,
			name: t('command.highlightSelectionWithColor', {
				color: colorLabel(entry),
			}),
			icon: 'highlighter',
			checkCallback: highlightCommand(plugin, entry.name),
		});
		paletteCommandIds.push(id);
	}
}
