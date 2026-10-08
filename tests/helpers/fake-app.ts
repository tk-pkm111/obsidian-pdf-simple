/**
 * テスト用の仮想 vault（ファイルの中身を文字列で持つ）と FileManager。
 * Obsidian 本体の仕様のうち、このプラグインが頼るものを再現する:
 * - create は親フォルダが無いと失敗する／既にあると失敗する
 * - createFolder は既にあると失敗する
 * - process はコールバックの戻り値を書き込み、'modify' を発火する
 * - processFrontMatter は YAML の frontmatter を読み書きする
 */
import YAML from 'yaml';
import type { App } from 'obsidian';
import {
	Events,
	MarkdownView,
	TFile,
	TFolder,
	type TAbstractFile,
} from '../__mocks__/obsidian';
import { FakeMetadataCache } from './fake-metadata';

function splitPath(path: string): { parent: string; name: string } {
	const index = path.lastIndexOf('/');
	return index < 0
		? { parent: '/', name: path }
		: { parent: path.slice(0, index), name: path.slice(index + 1) };
}

export class FakeVault extends Events {
	readonly root = Object.assign(new TFolder(), { path: '/', name: '' });
	private folders = new Map<string, TFolder>([['/', this.root]]);
	private files = new Map<string, TFile>();
	private contents = new Map<string, string>();
	/** 書き込み回数（壊れたノートに書き込んでいないことの検証用） */
	writes = 0;

	getFileByPath(path: string): TFile | null {
		return this.files.get(path) ?? null;
	}

	getFolderByPath(path: string): TFolder | null {
		return this.folders.get(path) ?? null;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.getFileByPath(path) ?? this.getFolderByPath(path);
	}

	getFiles(): TFile[] {
		return [...this.files.values()];
	}

	getMarkdownFiles(): TFile[] {
		return this.getFiles().filter((file) => file.extension === 'md');
	}

	createFolder(path: string): Promise<TFolder> {
		if (this.folders.has(path) || this.files.has(path))
			return Promise.reject(new Error('Folder already exists.'));
		const { parent, name } = splitPath(path);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const folder = Object.assign(new TFolder(), {
			path,
			name,
			parent: parentFolder,
		});
		parentFolder.children.push(folder);
		this.folders.set(path, folder);
		this.trigger('create', folder);
		return Promise.resolve(folder);
	}

	create(path: string, data: string): Promise<TFile> {
		if (this.files.has(path) || this.folders.has(path))
			return Promise.reject(new Error('File already exists.'));
		const { parent, name } = splitPath(path);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const dot = name.lastIndexOf('.');
		const file = Object.assign(new TFile(), {
			path,
			name,
			parent: parentFolder,
			basename: dot < 0 ? name : name.slice(0, dot),
			extension: dot < 0 ? '' : name.slice(dot + 1),
		});
		parentFolder.children.push(file);
		this.files.set(path, file);
		this.contents.set(path, data);
		this.writes++;
		this.trigger('create', file);
		return Promise.resolve(file);
	}

	read(file: TFile): Promise<string> {
		const content = this.contents.get(file.path);
		if (content === undefined) return Promise.reject(new Error('ENOENT'));
		return Promise.resolve(content);
	}

	cachedRead(file: TFile): Promise<string> {
		return this.read(file);
	}

	async process(file: TFile, fn: (data: string) => string): Promise<string> {
		const next = fn(await this.read(file));
		this.write(file, next);
		return next;
	}

	/** テスト用: 中身を直接読む */
	text(path: string): string | undefined {
		return this.contents.get(path);
	}

	/** テスト用: 外部（ユーザーの手編集・Sync）による変更 */
	externalWrite(path: string, data: string): void {
		const file = this.files.get(path);
		if (!file) throw new Error(`no file ${path}`);
		this.write(file, data);
	}

	/** ファイル名の変更・移動（Obsidian の 'rename' を発火する） */
	rename(file: TFile, newPath: string): Promise<void> {
		if (this.files.has(newPath))
			return Promise.reject(new Error('File already exists.'));
		const { parent, name } = splitPath(newPath);
		const parentFolder = this.folders.get(parent);
		if (!parentFolder)
			return Promise.reject(new Error(`ENOENT: ${parent}`));
		const oldPath = file.path;
		const content = this.contents.get(oldPath) ?? '';
		this.files.delete(oldPath);
		this.contents.delete(oldPath);
		if (file.parent)
			file.parent.children = file.parent.children.filter(
				(c) => c !== file,
			);
		const dot = name.lastIndexOf('.');
		Object.assign(file, {
			path: newPath,
			name,
			parent: parentFolder,
			basename: dot < 0 ? name : name.slice(0, dot),
			extension: dot < 0 ? '' : name.slice(dot + 1),
		});
		parentFolder.children.push(file);
		this.files.set(newPath, file);
		this.contents.set(newPath, content);
		this.trigger('rename', file, oldPath);
		return Promise.resolve();
	}

	/** テスト用: 削除 */
	externalDelete(path: string): void {
		const file = this.files.get(path);
		if (!file) throw new Error(`no file ${path}`);
		this.files.delete(path);
		this.contents.delete(path);
		if (file.parent)
			file.parent.children = file.parent.children.filter(
				(c) => c !== file,
			);
		this.trigger('delete', file);
	}

