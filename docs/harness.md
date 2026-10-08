# 開発環境（ハーネス）

作成日: 2026-10-07（「Fitness Log」のハーネスを複製）

Obsidian プラグイン「PDF Tools」を作るための開発環境。2026-10-01 に Fitness Log（`~/Desktop/Obsidian Fitness`）のために作ったハーネスを、Fitness 固有のもの（ソース・テスト・ドメイン知識・ダミーデータ）を外して複製した。決めごとの経緯と理由は Fitness Log の `docs/harness.md` にある。ここには「何が入っていて、どう使うか」をまとめる。

## 方針

1. **公式テンプレートに乗る。** Obsidian 公式の `obsidian-sample-plugin`（2026 年版）の構成をそのまま土台にし、ツールの選択で迷わない。公式が `AGENTS.md` を同梱しているので、AI 向けの基本ルールもそれを採用。
2. **「速く直せる」より「壊さない」を優先。** 本番 Vault を触らない、公式ガイドラインを機械的に検査する、純粋ロジックはテストで守る。
3. **AI（Claude Code）が正確に動ける情報を手元に置く。** API の型定義と公式ドキュメントをローカルに置き、記憶で API を書かせない。

## 構成要素

### 1. ツールチェーン（公式テンプレート準拠）

| 役割 | 採用 | 備考 |
|---|---|---|
| 言語 | TypeScript 5.9（`strict` + `noUncheckedIndexedAccess` + 未使用検出） | `src/` → `main.js` に束ねる |
| バンドラ | esbuild 0.28 | 公式は 0.25 固定だが vitest 5 と競合するため最新系に変更 |
| API 型定義 | `obsidian` 1.13.1 | `node_modules/obsidian/obsidian.d.ts` が API の正 |
| 実行環境 | Node 22 / npm 10 | 公式は Node 18+ |
| 開発時の再読み込み | `hot-reload`（pjeby）0.3.1 | `npm run vault:setup` で dev-vault に導入 |
| PDF の読み取り | Obsidian 同梱の pdf.js（`loadPdfJs()`） | 自前では同梱しない |

### 2. 品質ゲート（`npm run check`）

| 検査 | ツール | 何を守るか |
|---|---|---|
| 型 | `tsc --noEmit` | API の誤用・null 安全 |
| Lint | ESLint 9 + `eslint-plugin-obsidianmd` 0.4（41 ルール） | Obsidian のプラグイン審査で指摘される項目（モバイル非対応 API、`innerHTML`、設定見出し、コマンド名、`Vault.modify` など）、`manifest.json` の妥当性、使った API の `@since` と `minAppVersion` の整合 |
| アーキテクチャ | ESLint `no-restricted-imports`（`src/lib/**`） | 純粋ロジック層を Obsidian に依存させない |
| 整形 | Prettier（タブ・シングルクォート、公式の `.editorconfig` 準拠） | 差分のノイズを減らす |
| テスト | Vitest 5 | `src/lib/` のロジックと、コマンド登録などの薄い層 |

ESLint の警告も「直す」運用にする（CLAUDE.md に明記）。

### 3. テスト戦略

- npm の `obsidian` パッケージは型定義だけで実行コードが無い。`vitest.config.ts` の alias で `tests/__mocks__/obsidian.ts` に差し替える。モックは必要な API だけを足していく方針（`Events`・`Component`・`Plugin`・`debounce`・`TFile`/`TFolder`・`moment`・UI クラスの読み込み用スタブなど）。`loadPdfJs` は失敗するスタブ（pdf.js はテストでは触らず、E2E で確かめる）。
- ロジックは `src/lib/` に寄せて普通の TypeScript としてテストする。
- vault に触る層は **仮想 vault**（`tests/helpers/fake-app.ts`）で往復をテストできる。中身を文字列で持ち、Obsidian の仕様のうちプラグインが頼るもの（`create` は親フォルダが無いと失敗、`process` は `modify` を発火、`processFrontMatter` は YAML を読み書き）を再現する。バイナリ（PDF）の読み書きが必要になったら `readBinary` / `createBinary` / `modifyBinary` を足す。YAML は `yaml`、`moment` は Obsidian 同梱と同じ 2.29.4 を devDependencies に置いている（プラグインには同梱されない）。
- 描画とイベントの結線は単体テストしない。代わりに下の「E2E」で実際の Obsidian を操作して確かめ、最後にユーザーが目視する。

