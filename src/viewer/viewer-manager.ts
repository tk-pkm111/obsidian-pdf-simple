import {
	Component,
	Keymap,
	MarkdownView,
	Notice,
	debounce,
	type FileView,
	type View,
	type WorkspaceLeaf,
} from 'obsidian';
import { t } from '../i18n';
import type PdfToolsPlugin from '../main';
import { isPdfView } from './dom';
import type { ViewTools } from './tools';
import { ViewOverlay } from './view-overlay';

type ActionKind = 'to-pdf' | 'to-note';

interface Action {
	kind: ActionKind;
	el: HTMLElement;
}

/**
 * 開いているビューを見張り、PDF ビューに重ね描き（ViewOverlay）を、
 * PDF ビューと PDF を添付したノートのヘッダーに「裏返す」ボタンを付ける。
 */
export class ViewerManager extends Component {
	private readonly overlays = new Map<FileView, ViewOverlay>();
	private readonly actions = new Map<View, Action>();
	private readonly flashes = new WeakMap<WorkspaceLeaf, string>();
	private readonly scanSoon = debounce(() => this.scan(), 50);
	private warned = false;
	private started = false;

	constructor(private readonly plugin: PdfToolsPlugin) {
		super();
	}

	start(): void {
		if (this.started) return;
		this.started = true;
		const { workspace, metadataCache } = this.plugin.app;
		this.registerEvent(
			workspace.on('layout-change', () => this.scanSoon()),
		);
		this.registerEvent(
			workspace.on('active-leaf-change', () => this.scanSoon()),
		);
		this.registerEvent(workspace.on('file-open', () => this.scanSoon()));
		// プロパティでペアが変わればボタンを付け外しする
		this.registerEvent(metadataCache.on('changed', () => this.scanSoon()));
		this.register(() => this.scanSoon.cancel());
		this.scan();
	}

	onunload(): void {
		for (const action of this.actions.values()) action.el.detach();
		this.actions.clear();
		this.overlays.clear();
	}

	/** 開いている PDF ビュー */
	pdfViews(): FileView[] {
		return [...this.overlays.keys()].filter(
			(view) => view.containerEl.isConnected,
		);
	}

	overlayFor(view: View): ViewOverlay | null {
		for (const [pdfView, overlay] of this.overlays)
			if (pdfView === view) return overlay;
		return null;
	}

	currentPage(view: View): number | null {
		return this.overlayFor(view)?.currentPage() ?? null;
	}

	/** その PDF ビューの道具（見出しの予約・範囲の取り込み） */
	toolsFor(view: View): ViewTools | null {
		return this.overlayFor(view)?.tools ?? null;
	}

	/** 設定（色・塗り方）が変わったら、ツールバーの見た目を直す */
	refreshToolbars(): void {
		for (const overlay of this.overlays.values()) overlay.refreshToolbar();
	}

	/** そのタブの PDF のハイライトを点滅させる（PDF を開いている途中なら、開いてから） */
	flash(leaf: WorkspaceLeaf, key: string): void {
		const overlay = this.overlayFor(leaf.view);
		if (overlay) overlay.flash(key);
		else this.flashes.set(leaf, key);
	}

	warnUnavailable(): void {
		if (this.warned) return;
		this.warned = true;
		new Notice(t('notice.overlayUnavailable'), 10000);
	}

	scan(): void {
		if (!this.started) return;
		const seen = new Set<View>();
		this.plugin.app.workspace.iterateAllLeaves((leaf) => {
			const view = leaf.view;
			if (isPdfView(view)) {
				seen.add(view);
				this.attach(view, leaf);
				this.ensureAction(view, 'to-note');
			} else if (view instanceof MarkdownView) {
				seen.add(view);
				const paired = view.file
					? this.plugin.pairing.pdfFor(view.file)
					: null;
				this.ensureAction(view, paired ? 'to-pdf' : null);
			}
		});
		for (const [view, overlay] of [...this.overlays]) {
			if (seen.has(view)) {
				overlay.refresh();
				continue;
			}
			this.removeChild(overlay);
			this.overlays.delete(view);
		}
		for (const [view, action] of [...this.actions]) {
			if (seen.has(view)) continue;
			action.el.detach();
			this.actions.delete(view);
		}
	}

	private attach(view: FileView, leaf: WorkspaceLeaf): void {
		let overlay = this.overlays.get(view);
		if (!overlay) {
			overlay = this.addChild(new ViewOverlay(this.plugin, view));
			this.overlays.set(view, overlay);
		}
		const key = this.flashes.get(leaf);
		if (key !== undefined) {
			this.flashes.delete(leaf);
			overlay.flash(key);
		}
	}

	private ensureAction(view: View, kind: ActionKind | null): void {
		const current = this.actions.get(view);
		if (current && current.kind === kind && current.el.isConnected) return;
		current?.el.detach();
		this.actions.delete(view);
		if (kind === null || !(view instanceof MarkdownView || isPdfView(view)))
			return;
		const el =
			kind === 'to-pdf' && view instanceof MarkdownView
				? view.addAction('book-open', t('action.openPdf'), (evt) => {
						void this.plugin.flip.toPdf(
							view,
							Keymap.isModEvent(evt),
						);
					})
				: isPdfView(view)
					? view.addAction(
							'file-text',
							t('action.openNote'),
							(evt) => {
								void this.plugin.flip.toNote(
									view,
									Keymap.isModEvent(evt),
								);
							},
						)
					: null;
		if (el) this.actions.set(view, { kind, el });
	}
}