	write(file: TFile, data: string): void {
		this.contents.set(file.path, data);
		this.writes++;
		this.trigger('modify', file);
	}
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export class FakeFileManager {
	/** ゴミ箱に入れたパス（検証用） */
	trashed: string[] = [];

	constructor(private readonly vault: FakeVault) {}

	renameFile(file: TFile, newPath: string): Promise<void> {
		return this.vault.rename(file, newPath);
	}

	/** 新しいノートの置き場所（本物はユーザーの設定。テストでは vault の直下） */
	getNewFileParent(_sourcePath: string, _newFilePath?: string): TFolder {
		return this.vault.root;
	}

	trashFile(file: TFile): Promise<void> {
		this.trashed.push(file.path);
		this.vault.externalDelete(file.path);
		return Promise.resolve();
	}

	async processFrontMatter(
		file: TFile,
		fn: (frontmatter: Record<string, unknown>) => void,
	): Promise<void> {
		const text = await this.vault.read(file);
		const match = FRONTMATTER.exec(text);
		const data = (match ? YAML.parse(match[1] ?? '') : {}) as Record<
			string,
			unknown
		> | null;
		const frontmatter = data ?? {};
		fn(frontmatter);
		const body = match ? text.slice(match[0].length) : text;
		// Obsidian と同じく長い文字列を折り返さない
		const yaml = YAML.stringify(frontmatter, { lineWidth: 0 }).trimEnd();
		this.vault.write(file, `---\n${yaml}\n---\n${body}`);
	}

	/** テスト用: frontmatter を読む */
	static read(text: string | undefined): Record<string, unknown> {
		const match = FRONTMATTER.exec(text ?? '');
		return match
			? (YAML.parse(match[1] ?? '') as Record<string, unknown>)
			: {};
	}
}

/** 文字列を中身に持つ Editor（NoteWriter の Editor 経路のテスト用） */
export class FakeEditor {
	constructor(public value: string) {}

	getValue(): string {
		return this.value;
	}

	getLine(line: number): string {
		return this.value.split('\n')[line] ?? '';
	}

	lineCount(): number {
		return this.value.split('\n').length;
	}

	offsetToPos(offset: number): { line: number; ch: number } {
		const before = this.value.slice(0, offset);
		const line = before.split('\n').length - 1;
		return { line, ch: offset - (before.lastIndexOf('\n') + 1) };
	}

	posToOffset(pos: { line: number; ch: number }): number {
		const lines = this.value.split('\n');
		let offset = 0;
		for (let i = 0; i < pos.line; i++)
			offset += (lines[i] ?? '').length + 1;
		return offset + pos.ch;
	}

	/** 本物と同じく、変更の位置はすべて元の文字列に対するもの */
	transaction(tx: {
		changes?: Array<{
			from: { line: number; ch: number };
			to?: { line: number; ch: number };
			text: string;
		}>;
	}): void {
		const changes = (tx.changes ?? []).map((change) => ({
			from: this.posToOffset(change.from),
			to: this.posToOffset(change.to ?? change.from),
			text: change.text,
		}));
		for (const change of changes.sort((a, b) => b.from - a.from))
			this.value =
				this.value.slice(0, change.from) +
				change.text +
				this.value.slice(change.to);
	}
}

/** ソースモードで開いているノート（保存すると仮想 vault に書く） */
export class FakeMarkdownView extends MarkdownView {
	saves = 0;
	declare editor: FakeEditor;

	constructor(
		private readonly vault: FakeVault,
		file: TFile,
		private readonly mode: 'source' | 'preview' = 'source',
	) {
		super({});
		this.file = file;
		this.editor = new FakeEditor(vault.text(file.path) ?? '');
	}

	getMode(): 'source' | 'preview' {
		return this.mode;
	}

	save(): Promise<void> {
		this.saves++;
		if (this.file) this.vault.write(this.file, this.editor.getValue());
		return Promise.resolve();
	}
}

export class FakeWorkspace extends Events {
	/** iterateAllLeaves が返すタブ（{ view } だけを持つ） */
	leaves: Array<{ view: unknown }> = [];

	onLayoutReady(callback: () => void): void {
		callback();
	}

	iterateAllLeaves(callback: (leaf: { view: unknown }) => void): void {
		for (const leaf of this.leaves) callback(leaf);
	}

	getActiveViewOfType(): null {
		return null;
	}
}

export interface FakeApp {
	vault: FakeVault;
	fileManager: FakeFileManager;
	metadataCache: FakeMetadataCache;
	workspace: FakeWorkspace;
	/** src に渡すための App 型 */
	app: App;
}

export function createFakeApp(): FakeApp {
	const vault = new FakeVault();
	const fileManager = new FakeFileManager(vault);
	const metadataCache = new FakeMetadataCache(vault);
	const workspace = new FakeWorkspace();
	const app = {
		vault,
		fileManager,
		metadataCache,
		workspace,
	} as unknown as App;
	return { vault, fileManager, metadataCache, workspace, app };
}
