# PDF Tools — Obsidian プラグイン開発

@AGENTS.md

上の AGENTS.md は Obsidian 公式テンプレート同梱の汎用ガイド（英語）。以下はこのプロジェクト固有の決めごと。

## このプロジェクト

- 目的: Obsidian 上で PDF を処理しやすくするプラグイン（id: `pdf-tools`、名前は仮）。
- 状態: 2026-10-07 に「Fitness Log」（`~/Desktop/Obsidian Fitness`）の開発環境（ハーネス）を複製して始め、2026-10-08 に設計を固めた（`docs/implementation-plan.md`）。**作るもの: PDF のハイライトをノートの「表/裏」で扱うプラグイン。** 本体の PDF ビューに重ね描きし、ノートには `テキスト ^hl-xxxx`（1 件 1 段落。見出し・画像も）だけを残し、位置と色はプロパティ `pdf-highlights` に持つ（プロパティ欄では隠す）。2026-10-08 に Phase 1〜6 を実装し、同日ユーザーの試用を受けて第 2 弾（ノートの文字の色なし・箇条書きなし・選んだらすぐ塗る・見出しモード・範囲を画像に・プロパティ欄で記録を隠す）を実装し、さらに第 3 弾（PDF へは点だけで移り文字は普通に編集できる・見出しをペンの書き方と吹き出しに統合・PDF の順にノートへ並べる）を実装（スマホ実機の確認は未実施。2026-10-08 に GitHub へ公開し BRAT で入れられるようにした）。第 4 弾で範囲の画像の文字抜け（cMap）を直し、選んだ文字を段落の形でノートに入れるようにした。設計から変えた点は設計書の §14〜§17。
- 設計は `docs/implementation-plan.md`（決定事項・データ設計・画面設計・使う API・モジュール構成・フェーズ・スパイク結果）。コードを書く前に該当するフェーズの節を読む。ハーネスの構成と使い方は `docs/harness.md`。

## レイアウト

```
src/main.ts        ライフサイクルのみ（登録・onLayoutReady）
src/commands.ts    コマンド登録
src/i18n/          UI 文言（t('key')）
src/lib/           Obsidian 非依存の純粋ロジック（'obsidian' の import は ESLint で禁止）
src/index/         索引（metadataCache の購読）とペアリング
src/note/          ノート側: 書き込み・移動・ライブプレビューの装飾・閲覧モード・メニュー
src/viewer/        PDF 側: 本体ビューアの DOM（dom.ts だけが知る）・重ね描き・選択の吹き出し
src/flip/          表⇄裏の切り替え
src/ui/            モーダル・表示名
src/actions.ts     コマンド・メニュー・クリックから呼ぶ操作
tests/             vitest。'obsidian' は tests/__mocks__/obsidian.ts、vault は tests/helpers/fake-app.ts の仮想 vault
scripts/           dev-vault の準備・参照資料の取得・E2E（隔離した Obsidian の自動操作）
dev-vault/         開発専用 Vault。ビルド成果物がここにコピーされる。PDF/ にテスト用の PDF
references/        公式ドキュメント・公式テンプレートのローカルコピー（git 管理外）
docs/              設計メモ
```

## コマンド（npm scripts 経由で実行する）

| コマンド | 役割 |
|---|---|
| `npm run dev` | 監視ビルド。`dev-vault/.obsidian/plugins/pdf-tools/` に自動コピー → hot-reload が再読み込み |
| `npm run build` | 本番ビルド（型チェック込み、minify）。dev-vault にもコピーされる |
| `npm run check` | typecheck + lint + format:check + test。**コードを変えたら最後に必ず通す** |
| `npm run format` / `npm run lint:fix` | 自動整形・自動修正 |
| `npm run test:watch` | テストの監視実行 |
| `npm run e2e -- launch\|eval '<js>'\|click '<selector>'\|drag '<selector>' <dy>\|clickxy <x> <y> [回数] [alt]\|dragxy <x1> <y1> <x2> <y2> [alt]\|shot <png>\|quit` | 隔離した Obsidian（専用プロファイル・dev-vault のみ）を起動して自動操作・スクリーンショット。使い方は `docs/harness.md` の「E2E」 |
| `npm run vault:setup` | dev-vault と hot-reload の再セットアップ |
| `npm run references:fetch` | references/ を最新に更新 |

## 作業の進め方

