/**
 * テスト用の最小限の `obsidian` モジュール。
 * vitest.config.ts の alias で、`import ... from 'obsidian'` がこのファイルに差し替わる。
 * 必要になった API だけを足していく（本物の挙動を再現するのが目的ではない）。
 * vault の振る舞いは tests/helpers/fake-app.ts の FakeVault が受け持つ。
 */
import momentLib from 'moment';
import YAML from 'yaml';

export const moment = momentLib;

export class Notice {
	/** 表示された Notice の本文。テストから検証に使う。 */
	static shown: string[] = [];

	constructor(message: string | DocumentFragment, _duration?: number) {
		Notice.shown.push(
			typeof message === 'string' ? message : (message.textContent ?? ''),
		);
	}

	static reset(): void {
		Notice.shown = [];
	}
}

// ---------------------------------------------------------------------------
// Events / Component

export interface EventRef {
	events: Events;
	name: string;
	callback: (...data: unknown[]) => unknown;
}

export class Events {
	private handlers = new Map<string, EventRef[]>();

	on(name: string, callback: (...data: never[]) => unknown): EventRef {
		const ref: EventRef = {
			events: this,
			name,
			callback: callback as (...data: unknown[]) => unknown,
		};
		this.handlers.set(name, [...(this.handlers.get(name) ?? []), ref]);
		return ref;
	}

	off(name: string, callback: (...data: unknown[]) => unknown): void {
		this.handlers.set(
			name,
			(this.handlers.get(name) ?? []).filter(
				(r) => r.callback !== callback,
			),
		);
	}

	offref(ref: EventRef): void {
		this.handlers.set(
			ref.name,
			(this.handlers.get(ref.name) ?? []).filter((r) => r !== ref),
		);
	}

	trigger(name: string, ...data: unknown[]): void {
		for (const ref of [...(this.handlers.get(name) ?? [])])
			ref.callback(...data);
	}

	/** テスト用: 登録されているハンドラ数 */
	listenerCount(name: string): number {
		return this.handlers.get(name)?.length ?? 0;
	}
}

export class Component {
	private cleanups: Array<() => void> = [];
	private children: Component[] = [];
	loaded = false;

	load(): void {
		this.loaded = true;
		this.onload();
	}
	onload(): void {}
	unload(): void {
		for (const child of this.children) child.unload();
		this.children = [];
		for (const cleanup of this.cleanups.splice(0)) cleanup();
		this.loaded = false;
		this.onunload();
	}
	onunload(): void {}
	addChild<T extends Component>(child: T): T {
		this.children.push(child);
		child.load();
		return child;
	}
	removeChild<T extends Component>(child: T): T {
		this.children = this.children.filter((c) => c !== child);
		child.unload();
		return child;
	}
	register(cb: () => unknown): void {
		this.cleanups.push(() => void cb());
	}
	/** src からは本物の EventRef 型で渡ってくるので unknown で受ける */
	registerEvent(ref: unknown): void {
		const eventRef = ref as EventRef;
		this.cleanups.push(() => eventRef.events.offref(eventRef));
	}
	registerInterval(id: number): number {
		this.cleanups.push(() => clearInterval(id));
		return id;
	}
	registerDomEvent(
		el: {
			addEventListener(type: string, callback: unknown): void;
			removeEventListener(type: string, callback: unknown): void;
		},
		type: string,
		callback: unknown,
	): void {
		el.addEventListener(type, callback);
		this.cleanups.push(() => el.removeEventListener(type, callback));
	}
}

export class Plugin extends Component {
	app: unknown = {};
	manifest = {
		id: 'pdf-tools',
		name: 'PDF Tools',
		version: '0.0.0-test',
	};
	commands: unknown[] = [];
	ribbonIcons: Array<{ icon: string; title: string; callback: () => void }> =
		[];
	views = new Map<string, unknown>();
	settingTabs: unknown[] = [];
	private data: unknown = null;

	constructor(app?: unknown) {
		super();
		if (app !== undefined) this.app = app;
	}

	addCommand<T>(command: T): T {
		this.commands.push(command);
		return command;
	}

