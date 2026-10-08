import { Menu, Notice, type Editor, type FileView } from 'obsidian';
import { t } from './i18n';
import {
	buildBodyLine,
	buildEntryString,
	entryLabel,
	findBlockId,
	generateId,
} from './lib/highlight-entry';
import { isLinkSafePath } from './lib/linktext';
import { headingLevelInSection, type OrderKey } from './lib/note-insert';
import type { RemoveMode } from './lib/note-remove';
import { anchorKey } from './lib/pdf-selection';
import { joinPdfLines } from './lib/paragraphs';
import { readingPosition, type SpanBox } from './lib/reading-order';
import { escapeNoteText, normalizeSelectedText } from './lib/text';
import type { BlockRef, Highlight, PdfAnchor } from './lib/types';
import type PdfToolsPlugin from './main';
import type { InsertOrder } from './note/note-writer';
import { revealBlock, revealInPdf, type OpenOptions } from './note/navigate';
import { noteName } from './ui/labels';
import { ColorSuggestModal, HeadingSuggestModal } from './ui/modals';
import { spanBoxes } from './viewer/reading-order';
import { selectionLines, type SelectionResult } from './viewer/text-range';

export interface CreateOptions {
	color: string;
	/** 見出しとして入れるなら 1〜6 */
	headingLevel?: number | null;
	/** ペアのノートが無ければ作ってよいか（ボタンやコマンドで選んだとき。すぐ塗るときは作らない） */
	allowCreateNote?: boolean;
}

/** ノートに書くハイライト 1 件（本文の行とプロパティの要素） */
export interface NewHighlight {
	view: FileView;
	page: number;
	anchor: PdfAnchor;
	color: string;
	label: string;
	allowCreateNote: boolean;
	/** ID とノートが決まってから本文の行を作る（画像はファイルを保存してから） */
	line: (id: string, notePath: string) => Promise<string | null>;
}

/** コマンド・メニュー・クリックから呼ぶ操作 */
export class HighlightActions {
	/** 書き込みを 1 件ずつ順番に行う（続けて選んでもノートへの書き込みが重ならないように） */
	private queue: Promise<unknown> = Promise.resolve();
	private lastCreated: string | null = null;

	constructor(private readonly plugin: PdfToolsPlugin) {}

	/** 前の書き込みが終わってから task を実行する */
	enqueue<T>(task: () => Promise<T>): Promise<T> {
		const run = this.queue.then(task, task);
		this.queue = run.catch(() => undefined);
		return run;
	}

	/**
	 * PDF の選択範囲からハイライト（見出し）を作る。
	 * 文は段落の形に戻して入れる（折り返しはつなぎ、段落・箇条書きの切れ目は改行のまま。見出しは 1 行）。
	 */
	createHighlight(
		view: FileView,
		result: SelectionResult,
		options: CreateOptions,
	): Promise<void> {
		const lines = selectionLines(result);
		const structured = lines
			? joinPdfLines(lines.lines, lines.columnRight)
			: normalizeSelectedText(result.text);
		const paragraphs = structured
			.split('\n')
			.map((line) => normalizeSelectedText(line))
			.filter((line) => line !== '');
		const text = normalizeSelectedText(paragraphs.join('\n'));
		if (text === '') {
			new Notice(t('notice.emptySelection'));
			return Promise.resolve();
		}
		const { settings } = this.plugin;
		const insert = {
			position: settings.insertPosition,
			heading: settings.insertHeading,
		};
		const level = options.headingLevel ?? null;
		return this.add({
			view,
			page: result.page,
			anchor: { type: 'text', selection: result.selection },
			color: options.color,
			label: entryLabel(result.page, text),
			allowCreateNote: options.allowCreateNote ?? true,
			line: (id) =>
				Promise.resolve(
					level !== null
						? buildBodyLine({
								kind: 'heading',
								text: escapeNoteText(text),
								id,
								level: headingLevelInSection(level, insert),
							})
						: buildBodyLine({
								kind: 'text',
								text: paragraphs.map(escapeNoteText).join('\n'),
								id,
								bullet: settings.bulletList,
							}),
				),
		});
	}

	/** ハイライトを 1 件書く: ノートに 1 行とプロパティ 1 要素を書き、すぐに描く */
	add(item: NewHighlight): Promise<void> {
		return this.enqueue(async () => {
			const pdf = item.view.file;
			if (!pdf) return;
			if (!isLinkSafePath(pdf.path)) {
				new Notice(t('notice.unsafePdfName'), 8000);
				return;
			}
			const { highlights, writer, app } = this.plugin;
			const key = anchorKey(item.page, item.anchor);
			if (highlights.index.forPdf(pdf.path).some((h) => h.key === key)) {
				new Notice(t('notice.duplicateHighlight'));
				return;
			}
			const note = await this.plugin.flip.noteFor(
				item.view.leaf,
				pdf,
				item.allowCreateNote,
			);
			if (!note) return;
			const id = generateId((candidate) =>
				highlights.index.hasId(candidate),
			);
			try {
				const line = await item.line(id, note.path);
				if (line === null) return;
				const entry = buildEntryString({
					linktext: app.metadataCache.fileToLinktext(pdf, note.path),
					page: item.page,
					anchor: item.anchor,
					color: item.color,
					id,
					label: item.label,
				});
				highlights.addPending({
					entry: {
						id,
						notePath: note.path,
						pdfPath: pdf.path,
						page: item.page,
						anchor: item.anchor,
						color: item.color,
						label: item.label,
					},
					block: { id, notePath: note.path, line: 0 },
					createdAt: Date.now(),
				});
				await writer.insertHighlight(
					note,
					line,
					entry,
					this.orderOf(item, pdf.path),
				);
				this.lastCreated = id;
			} catch (error) {
				console.error(error);
				new Notice(
					t('notice.highlightFailed', { message: String(error) }),
					8000,
				);
			}
		});
	}