1. Obsidian API に触る変更は、先に `.claude/skills/obsidian-plugin-dev/SKILL.md` の手順で公式ドキュメントと `node_modules/obsidian/obsidian.d.ts` を確認する。記憶で API を書かない。pdf.js の API も同じ（公式の API ドキュメントで確かめる）。
2. ロジックは `src/lib/` に置いてテストを書く。Obsidian API に触る層（コマンド・ビュー・設定・`src/pdf/`）は薄く保つ。
3. 終わる前に `npm run check` を通す。ESLint の警告（`obsidianmd/*`）も直す。
4. UI の変更は `npm run build` の後に `npm run e2e` で隔離した Obsidian を操作して確かめる（スクリーンショットを見る・`window.__errs` が空か確認する）。そのうえで、`npm run dev` を動かした状態で dev-vault を開いて目視してもらうよう、確認手順を具体的に書いて依頼する。
5. commit / push は頼まれたときだけ。GitHub のリポジトリは公開（`tk-pkm111/obsidian-pdf-tools`）。個人的なデータを入れない。リリースは `manifest.json` の版と同じタグを push すると GitHub Actions が作る（BRAT はそこから入れる）。

## 守ること

- Obsidian 公式のプラグインガイドラインに従う（`eslint-plugin-obsidianmd` が多くを検出する）。
- モバイル対応（`isDesktopOnly: false`）: Node.js / Electron API 禁止、HTTP は `requestUrl`、OS 判定は `Platform`、正規表現の後読み禁止。
- **pdf.js は Obsidian 同梱のものを `loadPdfJs()` で使う**（自前で同梱しない。ビルドが太り、本体のビューアと版がずれる）。戻り値は `any` なので、使う部分だけの型を `src/pdf/` に書き、`any` を外に出さない。
- **PDF の読み書きは `Vault.readBinary` / `createBinary` / `modifyBinary`**。表示用の URL は `Vault.getResourcePath`。Adapter API は使わない。pdf.js に渡したバッファは worker に移されて空になることがあるので、大きさは `file.stat.size` から取る。
- PDF の表示は Obsidian 本体の PDF ビューが担う（設計で決定。`registerExtensions(['pdf'], …)` は使わない）。本体ビューアの DOM（`.page` / `.textLayer` / `span.textLayerNode[data-idx]`）に触るコードは `src/viewer/dom.ts` だけに置き、見つからなければ重ね描きを諦めて動き続ける。
- vault への書き込み: 開いているノートは `Editor`、裏での編集は `Vault.process`、frontmatter は `FileManager.processFrontMatter`、削除は `FileManager.trashFile`。`Vault.modify` と Adapter API は使わない。
- **個人の PDF を dev-vault・リポジトリ・テストに入れない**（リポジトリは公開。dev-vault で試したノート・PDF・画像は `.gitignore` で除外している）。テスト用の PDF は `dev-vault/PDF/` にある自作のもの（Ghostscript で生成。個人情報なし）だけを使う。
- 設定が必要になったら、宣言的な設定タブ（`PluginSettingTab.getSettingDefinitions()`、1.13.0+）で作る。`display()` は使わない。
- dev-vault をユーザーが Obsidian で開いて `npm run dev` を動かしているときは、ソースを保存するたびにその dev-vault に反映される。E2E は dev-vault のコピー（`E2E_VAULT`）で行う。
- ユーザーの本番 Vault（`~/Documents/Obsidian Vaults/` 配下など）と本番の Obsidian（起動中のアプリ・Obsidian CLI）には絶対に触らない。動作確認は `dev-vault/` と `npm run e2e` の隔離インスタンスのみ。
- Fitness Log のハーネスと同時に動かせるよう、E2E のプロファイルは `pdf-tools-e2e-profile`、ポートは 9334（Fitness Log は 9333）。開発用 Vault のフォルダ名はどちらも `dev-vault` なので、Obsidian の Vault 一覧では同じ名前で並ぶ。
- UI 文言は日本語で `src/i18n/ja.ts` に集約する。英単語を混ぜるときは sentence case（例: "vault" は小文字）。
- CSS のクラスは `pdf-tools-` を接頭辞にする。SVG 要素の `cls` は空白区切りにしない（配列で渡す）。
- `minAppVersion` は `1.13.0`（開発機の Obsidian は 1.14.4）。1.14 以降専用の API を使う場合は manifest と versions.json を更新する。

## 未決事項

プラグイン名/id（`pdf-tools` は仮。コミュニティには `pdf-plus` など PDF 系のプラグインが 70 以上ある）、ライセンス、英語 UI（i18n の仕組みはある）。設計上の未決事項は `docs/implementation-plan.md` の最後の節。
