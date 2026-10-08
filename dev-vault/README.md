# 開発用 Vault

PDF Tools プラグインを試すための専用 Vault です。**普段使いの Vault では開発中のプラグインを動かさないでください。** 書き込み処理のバグでノートや PDF を壊す可能性があります。

## 使い方

1. プロジェクトのルートで `npm run dev` を実行する（ビルドして `.obsidian/plugins/pdf-tools/` にコピーし、変更を監視し続ける）
2. Obsidian でこのフォルダ（`dev-vault`）を Vault として開く
3. 初回は「コミュニティプラグインを信頼して有効化しますか」と聞かれるので有効化する
4. `PDF/sample-3-pages.pdf` を開き、文字を選ぶ。選んだ文字の近くに色の丸が並べば動いている（丸を押すとハイライトになり、ノート `sample-3-pages` ができる）

`hot-reload` プラグインが入っているので、ソースを保存するたびに自動で再読み込みされます。再読み込みされないときは **設定 → コミュニティプラグイン** でプラグインをオフ→オンする。

## 中身

- `.obsidian/plugins/hot-reload/` — 自動再読み込み用（`npm run vault:setup` で取得）
- `.obsidian/plugins/pdf-tools/` — ビルド成果物（`npm run dev` / `npm run build` でコピー）
- `PDF/` — テスト用の PDF（自作。個人情報なし）。`sample-1-page` / `sample-3-pages` / `sample-rotated`（`/Rotate 90`）は Ghostscript で、`sample-japanese`（埋め込まないフォント + 定義済みの CMap の日本語。段落・箇条書き・図入り）は `node scripts/make-sample-japanese-pdf.mjs` で作った。**個人の PDF はここに置かない**
- 試しに作ったノート・取り込んだ画像・持ち込んだ PDF は `.gitignore` でリポジトリに入らない（入るのは README・設定・`PDF/sample-*.pdf` だけ）
- それ以外のノートは自由にテスト用に作ってよい