	/**
	 * PDF の順に入れるための位置。同じページのものは読む順（画像の範囲はテキスト層から求める）、
	 * ほかのページのものはページで比べる。別の PDF のハイライトは比べない。
	 */
	private orderOf(item: NewHighlight, pdfPath: string): InsertOrder {
		let spans: SpanBox[] | null | undefined;
		const position = (anchor: PdfAnchor): number => {
			if (anchor.type === 'region' && spans === undefined)
				spans = spanBoxes(item.view.contentEl, item.page);
			return readingPosition(anchor, spans ?? null);
		};
		const { index } = this.plugin.highlights;
		return {
			key: { page: item.page, pos: position(item.anchor) },
			keyOf: (id): OrderKey | null => {
				const entry = index.entry(id);
				if (!entry || entry.pdfPath !== pdfPath) return null;
				return {
					page: entry.page,
					pos: entry.page === item.page ? position(entry.anchor) : 0,
				};
			},
		};
	}

	/** 直前に作ったハイライトを取り消す（行ごと消す） */
	async undoLast(): Promise<void> {
		const id = this.lastCreated;
		if (id === null || this.plugin.highlights.index.entry(id) === null) {
			new Notice(t('notice.nothingToUndo'));
			return;
		}
		this.lastCreated = null;
		await this.deleteHighlight([id], { type: 'line' });
	}

	/** PDF のハイライト → ノートの該当行（行き先が複数なら選ばせる） */
	async openInNote(
		highlight: Highlight,
		options: OpenOptions & { evt?: MouseEvent },
	): Promise<void> {
		if (highlight.blocks.length > 1 && options.evt) {
			const menu = new Menu();
			for (const block of highlight.blocks)
				menu.addItem((item) =>
					item
						.setTitle(
							t('menu.openNoteIn', {
								name: noteName(block.notePath),
							}),
						)
						.setIcon('file-text')
						.onClick(() => void this.openBlock(block, options)),
				);
			menu.showAtMouseEvent(options.evt);
			return;
		}
		const block = highlight.blocks[0];
		if (block) await this.openBlock(block, options);
	}

	async openBlock(block: BlockRef, options: OpenOptions): Promise<void> {
		await revealBlock(this.plugin, block, options);
	}

	/** ノートのハイライト → PDF の該当箇所 */
	async openInPdf(id: string, options: OpenOptions): Promise<void> {
		const entry = this.plugin.highlights.index.entry(id);
		if (!entry) {
			new Notice(t('notice.notHighlightLine'));
			return;
		}
		await revealInPdf(this.plugin, entry, options);
	}

	chooseColor(ids: readonly string[]): void {
		new ColorSuggestModal(
			this.plugin.app,
			this.plugin.settings.palette,
			(entry) => {
				void this.recolor(ids, entry.name);
			},
		).open();
	}

	async recolor(ids: readonly string[], color: string): Promise<void> {
		for (const id of ids) await this.plugin.writer.recolor(id, color);
	}

	chooseHeadingLevel(ids: readonly string[]): void {
		new HeadingSuggestModal(this.plugin.app, (level) => {
			void this.setHeadingLevel(ids, level);
		}).open();
	}

	/** 本文の行の見出しの大きさを変える（0 なら本文に戻す） */
	async setHeadingLevel(
		ids: readonly string[],
		level: number,
	): Promise<void> {
		await this.enqueue(async () => {
			for (const id of ids)
				await this.plugin.writer.setHeadingLevel(id, level);
		});
	}

	/** ハイライトを消す（本文の行の扱いは mode） */
	async deleteHighlight(
		ids: readonly string[],
		mode: RemoveMode,
	): Promise<void> {
		await this.enqueue(async () => {
			try {
				let kept = false;
				for (const id of ids)
					if (await this.plugin.writer.removeHighlight(id, mode))
						kept = true;
				new Notice(
					mode.type === 'unlink'
						? t('notice.unlinked')
						: kept
							? t('notice.highlightKept')
							: t('notice.highlightRemoved'),
				);
			} catch (error) {
				console.error(error);
				new Notice(
					t('notice.highlightFailed', { message: String(error) }),
					8000,
				);
			}
		});
	}

	/** その行のハイライトの ID（索引にあるものだけ） */
	idAtLine(editor: Editor, line: number): string | null {
		if (line < 0 || line >= editor.lineCount()) return null;
		const id = findBlockId(editor.getLine(line))?.id ?? null;
		return id !== null && this.plugin.highlights.index.entry(id)
			? id
			: null;
	}
}