### 4. 開発用 Vault（`dev-vault/`）

- プロジェクト直下の専用 Vault。**プロジェクトのルート自体を Vault として開かない**（`node_modules` などを Obsidian が索引してしまう）。
- `esbuild.config.mjs` の `copy-to-vault` プラグインがビルドのたびに `main.js` / `manifest.json` / `styles.css` を `dev-vault/.obsidian/plugins/pdf-tools/` にコピーし、`.hotreload` マーカーを置く。hot-reload がそれを検知して再読み込みする。
- 別の Vault で試すときは `OBSIDIAN_PLUGIN_DIR` 環境変数で向き先を変える。本番 Vault（`~/Documents/Obsidian Vaults/` 配下など）は対象外。
- `community-plugins.json` に `hot-reload` と `pdf-tools` を登録済み。初回に Obsidian が「信頼して有効化」を聞いてくる。
- `PDF/` にテスト用の PDF（`sample-3-pages.pdf`・`sample-1-page.pdf`。Ghostscript で生成、個人情報なし）。**個人の PDF は置かない**（リポジトリに入る）。
- Fitness Log の開発用 Vault もフォルダ名は `dev-vault` なので、Obsidian の Vault 一覧では同じ名前で 2 つ並ぶ。開くときはパスで見分ける。

### 5. 参照情報（`references/`、git 管理外）

| 資料 | 場所 | 用途 |
|---|---|---|
| 公式 Developer Docs の原稿 | `references/obsidian-developer-docs/en/` | ガイド（Plugins/）、API リファレンス（Reference/TypeScript API/）、CSS 変数（Reference/CSS variables/）、プラグイン審査ガイドライン、自己レビューチェックリスト |
| 公式テンプレート | `references/obsidian-sample-plugin/`（`npm run references:fetch`） | 設定ファイルの最新形との差分確認 |
| API 型定義 | `node_modules/obsidian/obsidian.d.ts` | `@since` / `@deprecated` 付きの正確な API |
| pdf.js の API | https://mozilla.github.io/pdf.js/api/ （外部） | `loadPdfJs()` が返すオブジェクトの API。ローカルには無いので、使う部分だけの型を `src/pdf/` に書く |

### 6. Claude Code 向けの設定

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | 毎セッション読まれる短い運用ルール。`@AGENTS.md` で公式の汎用ガイドを取り込む |
| `AGENTS.md` | 公式テンプレート同梱（英語・無改変）。構成・マニフェスト・セキュリティ・UX の原則 |
| `.claude/skills/obsidian-plugin-dev/SKILL.md` | プラグインのコードを書くときに読む手順書: API の調べ方、実装前チェック、dev-vault での確認依頼の書き方、仕上げチェックリスト、PDF 向けの API、リリース |
| `.claude/settings.json` | `npm run *` / `npx tsc` / `vitest` / `eslint` / `prettier` / `git status|diff|log` を許可。それ以外は都度確認 |

フックは入れていない。編集のたびに型チェックを走らせると途中状態で警告が出てノイズになるため、「終了前に `npm run check`」のルールで代替する。

### 7. リリース経路（GitHub のリポジトリを作ったら）

- `npm version patch` → `manifest.json` / `versions.json` 更新（`.npmrc` でタグに `v` を付けない）
- `.github/workflows/release.yml`: タグ push でビルドしてリリースを作成（BRAT が読めるよう下書きにしない。ビルドの証明は公開リポジトリのときだけ付ける）
- `.github/workflows/ci.yml`: push ごとに build + check
- スマホ（iPhone / iPad）で確かめるなら、Fitness Log と同じく BRAT でリリースを入れる（公開リポジトリならトークン不要）
- コミュニティ公開には `README.md` と `LICENSE` が必要（ライセンスは未決）

### 8. E2E（隔離した Obsidian での自動確認）

`scripts/e2e-obsidian.mjs`（`npm run e2e -- <command>`）。

