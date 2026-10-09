---
name: obsidian-plugin-dev
description: Obsidian プラグインのコードを書く・直す・レビューするときに使う。API の正しい調べ方、実装前チェック、dev-vault での確認手順、公式ガイドライン準拠のチェックリスト、PDF を扱う API、リリース手順。
---

# Obsidian プラグイン開発の手順

## 1. API を調べる（記憶で書かない）

優先順位の順に確認する。すべてローカルにある。

1. **型定義（唯一の正）**: `node_modules/obsidian/obsidian.d.ts`（約 8,500 行）。`grep -n "class Vault\b" ...` のようにクラス名・メソッド名で引く。`@since` で必要な Obsidian バージョンが分かる。`@deprecated` は使わない。
2. **ガイド**: `references/obsidian-developer-docs/en/Plugins/` — Getting started / User interface（Commands, Modals, Settings, Views, Workspace, HTML elements, Icons）/ Editor（CodeMirror 6 拡張）/ Guides（lifecycle, load time, declarative settings, Bases view, Defer views）/ Vault.md / Events.md。
3. **API リファレンス（1 クラス 1 ファイル）**: `references/obsidian-developer-docs/en/Reference/TypeScript API/`。
4. **CSS 変数**: `references/obsidian-developer-docs/en/Reference/CSS variables/`。色・余白はこれを使い、値を直書きしない。
5. **公式テンプレートの最新形**: `references/obsidian-sample-plugin/`（`npm run references:fetch` で取得）。設定ファイルの差分確認に使う。
6. **pdf.js の API**: ローカルには無い。https://mozilla.github.io/pdf.js/api/ で確かめ、使う部分だけの型を `src/pdf/` に書く（下の「PDF を扱う API」）。

`references/` が無いときは `npm run references:fetch`。

## 2. 実装前に決めること

- **その処理は `src/lib/` に置けるか**: 文字列の解析・集計・書式など Obsidian に依存しない部分は `src/lib/` に置き、`tests/` で vitest のテストを書く。`src/lib/` から `'obsidian'` を import すると ESLint エラーになる。
- **解放の責任**: `addCommand` / `registerEvent` / `registerDomEvent` / `registerInterval` / `registerView` / `addSettingTab` を使えば Obsidian が解放する。自前で `setInterval` や `addEventListener` を呼ばない。`MarkdownRenderer.render` などに渡す Component は孤立させない（`Plugin` 自身か `addChild` した Component）。
- **起動コスト**: `onload` は登録だけ。重い処理・vault 走査は `this.app.workspace.onLayoutReady(() => ...)` の中。`vault.on('create')` は layoutReady 後に登録する（起動時に全ファイル分発火するため）。
- **vault への書き込み方法**: 開いているノート → `Editor`。裏で編集 → `Vault.process(file, fn)`。frontmatter → `FileManager.processFrontMatter`。削除 → `FileManager.trashFile`。ユーザー入力のパス → `normalizePath`。ファイル取得 → `Vault.getFileByPath` / `getFolderByPath`（全件走査しない）。バイナリ → `readBinary` / `createBinary` / `modifyBinary`。
- **モバイル**: `isDesktopOnly: false` なので Node.js / Electron API は使えない。`fetch` ではなく `requestUrl`。`process.platform` ではなく `Platform`。`FileSystemAdapter` へのキャスト禁止。正規表現の後読み禁止。
- **必要な Obsidian バージョン**: `@since` が `manifest.json` の `minAppVersion`（現在 1.13.0）より新しい API を使うなら、minAppVersion と `versions.json` を上げる。`obsidianmd/no-unsupported-api` ルールが呼び出し箇所ごとに `@since` と minAppVersion を突き合わせてエラーにするので、Lint が通れば整合している。

## 3. 開発ループ

```
npm run dev            # 監視ビルド → dev-vault/.obsidian/plugins/pdf-simple/ にコピー → hot-reload が再読み込み
npm run check          # typecheck + lint + format:check + test（終了前に必ず）
```

### 自動の動作確認（隔離した Obsidian）

UI を変えたら、ユーザーに頼む前に自分で確かめる。`npm run build` で dev-vault にコピーし（hot-reload が読み直す）、`npm run e2e` で **専用プロファイルの Obsidian**（dev-vault だけを開く・本番プロファイルに書かない）を操作する。詳細は `docs/harness.md` の「E2E」。

```bash
npm run e2e -- launch
npm run e2e -- eval "await app.workspace.getLeaf().openFile(app.vault.getFileByPath('PDF/sample-3-pages.pdf')); await sleep(800); app.commands.executeCommandById('pdf-simple:create-note-for-pdf'); await sleep(1500); return { notices: noticeText(), active: app.workspace.getActiveFile()?.path, errs: window.__errs }"
npm run e2e -- shot /tmp/x.png        # Read で画像を見る
npm run e2e -- quit
```

- クリックは `await click('ボタンの文字', root)`、入力は値を入れて `input`/`change` イベントを発火する。
- スマホ幅: `window.require('@electron/remote').getCurrentWindow().setSize(400, 860)` → `app.emulateMobile(true)`（再読み込みが走るので数秒待つ）。
- 1.14 では設定画面が別ウィンドウ（`E2E_TARGET=設定`）。ドロップダウンは内部に幅計測用の `select` を持つので添字がずれる。
- Obsidian CLI（`obsidian` コマンド）は起動中の本番の Obsidian を操作するので使わない。
- ユーザーが dev-vault を開いているときは、コピーした Vault を `E2E_VAULT` で指定する。

### ユーザーへの確認依頼

動作確認は dev-vault のみ。ユーザーに確認を頼むときは次を具体的に書く:

- 何を開くか（コマンドパレットのコマンド名、設定タブの項目名、ノートや PDF のパス）
- 何が見えれば成功か
- 失敗したときに見てほしいもの: **表示 → 開発者ツール**（macOS: `Cmd+Option+I`）の Console

便利な確認方法:

- モバイル表示の再現: 開発者ツールの Console で `this.app.emulateMobile(true)`（戻すときは `false`）
- 再読み込みされないとき: 設定 → コミュニティプラグイン → 該当プラグインをオフ→オン
- 起動時間の計測: 設定 → 一般 → 詳細 のストップウォッチ
- 別の Vault で試す: `OBSIDIAN_PLUGIN_DIR="<vault>/.obsidian/plugins/pdf-simple" npm run dev`（本番 Vault は不可）

## 4. 仕上げのチェックリスト（公式ガイドライン + 自己レビュー項目の要約）

`npm run lint` で `eslint-plugin-obsidianmd` の 41 ルールが機械的に検査する（commands/*, settings-tab/*, vault/iterate, no-nodejs-modules, no-unsupported-api, regex-lookbehind, prefer-create-el, no-static-styles-assignment, prefer-file-manager-trash-file, platform, sample-names, validate-manifest, validate-license, ui/sentence-case など）。警告も直す。加えて人間が見る項目:

- [ ] `MyPlugin` / `SampleSettingTab` などテンプレート由来の名前が残っていない
- [ ] コマンド名・id にプラグイン名や "command" を含めない。既定のホットキーを付けない
- [ ] `innerHTML` / `outerHTML` / `insertAdjacentHTML` を使っていない（`createEl` / `createDiv` / `createSpan`）
- [ ] スタイルは `styles.css` のクラス（接頭辞 `pdf-simple-`）で当てる。JS から `el.style.*` を触らない。Obsidian の CSS 変数を使う
- [ ] 設定タブ: 見出しは複数セクションがあるときだけ。見出しに "設定" を入れない。`setHeading()` を使い `<h2>` を使わない
- [ ] `this.app` を使い、グローバル `app` / `window.app` を使わない
- [ ] `workspace.activeLeaf` を直接触らない（`getActiveViewOfType` / `activeEditor` / `getActiveFile`）。カスタムビューへの参照をプラグインに保持しない（`getLeavesOfType`）
- [ ] `onunload` で leaf を detach しない
- [ ] `as any` を使わない。`TFile` / `TFolder` は `instanceof` で判定。`loadPdfJs()` の `any` は `src/pdf/` の型で受けて外に出さない
- [ ] `console.log` を残さない（エラーは `console.error`）
- [ ] `moment` を使うなら `import { moment } from 'obsidian'`
- [ ] 設定ファイルの場所は `.obsidian` を直書きせず `Vault.configDir`
- [ ] 本番ビルドは minify（`npm run build`）
- [ ] UI 文言は日本語で統一（`src/i18n/ja.ts`）。英語を混ぜるときは sentence case
- [ ] 独自ビューの描画は try/catch で囲み、例外で画面が空のまま止まらないようにする
- [ ] SVG 要素の `cls` は配列で渡す（空白区切りの文字列は DOMTokenList の例外になる）
- [ ] 個人の PDF をテスト・dev-vault・リポジトリに入れない

## 5. PDF を扱う API

- **pdf.js**: `import { loadPdfJs } from 'obsidian'` → `const pdfjs = (await loadPdfJs()) as PdfJs;`（`@since` 無し。`window.pdfjsLib` にも入る）。自前で pdf.js を同梱しない。使うのは `getDocument({ data: Uint8Array }).promise` → `numPages` / `getPage(n)` / `getMetadata()` / `destroy()` など。使い終わったら `destroy()`。渡したバッファは worker に移されて空になることがあるので、使い回さない（大きさは `file.stat.size`）。
- **読み書き**: `Vault.readBinary(file)` → `ArrayBuffer`。新規は `Vault.createBinary(path, data)`、上書きは `Vault.modifyBinary(file, data)`（PDF を壊すと取り返しがつかないので、上書きする機能は設計で慎重に決める）。表示用の URL は `Vault.getResourcePath(file)`（`<img>` や `<iframe>` の `src` に使う形）。
- **開いている PDF**: `this.app.workspace.getActiveFile()` の `extension === 'pdf'`。コマンドは `checkCallback` で PDF のときだけ出す。
- **表示**: PDF は Obsidian 本体のビュー（view type `pdf`）が表示する。独自ビューを作るなら `FileView` を継承する。`registerExtensions(['pdf'], viewType)` で結び付けると本体のビューアが使えなくなるので、やるなら設計で決めてから。
- **1.13 以降で使える新しい API**: 宣言的な設定タブ `PluginSettingTab.getSettingDefinitions()`（描画・保存・検索を Obsidian が担当。`display()` は使わない。保存先を `this.plugin.settings` 以外にするときは `getControlValue` / `setControlValue` を上書きする。ガイド: `Plugins/User interface/Settings.md`）。Bases ビュー `Plugin.registerBasesView()`（ノートのプロパティを元にした独自ビュー。PDF に付けたメタデータの一覧などの候補。ガイド: `Plugins/Guides/Build a Bases view.md`）。

## 6. リリース（必要になったら）

1. `manifest.json` の `minAppVersion` を確認し、`npm version patch|minor|major`（`manifest.json` と `versions.json` も更新される。タグに `v` は付かない）
2. GitHub にタグを push すると `.github/workflows/release.yml` がビルドしてリリースを作る（添付: `main.js`, `manifest.json`, `styles.css`）
3. コミュニティ公開するなら `references/obsidian-developer-docs/en/Plugins/Releasing/Submit your plugin.md`。`README.md` と `LICENSE` が必須。id に "obsidian" を含めない
