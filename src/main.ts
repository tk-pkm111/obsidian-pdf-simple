import { Plugin } from 'obsidian';
import { HighlightActions } from './actions';
import { registerCommands, registerPaletteCommands } from './commands';
import { FlipController } from './flip/flip';
import { HighlightService } from './index/highlight-service';
import { PairingService } from './index/pairing-service';
import {
	needsMigration,
	normalizeSettings,
	type PdfToolsSettings,
	type SelectAction,
} from './lib/settings';
import { createHighlightDecorations } from './note/decorations';
import { registerMenus } from './note/menus';
import { NoteWriter } from './note/note-writer';
import {
	ReadingViewRefresher,
	createReadingViewProcessor,
} from './note/post-processor';
import { createSeparatorGuard } from './note/separator-guard';
import { RegionRenderer } from './pdf/render-region';
import { PdfStorage } from './pdf-storage';
import { RegionActions } from './region-actions';
import { PdfToolsSettingTab } from './settings-tab';
import { BodyClass } from './ui/body-class';
import { HOVER_SOURCE } from './viewer/overlay-input';
import { SelectionController } from './viewer/selection-controller';
import { ViewerManager } from './viewer/viewer-manager';

// main.ts はプラグインのライフサイクル（読み込み・登録・解放）だけを担当する。
// 機能の中身は src/ 配下の各モジュールに置く。
export default class PdfToolsPlugin extends Plugin {
	settings!: PdfToolsSettings;
	highlights!: HighlightService;
	pairing!: PairingService;
	storage!: PdfStorage;
	writer!: NoteWriter;
	actions!: HighlightActions;
	regions!: RegionActions;
	regionRenderer!: RegionRenderer;
	flip!: FlipController;
	viewer!: ViewerManager;
	selection!: SelectionController;
	private hideEntries: BodyClass | null = null;

	async onload(): Promise<void> {
		const raw: unknown = await this.loadData();
		this.settings = normalizeSettings(raw);
		// 古い版の設定は、移した形で保存し直す
		if (needsMigration(raw)) await this.saveData(this.settings);
		this.highlights = this.addChild(new HighlightService(this));
		this.pairing = new PairingService(this);
		this.storage = new PdfStorage(this);
		this.writer = new NoteWriter(this);
		this.actions = new HighlightActions(this);
		this.regions = new RegionActions(this);
		this.regionRenderer = this.addChild(new RegionRenderer(this.app));
		this.flip = new FlipController(this);
		this.viewer = this.addChild(new ViewerManager(this));
		this.selection = this.addChild(new SelectionController(this));
		this.addChild(new ReadingViewRefresher(this));

		registerCommands(this);
		registerMenus(this);
		this.addSettingTab(new PdfToolsSettingTab(this.app, this));
		this.registerEditorExtension([
			createHighlightDecorations(this),
			createSeparatorGuard(this),
		]);
		this.registerMarkdownPostProcessor(createReadingViewProcessor(this));
		this.registerHoverLinkSource(HOVER_SOURCE, {
			display: this.manifest.name,
			defaultMod: true,
		});

		// vault の走査・ビューの見張りは、起動を遅らせないようレイアウトの準備ができてから
		this.app.workspace.onLayoutReady(() => {
			this.hideEntries = this.addChild(
				new BodyClass(
					this.app,
					'pdf-tools-hide-entries',
					() => this.settings.hideEntriesProperty,
				),
			);
			this.highlights.start();
			this.viewer.start();
			this.selection.start();
		});
	}

	/** 設定を保存し、変わったところに合わせて索引・コマンド・描画を更新する */
	async applySettings(next: PdfToolsSettings): Promise<void> {
		const previous = this.settings;
		this.settings = normalizeSettings(next);
		await this.saveData(this.settings);
		const paletteChanged =
			JSON.stringify(previous.palette) !==
			JSON.stringify(this.settings.palette);
		if (paletteChanged) {
			registerPaletteCommands(this);
			this.highlights.rebuild();
		}
		if (previous.pairingProperty !== this.settings.pairingProperty)
			this.viewer.scan();
		if (this.settings.selectAction === 'none') this.selection.hide();
		this.hideEntries?.update();
		this.viewer.refreshToolbars();
	}

	/** ペンの色を変える（塗らない設定だったら、すぐ塗るに戻す） */
	async setPenColor(color: string): Promise<void> {
		await this.applySettings({
			...this.settings,
			defaultColor: color,
			selectAction:
				this.settings.selectAction === 'none'
					? 'highlight'
					: this.settings.selectAction,
		});
	}

	async setSelectAction(selectAction: SelectAction): Promise<void> {
		await this.applySettings({ ...this.settings, selectAction });
	}

	/** ペンの書き方（0 は本文、1〜3 は見出し）。塗らない設定だったら、すぐ塗るに戻す */
	async setPenHeading(level: number): Promise<void> {
		await this.applySettings({
			...this.settings,
			defaultHeading: level,
			selectAction:
				this.settings.selectAction === 'none'
					? 'highlight'
					: this.settings.selectAction,
		});
	}
}
