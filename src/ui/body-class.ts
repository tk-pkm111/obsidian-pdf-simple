import { Component, type App } from 'obsidian';

/**
 * すべてのウィンドウ（メインと、開いている・あとから開く別ウィンドウ）の body にクラスを付け外しする。
 * CSS だけで切り替える表示（プロパティ欄の行を隠すなど）に使う。
 */
export class BodyClass extends Component {
	private readonly docs = new Set<Document>();

	constructor(
		private readonly app: App,
		private readonly cls: string,
		private readonly enabled: () => boolean,
	) {
		super();
	}

	onload(): void {
		this.docs.add(activeDocument);
		this.app.workspace.iterateAllLeaves((leaf) =>
			this.docs.add(leaf.view.containerEl.doc),
		);
		this.registerEvent(
			this.app.workspace.on('window-open', (win) => {
				this.docs.add(win.doc);
				this.update();
			}),
		);
		this.registerEvent(
			this.app.workspace.on('window-close', (win) =>
				this.docs.delete(win.doc),
			),
		);
		this.update();
	}

	onunload(): void {
		for (const doc of this.docs) doc.body.removeClass(this.cls);
		this.docs.clear();
	}

	/** 設定が変わったら呼ぶ */
	update(): void {
		const on = this.enabled();
		for (const doc of this.docs) doc.body.toggleClass(this.cls, on);
	}
}