	removeCommand(id: string): void {
		this.commands = this.commands.filter(
			(command) => (command as { id?: string }).id !== id,
		);
	}

	registerEditorExtension(_extension: unknown): void {}
	registerMarkdownPostProcessor(_processor: unknown): void {}
	registerHoverLinkSource(_id: string, _info: unknown): void {}

	addRibbonIcon(icon: string, title: string, callback: () => void): unknown {
		this.ribbonIcons.push({ icon, title, callback });
		return {};
	}

	registerView(type: string, factory: unknown): void {
		this.views.set(type, factory);
	}

	addSettingTab(tab: unknown): void {
		this.settingTabs.push(tab);
	}

	loadData(): Promise<unknown> {
		return Promise.resolve(this.data);
	}

	saveData(data: unknown): Promise<void> {
		this.data = JSON.parse(JSON.stringify(data)) as unknown;
		return Promise.resolve();
	}
}

export class PluginSettingTab {
	containerEl = { empty(): void {} };

	constructor(
		public app: unknown,
		public plugin: unknown,
	) {}

	update(): void {}
}

/** メソッドチェーンだけ成立させる Setting のスタブ */
export class Setting {
	constructor(_containerEl: unknown) {}
	setName(): this {
		return this;
	}
	setDesc(): this {
		return this;
	}
	setHeading(): this {
		return this;
	}
	addText(): this {
		return this;
	}
	addToggle(): this {
		return this;
	}
	addDropdown(): this {
		return this;
	}
}

export class Modal {
	constructor(public app: unknown) {}
	open(): void {}
	close(): void {}
	setTitle(): this {
		return this;
	}
}

export class ConfirmationModal extends Modal {
	setContent(_content: unknown): this {
		return this;
	}
	addButton(_cb: (button: unknown) => unknown): this {
		return this;
	}
	addCancelButton(_text?: string): this {
		return this;
	}
}

export abstract class SuggestModal<T> extends Modal {
	emptyStateText = '';
	setPlaceholder(_placeholder: string): void {}
	abstract getSuggestions(query: string): T[];
}

export abstract class FuzzySuggestModal<T> extends SuggestModal<{
	item: T;
	match: { score: number; matches: unknown[] };
}> {
	abstract getItems(): T[];
	abstract getItemText(item: T): string;
	/** 本物はあいまい検索。テストでは部分一致で代用する */
	getSuggestions(query: string): Array<{
		item: T;
		match: { score: number; matches: unknown[] };
	}> {
		return this.getItems()
			.filter((item) => this.getItemText(item).includes(query))
			.map((item) => ({ item, match: { score: 0, matches: [] } }));
	}
}

/** 入力欄の候補（読み込めるだけのスタブ） */
export abstract class AbstractInputSuggest<T> {
	constructor(
		public app: unknown,
		public inputEl: unknown,
	) {}
	setValue(_value: string): void {}
	getValue(): string {
		return '';
	}
	close(): void {}
	protected abstract getSuggestions(query: string): T[];
}

/** ビューは DOM を使うので自動テストしない（読み込めるだけのスタブ。instanceof の判定には使える） */
export class View extends Component {
	navigation = true;
	constructor(public leaf: unknown) {
		super();
	}
	getViewType(): string {
		return '';
	}
	getEphemeralState(): Record<string, unknown> {
		return {};
	}
	setEphemeralState(_state: unknown): void {}
}

export class ItemView extends View {}

export class FileView extends ItemView {
	file: TFile | null = null;
}

export class MarkdownView extends FileView {
	editor: unknown = null;
	getViewType(): string {
		return 'markdown';
	}
	getMode(): 'source' | 'preview' {
		return 'source';
	}
	save(): Promise<void> {
		return Promise.resolve();
	}
}

export const Keymap = {
	isModEvent: (_evt?: unknown): boolean => false,
	isModifier: (_evt: unknown, _modifier: string): boolean => false,
};

/** CodeMirror の StateField の代わり（読み込めるだけ） */
export const editorInfoField = {};
export const editorLivePreviewField = {};

