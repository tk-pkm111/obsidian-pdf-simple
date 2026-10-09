# PDF Simple

**PDF は、なぞるだけ。** Obsidian で PDF を読みながら文字をなぞると、ハイライトした文がノートにたまっていくプラグインです。書き写しも、整理も、もういりません。

> English: Highlight PDFs in Obsidian's built-in viewer and collect the highlighted text in a paired note, with jumps both ways. The UI follows Obsidian's language (English or Japanese). See the [English guide](#english).

https://github.com/user-attachments/assets/5667a2b6-7cd8-47cd-9c57-350b813780ce

## できること

| | |
|---|---|
| **なぞってハイライト** | PDF の文字をマウスで選ぶと、すぐに塗られて、その文がノートに入ります。段落や箇条書きの形もそのまま入ります。 |
| **ペンで色と見出し** | PDF の右上のペンで、色と見出し（見出し 1〜3）を切り替えます。章の見出しを先に引いておけば、本文はその章の下に入ります。 |
| **表と裏を行き来** | ノートの点を押すと PDF の該当箇所へ、PDF のハイライトを押すとノートへ移ります。ノートの文は自由に書き換えられます。 |
| **図は画像で** | PDF の一部を四角で囲むと、PNG の画像としてノートに貼られます。 |
| **入れる場所を決める** | 決まった見出しの下に入れられます。ノートの末尾に Excalidraw などのデータがあれば、その手前に入ります。 |
| **PDF を自動で整理** | ハイライトした PDF を、決めたフォルダへ自動で移します。 |

PDF ファイル自体は書き換えません。ノートに残るのはテキストだけ（`引用したテキスト ^hl-xxxxxx`）で、PDF 上の位置と色はノートのプロパティ `pdf-highlights` に記録します（プロパティ欄では隠れます）。

## はじめかた

1. 下の「インストール」の手順で入れて、有効にする。
2. 最初に開く「PDF Simple へようこそ」の画面で、2 分の動画を見る（あとからコマンド「使い方を見る」か、「設定 → PDF Simple」のいちばん上でも開けます）。
3. PDF を開いて、文字をマウスでなぞる。PDF と同じ名前のノートができて、なぞった文が入ります。
4. 必要なら「設定 → PDF Simple」で、ハイライトを入れる見出しや PDF の保存先を決める。

画面の文言は、Obsidian の言語が日本語なら日本語、それ以外なら英語で出ます。

## インストール

コミュニティプラグインに登録されるまでは、[BRAT](https://github.com/TfTHacker/obsidian42-brat) で入れる。

1. Obsidian のコミュニティプラグインで「BRAT」を入れて有効にする。
2. コマンドパレットで BRAT の「Add a beta plugin for testing」を実行し（BRAT の設定画面の「Add beta plugin」でも同じ）、`tk-pkm111/obsidian-pdf-simple` を入れる。
3. 設定 → コミュニティプラグインで「PDF Simple」を有効にする。

以前の名前（PDF Tools、`tk-pkm111/obsidian-pdf-tools`）で入れていた場合は、PDF Tools を削除してから入れ直す（BRAT の一覧からも外す）。ノートのハイライトはそのまま使える。設定は入れ直しになる。

開発中のため、大事な保管庫で使うときはバックアップを取っておくこと（PDF ファイル自体は書き換えないが、ノートには書き込む）。

## English

PDF Simple lets you highlight PDFs in Obsidian's built-in viewer and collects the highlighted text in a note paired with the PDF. A getting started screen opens on first load (the video is in Japanese); open it again with the command "Show getting started".

- **Trace to highlight**: select text in the PDF with the mouse. It is highlighted right away, and the text is added to the paired note, keeping its paragraphs and lists.
- **Pen**: the pen at the top right of the PDF switches colors and heading levels (H1 to H3). Mark chapter headings first, and body text goes under its chapter in PDF order.
- **Jump both ways**: click the dot after a highlight in the note to open the PDF there, and click a highlight in the PDF to jump to the note. Edit the note text freely.
- **Capture regions**: draw a rectangle on the PDF to save it as a PNG and embed it in the note.
- **Where highlights go**: choose headings to insert under. Highlights go before Excalidraw data or hidden `%%` comments at the end of a note.
- **PDF storage**: highlighted PDFs can be moved into a folder automatically, and Obsidian updates the links.

The PDF file is never modified. The note keeps only the text (`quoted text ^hl-xxxxxx`), and positions and colors are stored in the note property `pdf-highlights` (hidden in the properties panel).

To get started, install the plugin (until it is listed in the community directory, add `tk-pkm111/obsidian-pdf-simple` with [BRAT](https://github.com/TfTHacker/obsidian42-brat)), open a PDF, and select text with the mouse. A note with the PDF's name is created and the text is added. Optionally, set the headings for highlights and the PDF storage folder in **Settings → PDF Simple**.

**Network use**: the getting started video is loaded from GitHub (github.com) only when you press play. The plugin makes no other network requests and never sends your PDFs or notes anywhere.

## 使い方（くわしく）

1. **PDF を開いて文字をマウスで選ぶ**。指を離した瞬間に、ペンの色と書き方（本文か見出し）で塗られる。英単語の途中で選択が切れていたら、単語の端まで広げる。
   - Alt（Option）を押しながら選ぶと塗らない（コピーしたいとき）。
   - PDF の右上のペンのボタンで、色・書き方（本文／見出し 1〜3）・塗り方（すぐ塗る／色を選んでから塗る／塗らない）を切り替える。書き方を見出しにすると、本文に戻すまで続けて見出しを引ける（章の見出しだけ先に引いていくときに便利）。
   - 色を選んでから塗る設定のときは、選んだ文字の近くに色のボタンと「見出し」のボタンが出る。「見出し」にマウスを乗せると、上に見出し 1〜3 が出る（その 1 回だけ見出しにする）。
   - キーボードやスマホの指で選んだときは、色のボタン（スマホでは画面の下のバー）が出る。ペアのノートがまだ無い PDF でも、最初の 1 回だけ色のボタンが出る（押すとノートができる）。
   - 誤って塗ったら、PDF のハイライトを右クリックして「ハイライトを削除」か、コマンド「直前のハイライトを取り消す」。
2. ハイライトのテキストが、その PDF のノート（表）に 1 段落で追加される（前後に空行）。ノートが無ければ `<PDF の名前>.md` を作る。
   - **段落の形のまま入る**: 複数行を選んでも、PDF の行の折り返しはつなぎ、段落や箇条書き（・ ① 1. など）の切れ目は改行のまま残す。
   - **入る場所**: 何も指定しなければ、ノートの最後に入る。ノートの最後に、ほかのプラグインが使うデータ（Excalidraw の図のデータ（`# Excalidraw Data` から後ろ）や、`%%` で囲んだ隠しコメント）があれば、その手前に入る。
   - **決まった見出しの下に入れる**: 設定「ハイライトを入れる見出し」に、1 行に 1 つ、Markdown の見出しと同じ形で書く（例: `## Summary`）。その見出しがあるノートでは、その下に入る。`#` の数と大文字・小文字まで同じ見出しだけが対象（`#` を付けずに `Summary` と書くと、見出しの大きさは問わない）。
   - **書いた見出しが 1 つのノートに 2 つ以上あるとき**は、最初にハイライトするときに、どれに入れるかを聞く（見出しのボタンが並ぶ。キャンセルするとハイライトしない）。選んだ見出しはそのノートのプロパティ `pdf-highlights-heading` に記録され、以後はそこに入る。
   - **ノートごとに変える**: ノートの見出しを右クリックして「PDF のハイライトをこの見出しの下に入れる」を選ぶ（同じプロパティに書かれる。同じメニューで外せる）。
   - **PDF の順に並ぶ**: 入る場所の中で、引いた順ではなく、ハイライトが PDF の順になる位置に入る。章の見出しを先に引いておけば、あとで引いた本文はその章の見出しの下に入る（設定で「足した順」にもできる）。見出しの下に入れるときは、見出しのハイライトはその見出しより 1 段深くなる（`## Summary` の下なら、見出し 1 は `###`）。
   - **見出し**: ノートに `## 文字` として入り、PDF 側には「H2」などの印が付く。あとから右クリックの「見出しの大きさを変える…」でも変えられる。
   - **範囲を画像にする**: PDF の右上の四角のボタンを押し、ページの上をドラッグして囲む。その範囲が PNG になって添付ファイルの場所に保存され、ノートに貼られる。PDF 側にはその枠が描かれる（枠の線か左上の印を押すとノートへ）。Esc かもう一度ボタンを押すと取り消せる。
3. **PDF のハイライトをクリック** → ノートの該当行へ（同じタブで裏返る）。右クリックで「ノートの該当行を開く／色を変える／テキストをコピー／ハイライトを削除」。Cmd / Ctrl を押しながら乗せると、ノートの該当行をプレビューする。
4. **ノートのハイライトの右上の点をクリック** → PDF の該当箇所へ（中央にスクロールして点滅）。文字のほうは普通のテキストなので、そのままクリックして編集できる（編集中も ID は点のまま）。右クリックでも「PDF で開く／色を変える／PDF とのつながりを外す（文は残す）／ハイライトを削除（行ごと）」。
5. **表と裏の切り替え**: ノートの右上の「PDF を開く（裏面）」、PDF の右上の「ノートに戻る（表面）」。読んでいたページとスクロール位置を覚えている。Cmd / Ctrl を押しながら押すと新しいタブで開く。
6. **ハイライトの行は自由に切り貼りできる**。行ごと（`^hl-…` を含めて）別のノートに貼れば、PDF のハイライトをクリックしたときの行き先も貼った先に変わる。行の前後に自分の文を書き足してもよい。ハイライトのすぐ下に書くと、つながって結びつきが切れないよう、間に空行が自動で入る（行末で Enter を押したときも空行を挟む）。
7. **ハイライトの行を消すと、PDF からも消える**。PDF 側から削除したときは、ノートの文が PDF の文字のままなら行ごと消し、書き換えてあれば文を残してつながりだけ外す。プロパティに残った項目は、コマンド「本文に無いハイライト項目を整理」でまとめて消せる。

### ノートと PDF の対応（ペア）

- ノートのプロパティ `pdf: "[[論文.pdf]]"` で対応づける。コマンド「このノートに PDF を添付」、またはノートのメニュー「PDF を添付…」で設定できる。
- プロパティが無ければ、本文で最初に出てくる PDF へのリンク・埋め込みを使う。

### PDF の置き場所

- 設定「PDF の保存先」にフォルダを書くと（例: `Library/PDF`）、PDF にハイライトしたときや、ノートに PDF を添付したときに、その PDF をそのフォルダへ移す（フォルダが無ければ作る。同じ名前のファイルがあれば番号を付ける）。vault のどこに PDF を入れても、使い始めたときに保存先へ集まる。
- PDF へのリンク（ノートのプロパティや埋め込み）は、Obsidian のファイル移動と同じく新しい場所に直る。
- 自動で移したくなければ「ハイライトしたら保存先へ移す」をオフにする。オフでも、PDF の右クリックメニュー（ファイル一覧、PDF の右上の「…」）の「PDF の保存先へ移す」か、コマンド「PDF を保存先へ移す」でいつでも移せる。
- 保存先の中のフォルダに入っている PDF は動かさない。保存先が空なら、PDF は一切移さない。

### コマンド

| コマンド | 内容 |
|---|---|
| 表と裏を切り替える | ノート ⇄ PDF |
| このノートに PDF を添付 | 添付する PDF を選ぶ |
| この PDF のノートを開く（無ければ作る） | PDF を開いているとき |
| 選択範囲をハイライト / 選択範囲をハイライト（色） | 色ごとにもある。ホットキーやスマホのツールバーに置ける |
| 選んだらすぐハイライトする（オン/オフ） | すぐ塗る ⇄ 塗らない |
| ペンを本文にする / ペンを見出し 1 / 2 / 3 にする | 書き方の切り替え（変えるまで続く） |
| 範囲を画像として取り込む | PDF を開いているとき（右上の四角のボタンと同じ） |
| 直前のハイライトを取り消す | 最後に作ったハイライトを、ノートの行ごと消す |
| カーソル行のハイライトを PDF で開く / 色を変える / 削除 | ノートの編集中 |
| カーソルのある見出しの下に PDF のハイライトを入れる | ノートの見出しの行で（見出しの右クリックと同じ） |
| PDF を保存先へ移す | 開いている PDF（またはノートに添付した PDF）を設定の保存先へ |
| 本文に無いハイライト項目を整理 | 本文から消えたハイライトの記録をプロパティから消す |
| 使い方を見る | 使い方の動画と、できることの一覧を開く |

### 設定

使い方を見る（いちばん上）、色（追加・削除・並べ替え）、既定の色、既定の書き方（本文 / 見出し 1〜3）、文字を選んだとき（すぐハイライト / 色を選んでから / 何もしない）、ハイライトを入れる見出し（1 行に 1 つ。空ならノートの最後）、ハイライトの並べ方（PDF の順 / 足した順）、箇条書きにするか（既定はオフ）、プロパティ欄に記録を出さないか（既定は隠す）、PDF の保存先と、ハイライトしたら自動で移すか、表と裏の切り替え方（同じタブ / 分割）、ペアリングのプロパティ名。

### 制限

- ページをまたぐ選択はハイライトできない（Obsidian 本体の「選択範囲へのリンクをコピー」と同じ）。
- 文字を選べない PDF（スキャン画像だけの PDF）はハイライトできない。
- ノートに埋め込んだ PDF（`![[…]]`）の上には描かない。
- 1 行に 1 つのハイライト。ハイライトの行どうしを 1 行に結合すると、片方は PDF から消える。空行を消してハイライトの段落どうしをつなげた場合も同じ（Obsidian はブロック ID を段落の最後でしか認識しない）。
- 範囲の画像は、取り込んだときの PDF から作る。ハイライトを消しても画像のファイルは消さない（Obsidian で埋め込みを消したときと同じ）。
- Obsidian 本体の PDF ビューの内部構造に合わせて描いている。本体の更新で構造が変わると描けなくなることがあり、そのときは一度だけ通知する（ノートの記録はそのまま残る）。
- PDF を差し替えて文字の位置が変わると、ハイライトは点線で表示される。

## ネット通信について

使い方の動画は、「使い方を見る」の画面で再生ボタンを押したときだけ、GitHub（github.com）から読み込みます。それ以外の通信はしません。PDF やノートの内容を外へ送ることはありません。

## ライセンス

MIT（[LICENSE](LICENSE)）

## 開発

設計: [docs/implementation-plan.md](docs/implementation-plan.md)。開発環境: [docs/harness.md](docs/harness.md)。AI 向けの運用ルール: [CLAUDE.md](CLAUDE.md)。

```bash
npm install
npm run vault:setup        # 開発用 Vault（dev-vault/）に hot-reload を導入
npm run references:fetch   # 公式ドキュメント・公式テンプレートを references/ に取得
npm run dev                # 監視ビルド。dev-vault に自動コピー
```

Obsidian で `dev-vault/` を Vault として開き、コミュニティプラグインを「信頼して有効化」する。以後、ソースを保存すると自動で再読み込みされる。`dev-vault/PDF/` にテスト用の PDF がある（Ghostscript で生成したもの。個人の PDF は入れない）。

| コマンド | 内容 |
|---|---|
| `npm run dev` | 監視ビルド + dev-vault へコピー |
| `npm run build` | 本番ビルド（型チェック込み） |
| `npm run check` | 型チェック + Lint + 整形チェック + テスト |
| `npm run test:watch` | テストの監視実行 |
| `npm run format` | 整形 |
| `npm run e2e -- launch` など | 隔離した Obsidian を起動して画面を自動操作する（[docs/harness.md](docs/harness.md) の「E2E」） |

## 構成

```
src/main.ts          ライフサイクル（登録・onLayoutReady）
src/commands.ts      コマンド
src/actions.ts       コマンド・メニュー・クリックから呼ぶ操作
src/settings-tab.ts  設定タブ（宣言的）
src/i18n/            UI 文言（t('key')）
src/lib/             Obsidian 非依存の純粋ロジック（vitest でテスト）
src/index/           索引（metadataCache の購読）とペアリング
src/note/            ノート側（書き込み・移動・装飾・メニュー）
src/viewer/          PDF 側（本体ビューアの DOM・重ね描き・選択・ツールバー・範囲の取り込み）
src/pdf/             同梱 pdf.js（loadPdfJs）の型と、範囲を PNG にする処理
src/flip/            表⇄裏
src/ui/              モーダル・表示名・使い方の画面（welcome.ts）
tests/               vitest（obsidian は tests/__mocks__/、vault と metadataCache は tests/helpers/ の仮想のもの）
scripts/             dev-vault の準備・参照資料の取得・E2E
```

要件: Obsidian 1.13.0 以上（開発機は 1.14.4）。デスクトップ・モバイル対応（Node.js / Electron API は使わない）。通信は、使い方の動画を再生したときだけ。
