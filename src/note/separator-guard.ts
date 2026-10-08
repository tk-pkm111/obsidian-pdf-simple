import { Prec, Transaction, type Extension } from '@codemirror/state';
import {
	EditorView,
	ViewPlugin,
	keymap,
	type ViewUpdate,
} from '@codemirror/view';
import { findBlockId } from '../lib/highlight-entry';
import { planMoveIdToLineEnd, planSeparateHighlights } from '../lib/note-guard';
import { LIST_ITEM, headingLevel, type TextEdit } from '../lib/note-lines';
import type PdfToolsPlugin from '../main';

/**
 * ハイライトの行の ID（^hl-…）が効かなくならないように守る（エディタの拡張）。
 * Obsidian はブロック ID を「段落の最後の行の行末」でしか認識しないので、
 * ハイライトのすぐ下に文を続けたり、ID の後ろに文を書き足したりすると、PDF との結びつきが切れる。
 * - ハイライトの段落の行末（点の前でも後ろでも）で Enter を押したら、ID の後ろで空行を 1 つ挟んで改行する
 * - 手が止まったら、ID の後ろに書き足した文を ID の前へ移し、すぐ下に続けた文との間に空行を入れる
 *   （元に戻すの履歴には積まない）
 */

const SEPARATE_DELAY = 800;
const SEPARATE_EVENT = 'pdf-tools.separate';

export function createSeparatorGuard(plugin: PdfToolsPlugin): Extension {
	const isHighlight = (id: string): boolean =>
		plugin.highlights.index.entry(id) !== null;

	const enter = (view: EditorView): boolean => {
		const { state } = view;
		const range = state.selection.main;
		if (state.selection.ranges.length !== 1 || !range.empty) return false;
		const line = state.doc.lineAt(range.head);
		const match = findBlockId(line.text);
		if (!match || !isHighlight(match.id)) return false;
		// 行末か、点（ID）の直前。点の直前で普通に改行すると ID だけが次の行へ行ってしまう
		const atEnd =
			range.head === line.to || range.head === line.from + match.from;
		if (!atEnd) return false;
		// 見出しと箇条書きは、改行しても ID は効いたまま。行末へ動かして、いつもの改行（箇条書きの続きなど）に任せる
		if (LIST_ITEM.test(line.text) || headingLevel(line.text) > 0) {
			if (range.head !== line.to)
				view.dispatch({ selection: { anchor: line.to } });
			return false;
		}
		view.dispatch({
			changes: { from: line.to, insert: '\n\n' },
			selection: { anchor: line.to + 2 },
			scrollIntoView: true,
			userEvent: 'input',
		});
		return true;
	};

	class Separator {
		private pending: number[] = [];
		private timer: number | null = null;

		constructor(private readonly view: EditorView) {}

		update(update: ViewUpdate): void {
			if (!update.docChanged) return;
			this.pending = this.pending.map((pos) =>
				update.changes.mapPos(pos),
			);
			const byUser = update.transactions.some(
				(tr) =>
					tr.isUserEvent('input') ||
					tr.isUserEvent('paste') ||
					tr.isUserEvent('drop') ||
					tr.isUserEvent('delete') ||
					tr.isUserEvent('move'),
			);
			if (!byUser) return;
			update.changes.iterChangedRanges((_fromA, _toA, fromB, toB) => {
				this.pending.push(fromB, toB);
			});
			this.schedule();
		}

		destroy(): void {
			if (this.timer !== null) window.clearTimeout(this.timer);
		}

		private schedule(): void {
			if (this.timer !== null) window.clearTimeout(this.timer);
			this.timer = window.setTimeout(() => this.apply(), SEPARATE_DELAY);
		}

		private apply(): void {
			this.timer = null;
			if (this.view.composing) {
				this.schedule();
				return;
			}
			const lines = new Set<number>();
			const { doc } = this.view.state;
			for (const pos of this.pending)
				lines.add(doc.lineAt(Math.min(pos, doc.length)).number - 1);
			this.pending = [];
			// ID の後ろに書き足した文を前へ移してから、下の文との間に空行を入れる
			this.repair(
				planMoveIdToLineEnd(doc.toString(), isHighlight, lines),
			);
			const after = this.view.state.doc.toString();
			this.repair(planSeparateHighlights(after, isHighlight, lines));
		}

		private repair(edits: readonly TextEdit[]): void {
			if (edits.length === 0) return;
			const { state } = this.view;
			const changes = state.changes(
				edits.map((edit) => ({
					from: edit.from,
					to: edit.to,
					insert: edit.insert,
				})),
			);
			// カーソルは、足した ID・空行の手前に残す（書いている途中の文の後ろ）
			const head = changes.mapPos(state.selection.main.head, -1);
			this.view.dispatch({
				changes,
				selection: { anchor: head },
				annotations: [
					Transaction.addToHistory.of(false),
					Transaction.userEvent.of(SEPARATE_EVENT),
				],
			});
		}
	}

	return [
		Prec.high(keymap.of([{ key: 'Enter', run: enter }])),
		ViewPlugin.fromClass(Separator),
	];
}