export class MenuItem {
	title = '';
	setTitle(title: string): this {
		this.title = title;
		return this;
	}
	setIcon(_icon: string): this {
		return this;
	}
	setWarning(_warning: boolean): this {
		return this;
	}
	setSection(_section: string): this {
		return this;
	}
	onClick(_callback: () => unknown): this {
		return this;
	}
}

export class Menu {
	items: MenuItem[] = [];
	addItem(cb: (item: MenuItem) => unknown): this {
		const item = new MenuItem();
		cb(item);
		this.items.push(item);
		return this;
	}
	addSeparator(): this {
		return this;
	}
	showAtMouseEvent(_event: unknown): this {
		return this;
	}
}

export function setIcon(_el: unknown, _icon: string): void {}

export function setTooltip(_el: unknown, _tooltip: string): void {}

/** 本物は Obsidian 同梱の pdf.js を返す。テストでは pdf.js に触らない（src/pdf/ は E2E で確かめる） */
export function loadPdfJs(): Promise<unknown> {
	return Promise.reject(new Error('loadPdfJs is not available in tests'));
}

export function stringifyYaml(value: unknown): string {
	return YAML.stringify(value);
}

export function parseYaml(text: string): unknown {
	return YAML.parse(text) as unknown;
}

/** 本物と同じ形（frontmatter の有無・本文の開始位置） */
export function getFrontMatterInfo(content: string): {
	exists: boolean;
	frontmatter: string;
	from: number;
	to: number;
	contentStart: number;
} {
	const match = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/.exec(content);
	if (!match)
		return {
			exists: false,
			frontmatter: '',
			from: 0,
			to: 0,
			contentStart: 0,
		};
	const frontmatter = match[1] ?? '';
	const from = content.indexOf('\n') + 1;
	return {
		exists: true,
		frontmatter,
		from,
		to: from + frontmatter.length,
		contentStart: match[0].length,
	};
}

// ---------------------------------------------------------------------------
// ファイル

export abstract class TAbstractFile {
	/** 本物の TFile 型として渡せるように never（実行時には使わない） */
	declare vault: never;
	path = '';
	name = '';
	parent: TFolder | null = null;
}

export class TFile extends TAbstractFile {
	stat = { ctime: 0, mtime: 0, size: 0 };
	basename = '';
	extension = '';
}

export class TFolder extends TAbstractFile {
	children: TAbstractFile[] = [];
	isRoot(): boolean {
		return this.path === '/';
	}
}

/** 本物に近い挙動: スラッシュの正規化と前後のスラッシュ除去 */
export function normalizePath(path: string): string {
	const normalized = path
		.replace(/\u00a0/g, ' ')
		.replace(/[\\/]+/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.normalize('NFC');
	return normalized === '' ? '/' : normalized;
}

// ---------------------------------------------------------------------------
// ユーティリティ

export interface Debouncer<T extends unknown[], V> {
	(...args: [...T]): this;
	cancel(): this;
	run(): V | void;
}

export function debounce<T extends unknown[], V>(
	cb: (...args: [...T]) => V,
	timeout = 0,
	resetTimer = false,
): Debouncer<T, V> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	let lastArgs: T | undefined;
	const fire = (): V | void => {
		timer = undefined;
		if (lastArgs) return cb(...lastArgs);
	};
	const debounced = ((...args: T) => {
		lastArgs = args;
		if (timer !== undefined) {
			if (!resetTimer) return debounced;
			clearTimeout(timer);
		}
		timer = setTimeout(fire, timeout);
		return debounced;
	}) as Debouncer<T, V>;
	debounced.cancel = () => {
		if (timer !== undefined) clearTimeout(timer);
		timer = undefined;
		return debounced;
	};
	debounced.run = () => {
		if (timer === undefined) return;
		clearTimeout(timer);
		return fire();
	};
	return debounced;
}

export const Platform = {
	isDesktop: true,
	isMobile: false,
	isDesktopApp: true,
	isMobileApp: false,
	isIosApp: false,
	isAndroidApp: false,
	isPhone: false,
	isTablet: false,
};