- Obsidian を **専用のユーザーデータ**（OS の一時フォルダの `pdf-tools-e2e-profile`）と `--remote-debugging-port`（既定 9334。Fitness Log は 9333 なので同時に動かせる）で起動し、Chrome DevTools Protocol で JS の実行とスクリーンショットを行う。依存パッケージは不要（Node 22 の `fetch` / `WebSocket`）。
- 本番のユーザーデータ（`~/Library/Application Support/obsidian`）には書き込まない。自動更新で入った本体の asar を読み取ってコピーするだけなので、実際に使っている版（開発機では 1.14.4）で動く。開く Vault は dev-vault だけ。終了はこのプロファイルのプロセスだけを対象にする。起動中の本番の Obsidian とは別プロセスで、互いに干渉しない。
- ウィンドウが裏に隠れても止まらないよう、タイマーの間引きを無効にするフラグを付けている。
- 使い方:

  ```bash
  npm run build                                   # dev-vault にコピー（hot-reload が読み直す）
  npm run e2e -- launch
  npm run e2e -- eval "await click('作成者を信頼しプラグインを有効化'); return Object.keys(app.plugins.plugins)"   # 初回だけ
  npm run e2e -- eval "await app.workspace.getLeaf().openFile(app.vault.getFileByPath('PDF/sample-3-pages.pdf')); await sleep(800); app.commands.executeCommandById('pdf-tools:create-note-for-pdf'); await sleep(1500); return { notices: noticeText(), active: app.workspace.getActiveFile()?.path, errs: window.__errs }"
  npm run e2e -- shot /tmp/pdf.png                # 画像を Read で見る
  npm run e2e -- quit
  ```

  `eval` では `sleep` / `btn` / `click` / `modalText` / `viewText`（アクティブなタブの本文）/ `noticeText`（出ている通知）が使え（`eval` の間はフォーカスを模擬するので、裏のウィンドウでも入力欄の focus / blur が起きる）、`window.__errs` に Console のエラーが溜まる。スマホ幅の確認は `window.require('@electron/remote').getCurrentWindow().setSize(400, 860)` の後に `app.emulateMobile(true)`（再読み込みが走る）。1.14 では設定画面が別ウィンドウなので `E2E_TARGET=設定` で対象を切り替える。
- `el.click()` では開かないもの（Obsidian のメニュー）は `npm run e2e -- click '<CSS セレクタ>' [right]` で本物のマウス操作をする（出たメニューの項目を表示する）。ドラッグは `npm run e2e -- drag '<つかむ所のセレクタ>' <dy>`。
- 座標での本物のマウス操作: `npm run e2e -- clickxy <x> <y> [回数] [alt|meta|shift]`（回数 2 でダブルクリック）、`npm run e2e -- dragxy <x1> <y1> <x2> <y2> [alt]`（PDF の文字のドラッグ選択・範囲の取り込み）。座標は先に `eval` で要素の `getBoundingClientRect()` から求める。zsh では `$VAR` が空白で分かれないので、座標は 1 つずつ引数に渡す。macOS の Obsidian は既定で OS のネイティブメニューを使い、DOM にも画面写真にも出ないので、確かめるときは先に `app.vault.setConfig('nativeMenus', false)` を実行する。
- ユーザーが dev-vault を Obsidian で開いているときは、dev-vault をコピーして `E2E_VAULT=<コピーのパス>` で起動する（同じ Vault を 2 つのアプリで開くと data.json や workspace.json を取り合う）。プラグインのコピー先は `OBSIDIAN_PLUGIN_DIR=<コピー>/.obsidian/plugins/pdf-tools npm run build` で切り替える。
- 注意: 裏に隠れたウィンドウでは Obsidian の「レイアウトの準備完了」（`app.workspace.layoutReady`）が遅れることがある。起動直後に確かめるときは `for (let i=0;i<30 && !app.workspace.layoutReady;i++) await sleep(500)` で待つ。
- 注意: Obsidian 1.14 のドロップダウンは幅計測用の `select` を内部に持つので、`querySelectorAll('select')` の添字は 2 つずつずれる。
- `eval` の中で `btn` という名前の変数は作れない（補助関数と重なる）。
- 新しい Vault（コピーした Vault を含む）では、`app.fileManager.renameFile` が初回に「リンクを更新」モーダルを出し、ユーザーが選ぶまで Promise が解決しない。E2E で改名を試すときは先に `app.vault.setConfig('alwaysUpdateLinks', true)` を実行する。
- PDF の文字の選択は `eval` の中で Range API で作る（`getSelection().addRange(range)`）。吹き出しを出すには続けて `document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, view: window }))`。合成イベントには必ず `view: window` を付ける（無いと本体の PDF ビューが `e.view.getSelection()` で落ちて `window.__errs` にエラーが残る）。
- ページプレビュー（`hover-link`）を試すときは PointerEvent ではなく MouseEvent（`mousemove`、`metaKey: true`）を使う。本体は PointerEvent をタッチ操作として無視する。
- macOS には `timeout` コマンドが無い。`eval` に時間制限を付けるなら `perl -e 'alarm 60; exec @ARGV' npm run e2e -- eval "..."`。

