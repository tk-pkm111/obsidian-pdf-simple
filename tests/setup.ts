/**
 * テストの実行環境（Node）に、プラグインが使うブラウザのグローバルを足す。
 * src は window.setTimeout / window.setInterval を使う（Obsidian のガイドラインどおり）。
 */
const globals = globalThis as unknown as { window?: unknown };
globals.window ??= globalThis;
