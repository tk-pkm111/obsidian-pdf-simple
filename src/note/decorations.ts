import {
	EditorState,
	RangeSetBuilder,
	StateEffect,
	type Extension,
	type Transaction,
	type TransactionSpec,
} from '@codemirror/state';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate,
} from '@codemirror/view';
import {
	Keymap,
	MarkdownView,
	editorInfoField,
	editorLivePreviewField,
	setTooltip,
} from 'obsidian';
import { t } from '../i18n';
import { findBlockId } from '../lib/highlight-entry';
import { paletteHex } from '../lib/settings';
import type PdfSimplePlugin from '../main';

/**
 * ライブプレビューの装飾。
 * 索引にあるハイライトの行（`テキスト ^hl-…`）の ` ^hl-…` を、小さな点（PDF と同じ色）に置き換える。
 * カーソルがその行にあっても点のまま（ID は見せない）。文には何もしないので、普通にクリックして編集できる。
 * PDF の該当箇所へ移るのは点を押したときだけ。
 * 点は 1 つの文字のように扱う（atomicRanges。カーソルは点の中に入らず、Backspace で点ごと消える）。
 * 行末（点の後ろ）をクリックしたときは、点の前にカーソルを置く（書き足した文が ID の後ろに入らないように）。
 */

const refresh = StateEffect.define<null>();

/** 右クリックした行（editor-menu には位置が渡らないので覚えておく） */
let contextLine: { line: number; time: number } | null = null;

/** 直前に右クリックした行（0 始まり。1 秒以上前なら null） */
export function takeContextLine(): number | null {
	const value = contextLine;
	contextLine = null;
	return value && Date.now() - value.time < 1000 ? value.line : null;
}

class DotWidget extends WidgetType {
	constructor(
		readonly id: string,
		readonly color: string,
		readonly page: number,
	) {
		super();
	}

	eq(other: DotWidget): boolean {
		return (
			other.id === this.id &&
			other.color === this.color &&
			other.page === this.page
		);
	}

	toDOM(): HTMLElement {
		const dot = createSpan({
			cls: 'pdf-simple-dot',
			attr: { 'data-pdf-simple-id': this.id },
		});
		dot.setCssProps({ '--pdf-simple-hl': this.color });
		setTooltip(dot, t('tooltip.openInPdf', { page: this.page }));
		return dot;
	}

	ignoreEvent(): boolean {
		return false;
	}
}

function livePreview(state: EditorState): boolean {
	return state.field(editorLivePreviewField, false) === true;
}

function elementAt(event: MouseEvent): Element | null {
	const node = event.targetNode;
	if (!node) return null;
	return node.instanceOf(Element) ? node : node.parentElement;
}

export function createHighlightDecorations(plugin: PdfSimplePlugin): Extension {
	const isHighlight = (id: string): boolean =>
		plugin.highlights.index.entry(id) !== null;

	class HighlightDecorations {
		decorations: DecorationSet;
		/** 点に置き換えた範囲（atomicRanges 用。行の装飾は含めない） */
		dots: DecorationSet;
		private destroyed = false;
		private readonly unsubscribe: () => void;

		constructor(private readonly view: EditorView) {
			[this.decorations, this.dots] = this.build();
			this.unsubscribe = plugin.highlights.onChange(() =>
				this.requestRefresh(),
			);
		}

		update(update: ViewUpdate): void {
			const refreshed = update.transactions.some((tr) =>
				tr.effects.some((effect) => effect.is(refresh)),
			);
			const modeChanged =
				livePreview(update.startState) !== livePreview(update.state);
			if (
				refreshed ||
				modeChanged ||
				update.docChanged ||
				update.viewportChanged
			)
				[this.decorations, this.dots] = this.build();
		}

		destroy(): void {
			this.destroyed = true;
			this.unsubscribe();
		}

		private requestRefresh(): void {
			window.setTimeout(() => {
				if (!this.destroyed)
					this.view.dispatch({ effects: refresh.of(null) });
			}, 0);
		}

		private build(): [DecorationSet, DecorationSet] {
			const { state } = this.view;
			if (!livePreview(state)) return [Decoration.none, Decoration.none];
			const builder = new RangeSetBuilder<Decoration>();
			const dots = new RangeSetBuilder<Decoration>();
			let lastLine = 0;
			for (const { from, to } of this.view.visibleRanges) {
				for (let pos = from; pos <= to;) {
					const line = state.doc.lineAt(pos);
					pos = line.to + 1;
					if (line.number <= lastLine) continue;
					lastLine = line.number;
					const match = findBlockId(line.text);
					const entry = match
						? plugin.highlights.index.entry(match.id)
						: null;
					if (!match || !entry) continue;
					const color = paletteHex(plugin.settings, entry.color);
					builder.add(
						line.from,
						line.from,
						Decoration.line({
							class: 'pdf-simple-hl-line',
							attributes: {
								style: `--pdf-simple-hl: ${color}`,
								'data-pdf-simple-id': match.id,
							},
						}),
					);
					const dot = Decoration.replace({
						widget: new DotWidget(match.id, color, entry.page),
					});
					builder.add(
						line.from + match.from,
						line.from + match.to,
						dot,
					);
					dots.add(line.from + match.from, line.from + match.to, dot);
				}
			}
			return [builder.finish(), dots.finish()];
		}
	}

	const decorations = ViewPlugin.fromClass(HighlightDecorations, {
		decorations: (value) => value.decorations,
		eventHandlers: {
			mousedown(event: MouseEvent, view: EditorView): boolean {
				if (event.button !== 0) return false;
				const dot = elementAt(event)?.closest('.pdf-simple-dot');
				const id = dot?.getAttribute('data-pdf-simple-id');
				if (!id) return false;
				event.preventDefault();
				const info = view.state.field(editorInfoField, false);
				void plugin.actions.openInPdf(id, {
					sourceLeaf: info instanceof MarkdownView ? info.leaf : null,
					newLeaf: Keymap.isModEvent(event),
				});
				return true;
			},
			contextmenu(event: MouseEvent, view: EditorView): boolean {
				const pos = view.posAtCoords({
					x: event.clientX,
					y: event.clientY,
				});
				if (pos !== null)
					contextLine = {
						line: view.state.doc.lineAt(pos).number - 1,
						time: Date.now(),
					};
				return false;
			},
		},
	});

	/** 行末（点の後ろ）をクリックしたら、点の前にカーソルを置く */
	const beforeDot = EditorState.transactionFilter.of(
		(tr: Transaction): TransactionSpec | readonly TransactionSpec[] => {
			if (!tr.selection || !tr.isUserEvent('select.pointer')) return tr;
			const state = tr.state;
			if (!livePreview(state)) return tr;
			const { main } = tr.selection;
			if (!main.empty || tr.selection.ranges.length !== 1) return tr;
			const line = state.doc.lineAt(main.head);
			if (main.head !== line.to) return tr;
			const match = findBlockId(line.text);
			if (!match || !isHighlight(match.id)) return tr;
			return [
				tr,
				{
					selection: { anchor: line.from + match.from },
					sequential: true,
				},
			];
		},
	);

	return [
		decorations,
		EditorView.atomicRanges.of(
			(view) => view.plugin(decorations)?.dots ?? Decoration.none,
		),
		beforeDot,
	];
}