## ワークフロー

```
編集 ─▶ npm run dev（監視）─▶ dev-vault に自動コピー ─▶ hot-reload が再読み込み ─▶ Obsidian で目視
  │                                                        └─▶ npm run e2e（隔離した Obsidian を自動操作・スクショ）
  └─▶ npm run check（型・Lint・整形・テスト）が通るまで終わらない
```

## 決めたこと（と理由）

| 項目 | 決定 | 理由 |
|---|---|---|
| リポジトリの単位 | プロジェクトのルート = プラグインのリポジトリ | コミュニティ公開時に `manifest.json` がルートに要る。`docs/` `dev-vault/` は同居しても問題ない |
| プラグイン id / 名前 | `pdf-tools` / `PDF Tools`（仮） | id は公開後に変えられないので、公開前に再検討する。コミュニティには PDF 系のプラグインが 70 以上あるので、名前は重ならないものにする |
| `isDesktopOnly` | `false`（モバイル対応） | PDF は iPad / iPhone でも読む。最初から制約を効かせる方が安い |
| pdf.js | Obsidian 同梱のものを `loadPdfJs()` で使う | 自前で同梱するとビルドが太り、本体のビューアと版がずれる。`@since` が無いので 1.13.0 で使える |
| `minAppVersion` | `1.13.0`（Fitness Log から引き継ぎ） | 宣言的設定（`getSettingDefinitions`）が使える版。開発機は 1.14.4 |
| 設定タブ | 必要になったら `getSettingDefinitions()` で作る | 公式 Lint が宣言的 API を推奨。`display()` は 1.13.0 で deprecated |
| テスト | Vitest + 手書きモック + 仮想 vault | 軽い。描画は E2E（隔離した Obsidian）と目視で確かめる |
| 整形 | Prettier（公式の editorconfig に合わせる） | AI の編集でスタイルがぶれないように |
| フック | なし | 上記のとおりノイズになる |
| テスト用の PDF | Ghostscript で生成した自作のものだけ | リポジトリに入るので、個人の PDF は使わない |

## 確認してほしいこと

1. **何を作るか。** 下の「次のステップ」。
2. **プラグイン名 / id。** `pdf-tools` は仮。
3. **ライセンス。** 公開するなら `LICENSE` が必要（Obsidian プラグインは MIT が多い）。

## 既知の注意点

- `npm audit` が `moment` の moderate 1 件（3 経路）を報告する。`obsidian` パッケージが型のために依存しているだけで、プラグインには同梱されない（Obsidian 本体の moment を使う）。放置でよいが、`npm audit fix --force` は実行しない。
- `.gitignore` で `references/`、`dev-vault/.obsidian/plugins/`、`workspace*.json`、`main.js` を除外している。クローン後は `npm install && npm run vault:setup && npm run references:fetch`。
- `git init` 済みだがコミットはしていない。GitHub のリポジトリも無い。

## 次のステップ（アプリ設計）

1. PDF のどの作業を楽にしたいかを、具体的な場面で書き出す（例: 読みながらノートに抜き書き、ページの切り出し・結合、注釈の取り出し、PDF へのメタデータ付け、PDF の一覧）。
2. 保存の形を決める: PDF 自体を書き換えるか（`modifyBinary`。壊すと取り返しがつかないので慎重に）、ノートに書き出すか（Markdown + frontmatter）、`data.json` に持つか。
3. UI を決める: コマンドだけで足りるか、サイドビューか、本体の PDF ビューに何かを足すか。スマホでの操作。
4. 既存の PDF 系プラグイン（`pdf-plus` など）と何が違うかを 1 行で言えるようにする。
5. 決めたら `docs/implementation-plan.md` に書き、フェーズに分けて実装する。
