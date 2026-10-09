# 実装計画: PDF ハイライト（表/裏ノート）

作成日: 2026-10-08。上流設計を固めた記録。

**実装状況（2026-10-08）**: Phase 1〜6 を実装済み。隔離した Obsidian 1.14.4（dev-vault のコピー）で、作成・表示・双方向の移動・切り貼り・削除・色・表裏・設定・スマホ表示の模擬・性能を確かめた（§12 の S10〜S16）。同日、ユーザーが試した結果を受けて第 2 弾（ノートの文字の色なし・箇条書きなし・選んだらすぐ塗る・見出しモード・範囲を画像に・プロパティ欄で記録を隠す）を実装した（§15）。さらに第 3 弾（ノートの文字は普通に編集でき、PDF へは点だけで移る・見出しをペンの書き方と吹き出しに統合・PDF の順にノートへ並べる）を実装した（§16）。第 4 弾で、範囲の画像に文字が出ない PDF がある不具合を直し、選んだ文字を段落の形でノートに入れるようにした（§17）。未実施はスマホ実機での確認と BRAT 配布（GitHub のリポジトリが無いため）。設計から変えた点は §14 と §15。

## 1. 目的と要望

- Obsidian に取り込んだ PDF にハイライト（黄・赤・緑・青など）を付ける。
- PDF を埋め込むとノートの大半を占領するので、ノートを「表」、添付した PDF を「裏」として、ボタンで裏返して全面で PDF を読む。
- 裏で付けたハイライトのテキストが表（ノート）に溜まっていく。
- 表のテキストをクリックすると PDF の該当箇所へ、PDF のハイライトをクリックすると表の該当テキストへ（双方向）。
- 表のテキストは切り取って別ノートに貼って加工できる。貼った先でも PDF からのジャンプが届く。
- 表のテキストを消すと PDF のハイライトも消える。
- ノートにはテキストだけが残る。リンク構文は見せない。目印は小さく。

既存の PDF 系プラグイン（`pdf-plus` など）との違いを 1 行で: **ノートにはテキストだけが残り、位置情報はプロパティに隠れる。PDF 本体は書き換えない。本体の PDF ビューをそのまま使う。**

## 2. 用語

| 用語 | 意味 |
|---|---|
| 表 | Markdown のノート。普通の本文 |
| 裏 | そのノートに添付した PDF を、Obsidian 本体の PDF ビューで全面表示したもの |
| ペアリング | ノートと PDF の対応。ノートのプロパティ `pdf: "[[doc.pdf]]"` |
| ハイライト | PDF 上のテキスト範囲に色を付けたもの。実体は「エントリ」と「本文行」の対 |
| エントリ | ノートのプロパティ `pdf-highlights` の要素。PDF・ページ・範囲・色・ID を持つリンク |
| 本文行 | `==テキスト== ^hl-xxxx` の 1 行。ID でエントリと結びつく |
| 重ね描き層 | 本体 PDF ビューの各ページに重ねる、ハイライトの矩形を描く層 |
| パレット | 設定で持つ色の一覧（名前と hex） |

## 3. 決定事項

| 項目 | 決定 | 理由 |
|---|---|---|
| 裏面の作り方 | 本体の PDF ビュー（view type `pdf`）をそのまま使い、その DOM にハイライト層を重ねる。自前ビューは作らない | 表示・検索・ズーム・スマホ操作を本体に任せられる。`selection=` リンクの意味は本体改変版 pdf.js の `data-idx` で定義されているので、自前ビューでもそれを再現する必要があり、得が無い |
| ノート側の形 | 本文は `==テキスト== ^hl-xxxx` だけ。PDF の位置・色はプロパティ `pdf-highlights` にリンクのリストで持つ | 本文にリンク構文が出ない。行ごと切り貼りすれば別ノートでも結びつきが残る。プラグインを外しても本文は普通のハイライトとして読める |
| ハイライトの正体 | エントリ（位置・色・ID）と本文行（テキストの居場所）の対。PDF ファイルは書き換えない | 壊れても失うのはプラグインの表示だけ。データは全部 Markdown |
| 削除の意味論 | `^hl-xxxx` が vault 全体から消えたら PDF 上から消える。エントリは自動では消さない。エントリのあるノートを削除したときだけ、本文が残っているノートへエントリを移す | 切り取り→貼り付けの間に消さないため。残骸は「整理」コマンドで掃除。ノートを消しても、別のノートに移した本文のハイライトは生き残る |
| ペアリング | `pdf` プロパティ。無ければ本文の最初の PDF 埋め込み/リンク。1 ノート 1 PDF（v1） | 埋め込み無しで済み、ノートが PDF に占領されない |
| 表⇄裏 | 同じタブで入れ替える（既定）。Cmd/Ctrl クリックで分割・新しいタブ。設定で既定を変更可 | 「裏返す」というイメージに合わせる |
| リンクの書式 | 常に wikilink | プロパティ内のリンクは wikilink しか認識されない |
| 書き込み API | 開いているノート → `Editor`、裏で → `Vault.process`、プロパティ → `FileManager.processFrontMatter` | 公式ガイドライン |
| 追記位置 | ノート末尾（既定）。設定で「指定見出しの下」。箇条書き `- ` の有無も設定 | |
| 既存のデモ | `show-pdf-info` コマンドと `src/pdf/read.ts` は Phase 2 で削除 | この機能は pdf.js を直接使わない |
| 色 | 既定パレット: yellow / red / green / blue / purple / orange（Obsidian 既定テーマの `--color-*` 相当の hex）。設定で追加・削除・並べ替え | |

## 4. 全体像

```
ノート（表）                                     PDF（裏 = 本体ビュー + 重ね描き）
┌─────────────────────────────────┐    ┌──────────────────────────────────┐
│ pdf: "[[doc.pdf]]"               │    │ .pdfViewer                          │
│ pdf-highlights:                  │    │  .page[data-page-number=3]          │
│  - "[[doc.pdf#page=3&…&id=hl-k9f2|p.3 …]]" ─┼──▶ │   .textLayer                        │
│                                  │    │    span.textLayerNode[data-idx]     │
│ ==引用テキスト== ^hl-k9f2 ●       │◀───┼─── │   div.pdf-simple-highlight-layer     │
│ ==次の…== ^hl-m3x8 ●             │    │    div.pdf-simple-highlight          │
└─────────────────────────────────┘    └──────────────────────────────────┘
   ● / Cmd+クリック → PDF の該当箇所（本体の一時ハイライトで表示）
   PDF のハイライトをクリック → ノートの該当行

索引（メモリ）: entries(id → PDF/位置/色/所在ノート) ∩ blocks(id → 本文の所在ノート/行) = 描くハイライト
```

## 5. データ設計（保存形式はこのプラグインの公開仕様。後から変えない）

### 5.1 本文行（1 ハイライト = 1 段落。第 2 弾で変更、§15）

```
<text> ^hl-<id>                  文（1 件ごとに前後に空行）
## <text> ^hl-<id>               見出しモードで入れたもの（# の数が大きさ）
![[<png>|<幅>]] ^hl-<id>         範囲を画像として取り込んだもの
- <text> ^hl-<id>                設定「箇条書きにする」がオンのとき（箇条書きどうしは詰める）
- ==<text>== ^hl-<id>            第 1 弾の形（読める・動く。新しくは作らない）
```

- `<text>`: 選択テキストを正規化したもの（改行・連続空白 → 半角空白 1 つ、前後 trim、U+0000 除去）を `escapeNoteText` でエスケープしたもの。行頭の Markdown 記号（`#` `>` `-` `*` `+` `1.` `|` `` ``` `` `---`）と、`[[` `[^` `#tag` `<tag` `$` `%%` `==` の前に `\` を付け、見出し・箇条書き・リンク・コメントなどにならないようにする（表示では `\` は見えない）。空なら作成しない（通知）。本文中のテキストはユーザーが自由に書き換えてよい（PDF 側の位置は変わらない）。
- `<id>`: `[a-z0-9]{6}` の乱数（`crypto.getRandomValues`）。索引にある ID と衝突しないものを選ぶ。Obsidian のブロック ID 規則（英数字とハイフン、行末、直前に空白）に適合。見出しの行末の ID も `cache.blocks` に入る（S17）。
- `<幅>`: PDF を 100% で見たときの幅（CSS px）。画像は 3 倍で描くので、幅を付けないとノートで大きく出すぎる。リンクの形はユーザー設定に従う（`fileManager.generateMarkdownLink` に `!` を付ける）。
- 見え方: 文に色は付けない。ライブプレビューでカーソルが別の行にあるとき・閲覧モードでは、行末に小さな点 ●（PDF と同じ色）。文・点を押すと PDF へ（マウスを乗せたときだけ点線の下線）。カーソルをその行に置くと Obsidian 標準どおり薄い `^hl-xxxx` が見える。ソースモードは生のまま。第 1 弾の `==…==` の行も、このプラグインの行なら色を透明にする。
- 制約: Obsidian はブロック ID を段落の最後でしか認識しない（S18）。空行を挟まずにすぐ下へ文を続けると ID が段落の途中になり、その分は PDF 上から消える。エディタの拡張（`separator-guard.ts`）が、ハイライトの段落の行末での Enter に空行を挟み、すぐ下に書いた・貼ったときは手が止まってから空行を入れる。1 行 1 ハイライト。

### 5.2 エントリ（プロパティ `pdf-highlights`、文字列のリスト）

```
"[[<linktext>#page=<P>&selection=<B>,<BO>,<E>,<EO>&color=<NAME>&id=hl-<id>|p.<P> <text の先頭 20 字>]]"
```

- `<linktext>`: `metadataCache.fileToLinktext(pdfFile, notePath)`（ユーザーの「新しいリンクの形式」設定に従う。必ず `.pdf` 付き）。
- `P`: 1 始まりのページ。`B` / `E`: そのページのテキスト要素番号（本体改変版 pdf.js が `span.textLayerNode` に付ける `data-idx`。空文字の要素も番号を消費するので DOM には欠番がある）。`BO` / `EO`: 要素の文字列内の UTF-16 オフセット（`EO` は exclusive）。`(B,BO) < (E,EO)` に正規化。
- `NAME`: パレット名 `^[a-z][a-z0-9-]{0,31}$`（URL エンコード不要な文字だけ）。未知の名前は既定の強調色で描く。
- 範囲を画像として取り込んだものは `selection=` の代わりに `region=<L>,<T>,<R>,<B>`（回転前のページに対する 0〜1 の割合、小数 4 桁）。両方あれば selection を使う。表示名は `p.<P> 画像`。本体は region を無視するので、リンクを押すとそのページが開く。
- 書き込み時の並びは `page, selection（または region）, color, id`。読み取りは順不同、未知のパラメータは保持。`id` が無いものは無視。
- 表示名 `p.3 引用テキスト…` はプロパティ画面で読みやすくするためだけのもの。識別子は `id`。
- 本体ビューアは `page` / `selection` だけを解釈し、`color` / `id` は無視する（1.14.4 の `applySubpath` が `URLSearchParams` で `page / offset / annotation / selection / height` のみ読む）。したがってプロパティ画面のリンクをクリックすると本体が該当箇所を開いて一時ハイライトする。
- 位置の識別子 = `(pdfPath, P, B, BO, E, EO)`（キー `P:B:BO:E:EO`）。範囲は `P:r:L,T,R,B`。同じ位置のエントリが複数ノートにあれば 1 つのハイライトとして描き、クリック時に行き先を選ばせる。
- プロパティ名は `pdf-highlights` に固定（第 2 弾で設定を廃止）。ノートのプロパティ欄では CSS で行を隠す（設定で戻せる。「ファイルのプロパティ」パネルとソースモードでは見える）。

### 5.3 索引（メモリ上。起動時に構築、以後は差分更新）

| 名前 | 中身 | 出所 |
|---|---|---|
| entries | `id → { pdfPath, page, selection, color, entryNotePath, displayText }` | 各ノートの `CachedMetadata.frontmatterLinks`（`key` が `pdf-highlights` または `pdf-highlights.<n>`）のうち `selection=` と `id=` を持つもの。`getFirstLinkpathDest(path, notePath)` で PDF を解決 |
| blocks | `id → [{ notePath, line, level }]` | 各ノートの `CachedMetadata.blocks` のうち `hl-` で始まるキー。`level` はその行の見出しの大きさ（`CachedMetadata.headings`。見出しでなければ 0。PDF 側の「H2」の印に使う） |
| pending | 作成直後の entries/blocks | キャッシュ反映（保存後 1〜2 秒）まで即時描画するため |
| highlights(pdf) | entries のうち pdfPath が一致し、blocks に 1 件以上あるもの | 描画・クリックの対象 |

- 更新: `metadataCache.on('changed' | 'deleted' | 'resolve')`、`vault.on('rename')`。対象 PDF 単位で `change` を発火し、重ね描き層が再描画する。
- 起動: `onLayoutReady` 後に `resolvedLinks` から PDF へリンクするノートだけを `getCache` で走査（全ノートを読まない）。

### 5.4 ペアリング

- `pdf: "[[doc.pdf]]"`（プロパティ名は設定で変更可）。読み取りは `frontmatterLinks`（`key === 'pdf'`）→ `getFirstLinkpathDest`。無ければ本文の `.pdf` 埋め込み/リンクの最初の 1 件。
- 逆引き（PDF → ノート）: 直近に裏返したペア（leaf ごとのメモリ）→ `pdf` プロパティがこの PDF を指すノート（`resolvedLinks` から候補を絞って判定）→ 複数なら選択モーダル → 無ければ「この PDF のノートを作る」（`fileManager.getNewFileParent` + `vault.create`、プロパティ付き）。

### 5.5 設定（`data.json`）

| キー | 型 / 既定 | 意味 |
|---|---|---|
| `settingsVersion` | `4` | data.json の形の版（第 2 弾で追加） |
| `palette` | `{name, color(hex), label}[]` / 6 色 | ハイライトの色 |
| `defaultColor` | `'yellow'` | 今の色（すぐ塗るとき・色を指定しないコマンド。PDF 右上のペンでも変わる） |
| `selectAction` | `'highlight' \| 'popup' \| 'none'` / `'highlight'` | マウスで文字を選んだとき: すぐ塗る / 色の吹き出し / 何もしない |
| `defaultHeading` | `0`〜`3` / `0` | ペンの書き方（0 は本文、1〜3 は見出しの大きさ。第 3 弾） |
| `insertPosition` | `'order' \| 'end'` / `'order'` | 入れる場所の中での並べ方: PDF の順 / 足した順（第 5 弾、§18） |
| `insertHeading` | `''` | ハイライトを入れる見出し（入力欄の文字のまま。1 行に 1 つ、`## Summary` なら大きさも、`Summary` なら名前だけ。大文字・小文字も同じものだけ。その見出しがあるノートでは、その節に入れる。空なら本文の最後。§18・§19） |
| `bulletList` | `false` | `- ` を付けるか（第 2 弾で既定をオフに） |
| `flipMode` | `'same-leaf' \| 'split'` / `'same-leaf'` | 表⇄裏の既定動作 |
| `pairingProperty` | `'pdf'` | ペアリングのプロパティ名（`pdf-highlights`・`pdf-highlights-heading` は不可） |
| `hideEntriesProperty` | `true` | ノートのプロパティ欄で `pdf-highlights` の行を隠す |
| `pdfFolder` | `''` | ノートと組にした PDF を置くフォルダ（入力欄の文字のまま。空なら移さない。§20） |
| `autoMovePdf` | `true` | PDF にハイライトしたとき・ノートに添付したときに、保存先へ自動で移す（§20） |

読み込み時に `normalizeSettings()` で検証（名前の重複・hex・既定色の存在）。版の無いもの（第 1 弾）は移して保存し直す: `showSelectionPopup` が false なら `selectAction: 'none'`、それ以外は `'highlight'`。`bulletList` はオフ（第 1 弾は設定画面を開くと既定値ごと保存していたため、保存された true はユーザーが選んだ値とは限らない）。`entriesProperty` は捨てる。版 3 までの `insertPosition: 'heading'` は、その見出し（`#` が無ければ `## ` を付けた形。版 3 と同じ照合）を `insertHeading` にして `'order'` に移す。ほかのときの `insertHeading`（保存されていた既定値 `'## ハイライト'`）は使わず空にする。

### 5.6 ノートごとの入れる見出し（プロパティ `pdf-highlights-heading`）

- そのノートでハイライトを入れる見出し（`pdf-highlights-heading: "## Summary"`。設定と同じ指定の形）。ノートの見出しの右クリック「PDF のハイライトをこの見出しの下に入れる」かコマンド、または設定の見出しが 2 つ以上あるノートでモーダルから選んだときに書く。同じメニューで外す（プロパティを消す）。
- 名前は固定。プロパティ欄では隠さない（自分で選んだ設定なので、見えて直せるほうがよい）。
- 入れる場所は、このプロパティの見出し → 設定の見出し → 本文の最後、の順に探す（ノートに無い見出しは飛ばす）。設定の見出しがノートに 2 つ以上あれば聞く（§19）。
- モーダルで選んだ見出しは、本文を書いて保存したあとで書く（先に書くと、そのノートを開いているエディタが古い本文を保存し直して、プロパティが消える）。

## 6. 画面・操作設計

### 6.1 表（Markdown ビュー）

- ヘッダーのアクション「PDF を開く（裏面）」: ペアがあるノートだけに付ける（`ItemView.addAction`。付けた要素は WeakMap で管理し、unload で外す）。
- 本文の装飾:
  - ライブプレビュー: CM6 の `ViewPlugin`（`registerEditorExtension`）が、行末が ` ^hl-xxxx` の行の `==…==` 範囲に `pdf-simple-mark` と色（`--pdf-simple-hl`）を付け、カーソルがその行に無いときは ` ^hl-xxxx` を点 ● のウィジェットに置き換える。● クリック / テキストの Cmd+クリック → PDF の該当箇所。
  - 閲覧モード: `registerMarkdownPostProcessor` が `getSectionInfo` の行範囲から該当行を見つけ、`<mark>` に同じクラスと ● を付ける。クリック → PDF の該当箇所。
- 右クリック（`editor-menu`、カーソル行がハイライトのとき）: 「PDF で開く」「色を変更 ▸」「ハイライトを削除」。
- 追記: 作成時に本文へ 1 行追加（末尾 or 見出しの下）。ノートがエディタで開いていれば `Editor`（Undo 可）、そうでなければ `Vault.process`。エントリは `processFrontMatter`。

### 6.2 裏（本体 PDF ビュー）

- ヘッダーのアクション「ノートに戻る（表面）」。
- 重ね描き層: `.page` の直下、`.textLayer` の直前に `div.pdf-simple-highlight-layer`（`inset: 0`、`z-index: 0`、`pointer-events: none`、`mix-blend-mode: multiply`）。Obsidian は `.textLayer` を `opacity: 0.2` にしているので、その中に置くと色が 2 割の濃さになる（S10）。各ハイライトは `span.textLayerNode[data-idx=B]`〜`[data-idx=E]` の文字位置で DOM Range を作り `getClientRects()` → 回転前のテキスト層に対する割合（0〜1）にしてキャッシュし、描くときに回転を戻してページに対する % で `div.pdf-simple-highlight`（色は `--pdf-simple-hl`）。割合で持つのでズーム・回転で測り直さない。「テーマに合わせる」で暗い紙面のときは乗算をやめる。
- 再描画: `view.contentEl` の MutationObserver（`childList` + `subtree`）。`.textLayer` / `.textLayerNode` / `.canvasWrapper` の追加、または自層の消失（pdf.js はズーム時に `.page` 直下の知らない子要素を外す。S6）でそのページを dirty にし、60 ms デバウンスで描き直す。描く内容（キー・色・矩形の署名）が前と同じなら DOM を作り直さない（点滅を保つ）。`.textLayerNode` の内側の変化（本体の一時ハイライトは span の中身を組み替える）は無視。
- クリック: `.page` の pointerdown/pointerup（移動 5 px 以内・テキスト選択なし）で当たり判定 → ノートの該当行へ。右クリック / 長押し: `contextmenu` を capture で先取りし、ハイライトに当たったときだけ本体のメニューを抑止して自前の `Menu`（「ノートの該当行へ」「色を変更 ▸」「ハイライトを削除」「テキストをコピー」）。外れたときは本体のメニューをそのまま出す。
- 作成: `document` の `selectionchange`（ポップアウト対応で `view.containerEl.doc` ごとに 1 回登録）。選択が 1 ページ内の `.textLayer` に収まるとき、選択の上に色の点が並ぶ吹き出し（`div.pdf-simple-selection-popup`）を出す。スマホは `view.contentEl` 下部に固定バー（本体の右クリックメニューはデスクトップ限定なので必須）。点を押す → ハイライト作成 → 即時描画（pending）。同じ位置が既にあれば通知して作らない。ページをまたぐ選択は対象外（本体も同じ）。
- 削除（PDF 側から）: 本文の行がハイライトだけなら行ごと削除、ほかの文があるなら ` ^hl-xxxx` と `==` だけ外して本文を残す。エントリも削除。
- 色変更: エントリの `color=` だけ書き換える。

### 6.3 表⇄裏

- 表 → 裏: `leaf.openFile(pdfFile, { eState: { subpath: '#page=<前回のページ>' } })`。裏 → 表: `leaf.openFile(noteFile, { eState: 前回の表のエフェメラル状態 })`。leaf ごとに `{ notePath, pdfPath, page, noteEState }` を WeakMap で覚える。本体の履歴（戻るボタン）にも積まれる。
- PDF のハイライト → ノート: 同じタブなら `leaf.openFile(note, { eState: { subpath: '#^hl-xxxx' } })`（Markdown ビューがブロック ID を解決して該当行へスクロールし一時強調する）。ノートが別のタブで既に開いていればそちらを前面に出して `setEphemeralState`。Cmd/Ctrl クリックは `Keymap.isModEvent` で新しいタブ/分割。
- ノート → PDF: `leaf.openFile(pdf, { eState: { subpath: '#page=N' } })`（ページだけを渡す）。`selection=` まで渡すと本体の一時ハイライトが残ってこちらの色と混ざるので、該当箇所へのスクロール（中央）と点滅は重ね描きが行う（S15）。同じ PDF のビューが既に開いていればそれを前面に出して `setEphemeralState({ subpath })`。

### 6.4 コマンド（id は公開後に変えない）

| id | 名前（日本語） | 条件 |
|---|---|---|
| `flip` | 表と裏を切り替える | Markdown ビュー（ペアあり）/ PDF ビュー |
| `attach-pdf` | このノートに PDF を添付 | Markdown ビュー |
| `create-note-for-pdf` | この PDF のノートを作る | PDF ビュー |
| `highlight-selection` | 選択範囲をハイライト（既定の色） | PDF ビューで選択あり |
| `highlight-selection-<name>` | 選択範囲をハイライト（<色名>） | パレットごとに登録（変更時に `removeCommand` → 再登録） |
| `open-highlight-in-pdf` | カーソル行のハイライトを PDF で開く | エディタ |
| `remove-highlight-at-cursor` | カーソル行のハイライトを削除 | エディタ |
| `insert-under-heading` | カーソルのある見出しの下に PDF のハイライトを入れる | PDF を添付したノートの、ハイライトでない見出しの行（第 5 弾） |
| `move-pdf-to-folder` | PDF を保存先へ移す | 開いている PDF か、開いているノートに添付した PDF が、保存先の外にあるとき（第 7 弾） |
| `clean-orphan-entries` | 本文に無いハイライト項目を整理 | いつでも（確認モーダル付き） |

既定のホットキーは付けない。文言は `src/i18n/ja.ts`。

### 6.5 設定タブ（宣言的 `getSettingDefinitions()`、1.13.0 の範囲のみ）

- 「色」グループ（`type: 'list'`、`addItem` / `onDelete` / `onReorder`。各行は名前を `name`、`control: { type: 'color', key: 'palette.<i>.color' }`。`getControlValue` / `setControlValue` を上書きしてドット付きキーを扱う）。
- 既定の色（`dropdown`、選択肢はパレット）、ハイライトを入れる見出し（`text`）と並べ方（`dropdown`）、箇条書き（`toggle`）、切り替え方法（`dropdown`）、プロパティ名 2 つ（`text`、`validate` で YAML キーとして妥当か）、吹き出し（`toggle`）。
- 1.13.1 専用のメンバー（`search` / `displayValue` / `status` / `displayFormat` / `addDisplayValue`）は使わない（`minAppVersion` 1.13.0 のまま）。

## 7. 使う API と根拠

公式 API（`obsidian.d.ts` 1.13.1 で確認。括弧は行）:

- 表示・leaf: `Workspace.getLeaf` (7877/7892)、`getActiveViewOfType` (7989)、`getLeavesOfType` (8015)、`iterateAllLeaves` (8009)、`openLinkText` (7914)、`revealLeaf` (8029)、`on('active-leaf-change' | 'file-open' | 'layout-change' | 'file-menu' | 'editor-menu')`、`WorkspaceLeaf.openFile` (8257)、`isDeferred` / `loadIfDeferred` (8279/8285。`instanceof` 判定のみで `loadIfDeferred` は使わない)、`View.containerEl` / `setEphemeralState` (7615/7669)、`ItemView.addAction` (3604)、`FileView.file` (3138)、`MarkdownView.editor` / `getMode` (4191/4214)、`Keymap.isModEvent` (3661)。
- 索引: `MetadataCache.resolvedLinks` (4438)、`getFileCache` / `getCache` (4417/4422)、`getFirstLinkpathDest` (4411)、`fileToLinktext` (4431)、`on('changed' | 'deleted' | 'resolve')` (4453–4466)、`CachedMetadata.frontmatterLinks` (1458、`key` / `link` / `displayText`)、`blocks` (1462、`BlockCache.id` + `position`)、`parseLinktext` (4798。`subpath` は `#` 付き)。
- 書き込み: `Vault.process` (7510)、`FileManager.processFrontMatter` (2954)、`Editor.replaceRange` / `getRange` / `setSelection` / `scrollIntoView` / `posToOffset` (2470/2460/2490/2536/2566)、`Vault.create` (7386)、`FileManager.getNewFileParent` (2893)。
- UI: `Menu` / `MenuItem` (4245/4313)、`Notice` (4613)、`FuzzySuggestModal` (3294)、`Platform` (4823)、`debounce` (2232)、`setIcon` / `setTooltip` (5689/6711)、DOM ヘルパ `createDiv` / `empty` / `setCssProps` / `instanceOf` / `el.doc` / `el.win`、`registerDomEvent(Document | HTMLElement)` (1898/1904)、`registerEditorExtension` (5019)、`registerMarkdownPostProcessor` (4992)、`editorInfoField` (2603)。
- 設定: `PluginSettingTab.getSettingDefinitions` / `getControlValue` / `setControlValue` (5159–5173)、`SettingDefinitionList` (6157)、`SettingColorControl` (5866)。

本体の実装で確認した事実（1.14.4 の asar を読み取り専用で grep。公式 API ではないので「依存」と「利用」を分ける）:

| 事実 | 扱い |
|---|---|
| `TextLayer._appendText` が各要素に `span.dataset.idx = textDivs.length` と `class="textLayerNode"` を付ける（空文字の要素は DOM に入れないが番号は進む） | 依存する（`selection=` の意味そのもの）。`src/viewer/dom.ts` に閉じ込める |
| `getTextSelectionRangeStr(pageEl)` = 選択の両端から最寄りの `.textLayerNode` を探し、`data-idx` と「その span 内の先行テキストノード長 + offset」で `b,bo,e,eo` を作る。両端が同じ `.page` に無ければ null | 同じ計算を `src/viewer/text-range.ts` に実装し、E2E で本体の出力と一致を確認 |
| `applySubpath` は `URLSearchParams` で `page / offset / annotation / selection / height` だけ読む | `color` / `id` を足しても安全 |
| 本体の一時ハイライトは `.textLayerNode` の中身を `span.mod-focused.selected.appended` に組み替える | MutationObserver はその内側を無視。オフセット計算はテキストノードを合算 |
| PDF ビュー `VIEW_TYPE = 'pdf'`、`setEphemeralState({ subpath, focus })` → `applySubpath`。`openLinkText` も `eState.subpath` 経由 | `eState.subpath` を使う。d.ts には無いキーなので 1 関数 `revealInPdf()` に閉じ込める |
| Markdown ビュー `setEphemeralState` は `subpath`（見出し/ブロックを解決して `line` に変換）・`line` / `startLoc` / `endLoc`・`cursor`・`scroll`・`focus` を受け取る | `eState.subpath = '#^hl-xxxx'` を使う。失敗時は `Editor.setSelection` + `scrollIntoView` に退避 |
| ビューアの DOM: `view.contentEl > .pdf-toolbar + .pdf-container > … > .pdf-viewer-container（本体の contextmenu / pointerdown はここ）> .pdfViewer > .page[data-page-number] > .canvasWrapper / .textLayer / .annotationLayer` | セレクタは `src/viewer/dom.ts` のみ。見つからなければ重ね描きを諦めて 1 回だけ通知（本文・プロパティ・リンクは本体の機能で動き続ける） |
| 本体の右クリックメニューはデスクトップ限定。スマホはコピー時にリンクを付け足すだけ | スマホ用の下部バーは必須 |
| 本体の注釈ハイライトは `.annotationLayer` 内に % 指定の `div.boundingRect.mod-focused` を作る | 同じ「% で持つ」方式を採用 |

公式ヘルプで確認: `![[Document.pdf#page=3]]`、`#height=400`。`selection=` はヘルプに無く、本体の「選択範囲へのリンクをコピー」が生成する形式（`[[Pdf.pdf#page=2&selection=10,2,25,10|Pdf, page 2]]`）。プロパティ内のリンクは `"[[Link]]"`（文字列・リスト両方）が認識される。

## 8. モジュール構成

`src/lib/` は `'obsidian'` を import しない純粋ロジック（vitest は node 環境・DOM なし）。DOM に触るのは `src/viewer/` と `src/note/decorations.ts` / `post-processor.ts` だけ。各ファイル 250 行以下を目安に分割。

| ファイル | 役割（主な関数） |
|---|---|
| `src/main.ts` | 設定の読み込みと正規化、`registerCommands`、`addSettingTab`、`onLayoutReady` でサービス起動とビュー走査 |
| `src/commands.ts` | §6.4 のコマンド |
| `src/settings.ts` / `src/settings-tab.ts` | 型・既定値・`normalizeSettings`／宣言的設定タブ |
| `src/i18n/ja.ts` | 文言 |
| `src/lib/types.ts` | `TextPoint` `PdfSelection` `PdfSubpath` `Entry` `BlockRef` `Highlight` `PaletteEntry` |
| `src/lib/linktext.ts` | `splitLinktext(linktext)`（最初の `#` で分割、subpath は `#` 付き） |
| `src/lib/pdf-subpath.ts` | `parsePdfSubpath` / `formatPdfSubpath` / `setParam(subpath, key, value)`（未知パラメータ保持、並び固定） |
| `src/lib/pdf-selection.ts` | `normalizeSelection` / `isValidSelection` / `selectionKey` / `compareSelections` / `extractText(items, sel)` |
| `src/lib/highlight-entry.ts` | `sanitizeText`、`generateId(taken)`、`buildBodyLine({text,id,bullet})`、`parseBodyLine(line)`、`buildEntryLink({linktext,page,selection,color,id,text})`、`parseEntryLink(link, displayText)`、`recolorEntry(original, color)`、`entryDisplayText(page, text)` |
| `src/lib/highlight-index.ts` | `class HighlightIndex { setNote(path, {entries, blocks}) / removeNote / renameNote / forPdf(pdfPath) / byId(id) / addPending / clearPending }`（戻り値は影響を受けた PDF パス） |
| `src/lib/note-edit.ts` | `insertLine(content, line, {position, heading, bullet})`、`findBlockLine(content, id)`、`removeHighlightLine(content, id)`（行がハイライトだけなら行ごと、でなければ ID と `==` だけ外す）、`offsetToPos` |
| `src/lib/pairing.ts` | `pdfFromCache(cache, property, resolve)`、`notesForPdf(resolvedLinks, pdfPath, pdfOf)`、`defaultNotePath(folder, basename, exists)` |
| `src/lib/geometry.ts` | `toPercentBoxes(rects, ref)`、`mergeLineBoxes`、`hitTest(point, boxes)` |
| `src/index/highlight-service.ts` | `MetadataCache` を購読して `HighlightIndex` を維持。`get(pdfPath)`、`onChange(cb)`、`markPending(...)` |
| `src/index/pairing-service.ts` | `pdfFor(note)` / `notesFor(pdf)` / `attach(note, pdf)`（`processFrontMatter`）/ `createNoteFor(pdf)` |
| `src/note/note-writer.ts` | `Editor`（そのノートをソースモードで開いている `MarkdownView` があるとき）か `Vault.process` の使い分け。`insertHighlight` / `removeHighlight` / `recolor`（エントリは `processFrontMatter`） |
| `src/note/navigate.ts` | `revealBlock(notePath, id, where)`、`revealInPdf(pdfPath, subpath, where)`（既に開いているビューの再利用、`eState` の退避先） |
| `src/note/decorations.ts` | ライブプレビューの `ViewPlugin`（色マーク・● ウィジェット・クリック） |
| `src/note/post-processor.ts` | 閲覧モードの装飾・クリック |
| `src/viewer/dom.ts` | 本体ビューアの DOM 知識をすべてここに: `findPages` / `pageNumber` / `textLayerOf` / `spanByIdx` / `textSpans` / `isInsideTextLayerNode` / `currentPage` / `ensureHighlightLayer` |
| `src/viewer/text-range.ts` | `selectionToPdfSelection(sel, root)` / `pdfSelectionToRange(layer, sel)`（本体の計算と同じ） |
| `src/viewer/view-overlay.ts` | 1 ビュー分: MutationObserver、dirty ページ、`drawPage`、当たり判定、現在ページの追跡（`Component` 派生、`view.register` で unload） |
| `src/viewer/viewer-manager.ts` | PDF ビュー / Markdown ビューの検出、overlay とヘッダーアクションの付け外し（`WeakSet` / `WeakMap`、`instanceof FileView` + `getViewType() === 'pdf'`） |
| `src/viewer/selection-popup.ts` | 色の吹き出し（デスクトップ）/ 下部バー（スマホ） |
| `src/viewer/highlight-menu.ts` | 右クリックメニュー |
| `src/flip/flip.ts` | 表⇄裏、leaf ごとの記憶、`Keymap.isModEvent` |
| `src/actions.ts` | コマンド・メニュー・クリックから呼ぶ操作（作成・移動・色・削除・整理） |
| `src/note/menus.ts` | ノートの右クリック（`editor-menu`）とファイルのメニュー（`file-menu`） |
| `src/ui/modals.ts` | `PdfSuggestModal` / `chooseNote` / `ColorSuggestModal` / `AddColorModal` / `confirmDelete`（`ConfirmationModal`） |
| `src/ui/labels.ts` | 色の表示名 |
| `src/lib/text.ts` | 選択文字列の正規化（日本語の改行は詰める）と `==…==` 用のエスケープ |
| `src/lib/extract.ts` | キャッシュ（frontmatterLinks / blocks）からエントリと本文の ID を読む |
| `styles.css` | `.pdf-simple-highlight-layer` `.pdf-simple-highlight` `.pdf-simple-selection-popup` `.pdf-simple-selection-bar` `.pdf-simple-color-dot` `.pdf-simple-mark` `.pdf-simple-dot`（色は `--pdf-simple-hl`、`color-mix(in srgb, var(--pdf-simple-hl) 35%, transparent)`） |

削除済み: `src/pdf/read.ts`、`show-pdf-info` コマンド、`src/lib/format.ts` とそのテスト（この機能は pdf.js を直接使わない）。

## 9. テストと確認

### 9.1 単体テスト（vitest、`tests/`）

- `pdf-subpath`: `#` 有無、順不同、未知パラメータ保持、`selection` の欠損・非数、`setParam` の置換/追加。
- `pdf-selection`: 逆順の正規化、collapsed は無効、`selectionKey`、`extractText` の 1 要素/複数要素/欠番。
- `highlight-entry`: `sanitizeText`（改行・タブ・`==`・空）、`generateId` の衝突回避、`buildBodyLine` / `parseBodyLine`（箇条書き有無、ID 無し行、途中に `^` がある行）、`buildEntryLink` の厳密な出力、`parseEntryLink`（wikilink/埋め込み/`id` 無し → null）、`recolorEntry`（`color` 無しは追加）。
- `highlight-index`: entries ∩ blocks、同じ位置が 2 ノート → 1 ハイライト 2 行き先、ブロックだけ・エントリだけは描かない、`setNote` の影響 PDF、`renameNote`、pending の反映と解除。
- `note-edit`: 末尾追記（末尾改行あり/なし/空/frontmatter だけ）、見出し下（既存・次の見出しの手前・見出し無し → 作成・コードブロック内の見出しは無視）、`removeHighlightLine` の 3 パターン（行ごと / ID と `==` だけ / 見つからない）、CRLF 保持。
- `pairing`: プロパティ優先、別名付き、本文の最初の PDF、逆引き、`defaultNotePath` の連番。
- `geometry`: % 変換、同じ行の矩形結合、当たり判定の境界。
- `highlight-service` / `note-writer`: `tests/helpers/fake-app.ts` に `FakeMetadataCache`（`resolvedLinks`、`getFileCache`、`getCache`、`getFirstLinkpathDest`、`fileToLinktext`、本文の `[[…]]` / `![[…]]` と frontmatter の `"[[…]]"`（文字列・リスト、キーは `prop` / `prop.<n>`）と行末 ` ^id` の簡易パーサ、vault の `create/modify/rename/delete` で再索引して `'changed'` / `'deleted'` / `'resolve'` を発火）と `FakeWorkspace` + `FakeMarkdownView`（`getMode`、文字列ベースの `FakeEditor`）を追加。モックに `parseLinktext` / `getLinkpath` / `FileView` / `MarkdownView` / `Keymap.isModEvent` / `MenuItem` を追加。
- 任意: `happy-dom` を devDependency に足し、`text-range.ts` だけ `// @vitest-environment happy-dom` でテスト（入れ子の `.markedContent`、分割されたテキストノード、`<br>`、欠番、逆向き選択、ページまたぎ → null）。

### 9.2 E2E スパイク（Phase 0。隔離 Obsidian、`npm run e2e`）

dev-vault をスクラッチパッドにコピーして `E2E_VAULT` で起動する（ユーザーが dev-vault を開いていても衝突しない）。`eval` の中では内部 API（`leaf.view.viewer.child…`）を使ってよいが、製品コードでは使わない。

| # | 確かめること | 方法 |
|---|---|---|
| S1 | ビューアの DOM と `data-idx`（欠番・`<br>`・`.markedContent`・`.page` の枠線幅） | PDF を開き `.page[data-page-number="1"]` の子要素と `span.textLayerNode` の `[idx, textContent]` を返す |
| S2 | 自前の選択→`b,bo,e,eo` が本体と一致する | Range API で選択を作り `leaf.view.viewer.child.getTextSelectionRangeStr(page)` と比較（4 パターン。`<br>` をまたぐ選択を含む）。`app.vault.setConfig('nativeMenus', false)` 後に右クリックメニュー「選択範囲へのリンクをコピー」の結果とも比較 |
| S3 | キャッシュの形 | `Spike.md` に `pdf:` と `pdf-highlights:`（2 件）と `==text== ^hl-k9f2`（段落 / 箇条書き）を書き、`'changed'` を待って `frontmatterLinks`（`key` の形式）・`blocks`・`resolvedLinks`・`getFirstLinkpathDest` を返す |
| S4 | `color=` / `id=` が無視され、一時ハイライトが出る | `leaf.openFile(pdf, { eState: { subpath: '#page=2&selection=1,0,3,4&color=yellow&id=hl-k9f2' } })` 後に `.mod-focused` の数を返す。`openLinkText` 経由も同様 |
| S5 | ノート側の `eState` | `openFile(note, { eState: { subpath: '#^hl-k9f2' } })` をソース/閲覧の両モードで。`openLinkText('Spike#^hl-k9f2')` も |
| S6 | ズームで `.textLayer` と自層がどうなるか | `.page` に目印の div を入れてから `currentScaleValue = '1.5'` にし、残存を返す |
| S7 | スマホ表示 | `setSize(400, 860)` → `app.emulateMobile(true)` → S2 を再実行、ヘッダーのアクション数 |
| S8 | PDF 名の変更でプロパティ内リンクの subpath が保たれる | `fileManager.renameFile(pdf, 'PDF/renamed.pdf')` 後の `Spike.md` の内容 |
| S9 | ライブプレビュー/閲覧モードの DOM クラス（`cm-blockid` `cm-highlight` `<mark>`） | `Spike.md` を開いて該当行の DOM を返す |

結果は「スパイク結果」節に記録する。S2 が不一致なら `text-range.ts` の仕様を直す（本体の計算が正）。

## 10. フェーズ計画

| Phase | 内容 | 完了条件 | ユーザーに見てもらうこと |
|---|---|---|---|
| 0 スパイク（済） | S1〜S9 | 結果が「スパイク結果」に記録されている | なし |
| 1 純粋ロジック（済） | `src/lib/*` と §9.1 のテスト、`FakeMetadataCache` | `npm run check` が通る | なし |
| 2 表示と削除（済） | `highlight-service`、`viewer/dom` `text-range` `view-overlay` `viewer-manager` `highlight-menu`、`note-writer`（削除）、`navigate`。デモコマンド削除 | S3 の `Spike.md` を置いた状態で PDF の 2 ページ目に黄色の矩形が出る。クリックでノートの該当行へ。右クリック → 削除で行が消え矩形も消える。ズーム・回転で追従。`window.__errs` が空 | `PDF/sample-3-pages.pdf` を開いて矩形・クリック・ズームを確認 |
| 3 作成（済） | `selection-popup`、`highlight-*` コマンド、`pairing-service`、`attach-pdf`、ノート作成、pending | 選択 → 色 → ノートに `- ==…== ^hl-…` とプロパティが追加され即座に描画。重複は通知。E2E の S2 相当の一致テスト | デスクトップと `emulateMobile(true)` の両方で作成 |
| 4 表⇄裏（済） | `flip.ts`、ヘッダーアクション、`file-menu`、leaf の記憶、`flipMode` | ノート → ボタン → 同じタブで PDF（前回のページ）→ ボタン → ノート（元のスクロール位置）。Cmd クリックで分割。未ペアなら添付モーダル。ノートが無ければ作成を提案 | 往復と「戻る」ボタン |
| 5 ノート側の装飾と設定（済） | `decorations.ts` `post-processor.ts`、設定タブ、パレット連動のコマンド、`editor-menu` | LP と閲覧で色付き表示と ●。● / Cmd+クリックで PDF へ。設定で色を足すとコマンドと吹き出しに現れる | 両モードと設定タブ（1.14 は別ウィンドウ） |
| 6 堅牢化（スマホ実機・BRAT 以外は済） | ノート削除時のエントリの救出（§14）、`clean-orphan-entries`、PDF 変更時の stale 判定、`registerHoverLinkSource`、300 ページ PDF（Ghostscript 生成）での性能、README、BRAT でスマホ実機 | 300 ページ・200 件でスクロールに引っかかりが無い | iPhone / iPad |

各 Phase の終わりに `npm run check` と E2E のスクリーンショット確認。

## 11. リスクと非目標

| リスク | 対処 |
|---|---|
| 本体ビューアの DOM（`textLayerNode` / `data-idx` / `.page`）が将来変わる | セレクタは `viewer/dom.ts` のみ。見つからなければ重ね描きを止めて 1 回通知。データ（プロパティのリンク・本文）は本体の機能だけで生き残る。S1/S2 を Obsidian 更新時の回帰チェックにする |
| `eState` のキーが非公開 | `navigate.ts` の 2 関数に閉じ込め、公開 API（`Editor.setSelection` + `scrollIntoView`）へ退避 |
| エディタ書き込み → キャッシュ反映の遅れ（1〜2 秒） | pending で即時描画し `'changed'` で整合 |
| 切り取り→貼り付けの途中でエントリが消える | エントリは自動削除しない。整理コマンドのみ |
| 行の結合・ID の手編集でハイライトが消える | README に明記。復旧は「整理」で残骸を見せる |
| プロパティ画面にエントリが並んで煩い | Obsidian の「ドキュメント内のプロパティ: 非表示 / 折りたたみ」で隠せることを案内。表示名を `p.3 …` にして一覧として使えるようにする |
| MutationObserver の負荷 | `contentEl` を 1 つ監視、クラスで早期に捨てる、`.textLayerNode` の内側は無視、80 ms デバウンス、dirty ページだけ描画 |
| スマホの選択 UI | 下部バー + コマンド（モバイルツールバーに置ける）。`emulateMobile` と BRAT で確認 |
| PDF++ との併用 | 同じ DOM に描くので非対応と明記（データはただのリンクなので壊れない） |
| 同じ PDF の差し替えで位置がずれる | 再アンカーは非目標。Phase 6 で stale 表示 |

非目標（v1）: PDF 本体への注釈書き込み（`modifyBinary`）、矩形（領域）ハイライト、ページをまたぐ選択、テキスト層の無いスキャン PDF（OCR なし）、ノート内に埋め込んだ PDF への描画、英語 UI。

## 12. スパイク結果（Phase 0）

2026-10-08、Obsidian 1.14.4（pdf.js 5.3.34）、dev-vault のコピーを `E2E_VAULT` に指定した隔離インスタンスで実施。スクリプトは `eval` に渡した JS（本体内部の `leaf.view.viewer.child` は比較のためだけに使用）。

| # | 結果 |
|---|---|
| S1 | ビューの型 `pdf`、`addAction` あり。`contentEl > .pdf-toolbar + .pdf-container > .pdf-content-container > .pdf-viewer-container > .pdfViewer > .page[data-page-number]`。`.page` は `position: relative`、枠線 4px（デスクトップ）。子は `canvasWrapper` `textLayer` `annotationLayer` `annotationEditorLayer`。`.textLayer` の子は `span.textLayerNode[data-idx]` と `br`、末尾に `div.endOfContent`。`data-idx` は 0,2,3,4,6 と欠番あり（改行だけの要素が番号を消費する）。3 ページ目は表示されるまで描画されない（遅延描画） |
| S2 | テキストノード境界の選択（1 要素内・`<br>` をまたぐ・逆向き）は本体 `getTextSelectionRangeStr` と完全一致（例 `2,2,4,4`）。右クリックメニュー「選択範囲へのリンクをコピー」の出力も同じ数値: `[[sample-3-pages.pdf#page=2&selection=2,2,4,4|sample-3-pages, ページ 2]]`。境界が要素（span 自体）のときは本体が `3,14,3,15` のような値を返す（癖）ので、自前では隣接するテキストノードの位置に正規化する。メニューの項目は「“…” を検索」「コピー」「引用としてコピー」「選択範囲へのリンクをコピー」 |
| S3 | `frontmatterLinks` の `key` は `pdf` / `pdf-highlights.0` / `pdf-highlights.1`、`link` はサブパス込み、`displayText` は別名。`blocks` に `hl-k9f2`（段落）と `hl-m3x8`（箇条書き。`listItems[].id` にも）が位置付きで入る。`resolvedLinks['Spike.md']['PDF/sample-3-pages.pdf'] = 3`（frontmatter のリンクも数える）。`getFirstLinkpathDest('sample-3-pages.pdf', 'Spike.md')` → `PDF/sample-3-pages.pdf`。`fileToLinktext` → `sample-3-pages.pdf` |
| S4 | `leaf.openFile(pdf, { eState: { subpath: '#page=2&selection=2,0,3,4&color=yellow&id=hl-k9f2' } })` で 2 ページ目へスクロールし、該当 span の中身が `mod-focused begin/end selected appended` の入れ子になる（`color` `id` は無視される）。`openLinkText(...)` 経由も同じ。**既に開いている PDF ビューに `setEphemeralState({ subpath })` を呼ぶとスクロールはするが一時ハイライトは付かない**（描画済みページには適用されない）→ 自前の層で短い点滅を描く |
| S5 | `openFile(note, { eState: { subpath: '#^hl-m3x8' } })`: ソースモードでカーソルが該当行（line 9）へ移り `.is-flashing` が付く。開いているビューへの `setEphemeralState({ subpath })` も同様。閲覧モードでも該当要素に `.is-flashing`。`openLinkText('Spike#^hl-k9f2', '')` も同じ。`{ line: 8 }` はカーソル移動のみで点滅なし |
| S6 | ズーム（1.5 倍 → ページ幅）: `.page` 要素は同じまま。**`.page` 直下に足した div は消える**が、`.textLayer` とその中の span（`data-idx` 付き）と `.textLayer` 内に足した div は生き残る。再描画の途中は span の矩形が 0 になる瞬間がある。ページ幅に戻すと span のページ内相対位置（%）は元と同じ値。回転（90°）でも `.textLayer` は同じ要素 |
| S7 | `app.emulateMobile(true)`（スマホ幅）: `.pdfViewer.removePageBorders`、`.page` の枠線 0px、`data-idx` と数値の一致は同じ（`2,2,3,4`）、ヘッダーの `.view-actions` あり |
| S8 | `fileManager.renameFile` で PDF を改名すると、プロパティ内のリンクはパス部分だけ置き換わり、サブパス（`page/selection/color/id`）は保たれる。`resolvedLinks` も追従。**新しい Vault では初回に「リンクを更新」モーダルが出て、`renameFile` の Promise がユーザーの選択まで解決しない**（E2E では先に `app.vault.setConfig('alwaysUpdateLinks', true)`） |
| S9 | ライブプレビュー（カーソルが別の行）: `<span class="cm-highlight">A short list</span> … <span class="cm-blockid">^hl-k9f2</span>`（`==` はウィジェットで隠れる）。カーソル行: `cm-formatting-highlight` の `==` が見え、`cm-blockid` も残る。閲覧モード: `<p><mark data-highlight="">A short list</mark></p>`、箇条書きは `li > mark`、ブロック ID は描画されない。プロパティ欄は `pdf-highlights` をリストとして `.multi-select-pill-content.internal-link[data-href="sample-3-pages.pdf#page=2&…"]` のピルで表示（クリックで本体が PDF の該当箇所を開く） |
| 変更イベント | `Vault.process` で本文を変えると `modify` → `changed`（`cache.blocks` に新しい ID を含む）→ `resolve` → `resolved` の順に発火 |

設計への反映:

- §6.2 の重ね描き層は `.page` 直下に置き、ズームなどで消えたら MutationObserver で足し直す。`.textLayer` の中に置けば消えない（Phase 2 で両方試して決める。`.textLayer` に置く場合は `mix-blend-mode` が効かない可能性があるので半透明色で描く）。
- §6.3 で既に開いている PDF ビューを再利用するときは、本体の一時ハイライトに頼らず自前の層で短い点滅を描く。
- `src/viewer/text-range.ts` は要素境界（span 自体や `.textLayer`）をテキストノードの位置に正規化する。本体はこの場合に値を出さない（または癖のある値を出す）ので、一致を求めるのはテキストノード境界だけ。
- 本体の「選択範囲へのリンクをコピー」の別名は「`<basename>, ページ N`」。自前のエントリの表示名は `p.N <text>` にする（§5.2 どおり）。

### 実装後の確認で分かったこと（S10〜S16）

| # | 結果 |
|---|---|
| S10 | Obsidian は `.textLayer` を `opacity: 0.2` にしている（本体の一時ハイライト `.mod-focused` が淡いのはこのため）。重ね描き層は `.page` の直下・`.textLayer` の直前に移した。ズーム（1.6 倍）・90 度回転・元に戻す、のいずれでも矩形が文字と一致（ずれ 1px 以内） |
| S11 | Obsidian 1.14 の `==…==` の背景色は `--highlight-background`（1.13 は `--text-highlight-bg`）。1.14 には名前付き 6 色の色付きハイライト（`mark[data-highlight="red"]`、`.cm-highlight-red`）がある。任意の色を使うため、行（ライブプレビューは `.cm-line`、閲覧モードは `p` / `li`）に両方の変数を設定して合わせる |
| S12 | 本体のページプレビューは PointerEvent をタッチ操作として無視し、targetEl の上にマウスがあるかで表示を判定する。ホバーは `mousemove` で拾い、targetEl はマウスの下の文字の要素にする（矩形は pointer-events: none なので不可） |
| S13 | `processFrontMatter` はリンクの文字列を二重引用符で囲み、長くても折り返さない。プロパティ欄では `pdf-highlights` がリストのピル（`p.2 Second item`）として並び、押すと本体が PDF の該当箇所を開く |
| S14 | 300 ページ・各ページ 49 行の PDF に 200 件: 索引の再構築 2.2 ms、スクロール中の描き直し 1 回 中央値 0.7 ms・最大 1.8 ms、50 ms を超えるタスク 0 件 |
| S15 | ノートから `#page=N&selection=…` で開くと、本体の一時ハイライト（黄）がクリックするまで残り、重ね描きの色と混ざる。ページだけを渡し、重ね描きが該当箇所を中央にスクロールして 1.6 秒点滅させる |
| S16 | ノートをソースモードで開いて未保存の書きかけがある状態でハイライトを作っても、書きかけ・新しい行・プロパティのすべてがエディタとディスクに残る（Editor → 保存 → processFrontMatter の順） |

## 13. 未決事項

- ライセンス、英語 UI（名前は §21 で PDF Simple に決めた）。
- 1 ノートに複数の PDF を添付する（v1 では 1 つ）。
- 矩形ハイライト・PDF 本体への注釈書き出し（将来の候補）。
- スマホ実機（iPhone / iPad）での選択と色のバーの使い勝手。模擬（`app.emulateMobile(true)`）では、画面下のナビゲーションバーの上にバーを出して作成できることまで確かめた。

## 14. 設計から変えた点

| 項目 | 設計 | 実装 | 理由 |
|---|---|---|---|
| エントリの自動移動 | 本文を別のノートへ移したら、エントリもそのノートへ自動で移す | 移さない。エントリのあるノートが削除されたときだけ、本文が残っているノートへ移す | 移すと、貼り付けた先のノートにプロパティが増えて本文が散らかる（「テキストだけを残したい」という要望に反する）。索引は vault 全体の本文を見るので、移さなくても描画・移動は届く。一番困る「元のノートを消したら位置の記録が消える」だけを救う |
| 重ね描きの置き場所 | `.page` ごと（当初は `.textLayer` の中を検討） | `.page` の直下・`.textLayer` の直前 | S10 |
| ノート → PDF の移動 | `selection=` 付きのリンクで開く | ページだけで開き、スクロールと点滅は重ね描き | S15 |
| ノート側のクリック | 点とテキストの Cmd+クリック | 点・テキストのクリック（カーソルがその行に無いとき。リンクと同じふるまい）。Cmd / Ctrl 付きは新しいタブ | 選択肢の説明で「点やテキストをクリックすると PDF へ」と約束したため。カーソルを置いた行は通常どおり編集できる |
| コマンド | 設計の 8 個 | 設計の 8 個 + 「カーソル行のハイライトの色を変える」 | スマホでも右クリックなしで色を変えられるように |
| 既に開いているタブの再利用 | 相手のファイルを開いているタブがあれば、そこへ移る | 「分割して並べる」ではどのタブでも再利用。「同じタブで入れ替える」では画面に見えているタブ（左右に並べたもの）だけ再利用し、裏に隠れたタブがあってもその場で裏返す | 隠れたタブへ飛ぶと「裏返す」感覚から外れる。並べて読んでいるときは、もう一方の画面が動くほうが自然 |

## 15. 第 2 弾（2026-10-08、ユーザーが試した結果を受けて）

### 15.1 要望と決めたこと

| 要望 | 決めたこと |
|---|---|
| ノートの文字に色が残るのが嫌（点と移動は残す） | 文に色を付けない。行末の点（PDF と同じ色）と、文・点のクリックで PDF へ、は残す。マウスを乗せたときだけ点線の下線。新しい行に `==` を付けない |
| 行頭の `- ` は要らない | 1 件 = 1 段落（前後に空行）。「箇条書きにする」は既定オフ。段落の ID が後ろの文とつながって切れないよう、エディタの拡張で空行を守る（§5.1） |
| PDF の一部を四角で囲んで画像にし、ノートに貼りたい | PDF 右上の「範囲を画像に」→ ドラッグ → 同梱 pdf.js でその範囲を 3 倍で描いて PNG に（添付ファイルの場所へ）→ ノートに `![[画像|幅]] ^hl-…`。PDF 側は枠線（押せるのは枠の線の近くと左上の印だけ） |
| プロパティに記録が溜まって見づらい | 記録はプロパティに置いたまま（名前変更へのリンクの追従・同期・プラグインを外しても残る）、ノートのプロパティ欄では CSS で隠す。別ファイル案は、.md は一覧に増え、.json は Obsidian Sync の既定で同期されないので見送り |
| 色を選ぶ手間をなくし、選んだ瞬間に既定の色で塗る | 既定で「すぐ塗る」。マウス（ペン）で選んで離したときだけ。Alt を押しながらは塗らない。ダブル・トリプルクリックは最後の選択だけ 1 回。キーボード・指の選択は吹き出し（スマホはバー）。ペアのノートがまだ無い PDF は最初の 1 回だけ吹き出し（黙ってノートを作らない）。英単語の途中で切れた選択は単語の端まで広げる |
| 見出しモード（見出し 1/2/3 を選んでから選択 → ノートに見出し） | PDF 右上の「見出し」→ 見出し 1〜3 → 次の選択 1 回だけ `## 文字 ^hl-…`。PDF 側は左上に「H2」。右クリックの「見出しの大きさを変える…」で後からも変えられる。「見出しの下に追記」のときは追記先より深くする |

ほか: PDF 右上のペンのボタン（今の色と塗り方の切り替え）、コマンド `toggle-instant-highlight` / `arm-heading-1〜3` / `capture-region` / `undo-last-highlight`。削除は、PDF 側からは「ノートの文が PDF の文字のままなら行ごと、書き換えられていれば ID だけ外して文を残す」、ノートの右クリックは「行ごと削除」と「PDF とのつながりを外す」の 2 つ。「本文に無いハイライト項目を整理」は全ノートの本文を読み、段落の途中に残っている ID は消さない。

### 15.2 スパイク結果（S17〜S23）

| # | 確かめたこと | 結果 |
|---|---|---|
| S17 | 見出し行末の `^hl-…` | `cache.blocks` に行番号つきで入る（`headings[].heading` は ID 込み）。`#^hl-…` で見出し行へ移動できる。ライブプレビューでは `.cm-blockid`、閲覧モードでは ID が消える |
| S18 | `- ` を外した行 | 空行で区切らないと 1 段落になり、最後の行の ID しか認識されない |
| S19 | `![[x]] ^hl-…` | 段落として ID が付く |
| S20 | プロパティ欄の DOM | `.metadata-property[data-property-key="pdf-highlights"]`。CSS で隠せる |
| S21 | PDF の上部ツールバー | `.pdf-toolbar > .pdf-toolbar-left + .pdf-toolbar-right`（right は空）。ボタンはここに置く |
| S22 | 同梱 pdf.js 5.3.34 で範囲を PNG に | `getViewport({ scale, rotation })` と `render({ canvasContext, viewport, transform: [1,0,0,1,-x,-y] })` で範囲だけ描ける（1250×505 px・97 ms・63 KB）。`rotation` は PDF 自体の回転を置き換える値なので、テキスト層の回転（表示の向き）を渡す。保存先は `getAvailablePathForAttachment`（1.5.7） |
| S23 | 見出しの ID がアウトラインに出るか | 出ない（「Heading two」とだけ出る） |

### 15.3 実装後の確認（隔離した Obsidian 1.14.4、dev-vault のコピー。本物のマウス操作は `npm run e2e -- clickxy / dragxy`）

- 第 1 弾の data.json が移り（`bulletList` オフ・`selectAction: 'highlight'`・`flipMode` はそのまま・`entriesProperty` は消える）、プロパティ欄で `pdf-highlights` だけが隠れ、「ファイルのプロパティ」パネルでは見える
- ドラッグで単語の途中（"cond item"）から選ぶと "Second item" に広がってすぐ塗られ、ノートに `Second item ^hl-…` が空行つきで入る。Alt を押しながらは塗らず選択が残る。ダブルクリックは単語 1 件、トリプルクリックは行 1 件だけ
- 既存のハイライトのクリックでノートの該当行へ。ペアの無い PDF では吹き出しが出て、色を押すとノートができる
- 見出し 2 の予約 → `## A short list ^hl-…` と PDF の「H2」。予約は 1 回で外れる
- 範囲の取り込みで PNG（文字がくっきり）とノートの `![[…png|531]] ^hl-…`。回転（`/Rotate 90`）したページでも、見えている向きで切り抜け、枠もドラッグした位置に描かれる。枠の中のクリックでは移動せず、枠の線と印で移動する
- ハイライトの行末の Enter で空行が入り、すぐ下に書いた文との間にも少し待って空行が入る（ID は認識されたまま）
- PDF の右クリックから削除: ノートの文がそのままなら行ごと、書き換えた文は残る（通知あり）
- 閲覧モードで色なし・点あり・見出しのクリックで PDF の該当箇所が点滅。スマホ表示の模擬で画面下のバーとツールバー（狭い画面ではツールバーが横にスクロールする）。別ウィンドウでもツールバー・描画・プロパティの非表示が効く。「直前のハイライトを取り消す」で行と記録が消える
- いずれも `window.__errs` は空

## 16. 第 3 弾（2026-10-08、第 2 弾を試した結果を受けて）

### 16.1 要望と決めたこと

| 要望 | 決めたこと |
|---|---|
| ノートの文字に点線が出て、押すと PDF へ飛ぶので編集しづらい。点（エイリアス）だけで飛べばよい。いちいち行を開かずに直接編集したい | 文字には何もしない（下線もクリックの移動も無し）。PDF へ移るのは点を押したときだけ（ライブプレビュー・閲覧モードとも）。ライブプレビューでは、カーソルがその行にあっても ID を点のまま見せる（行を「開いた」状態にしない） |
| 見出しのボタンを別に置くより、色の選択の中に入れたい。マウスを乗せると見出し 1〜3 が出るように | PDF 右上の「H」ボタンをやめ、見出しを 2 か所に入れた。①ペンのメニューの「書き方」（本文／見出し 1〜3。変えるまで続く）②色の吹き出しの「見出し」ボタン（マウスを乗せる・スマホは押すと、上に見出し 1〜3 が出る。その 1 回だけ） |
| 見出しを 1 つ引くたびに見出し 2 を選び直すのが面倒。既定の色と同じように、見出しも既定にしたい（見出しだけ先に引いていく人もいる） | 書き方はペンの設定（`defaultHeading`）。見出しにしておけば、本文に戻すまで続けて見出しになる。コマンド「ペンを本文にする」「ペンを見出し N にする」も足した（第 2 弾の 1 回だけの予約 `arm-heading-*` はやめた） |
| 引いた順ではなく構造的に並べたい（1〜3 章の見出しを先に引き、あとで 1 章の本文を引いたら 1 章の見出しの下に入る） | 既定の追記位置を「PDF の順に並べる」にした（`insertPosition: 'order'`）。ノートの中の、同じ PDF のハイライトと比べて、PDF で後ろにある最初のもの（後続）の手前に入れる。後続が無ければ、いちばん後ろのもの（先行）の後ろ（先行が見出しならその節の終わり、文なら次の見出しの手前まで）。比べられるものが無ければ末尾 |

### 16.2 仕組み

- **ID を点のまま編集する**（`src/note/decorations.ts`）: ` ^hl-…` を常に点に置き換え、`EditorView.atomicRanges` で 1 文字のように扱う（カーソルは点の中に入らず、Backspace では点ごと消える）。行末（点の後ろ）をクリックしたときは点の前にカーソルを置く（`select.pointer` の transactionFilter）。
- **ID が効かなくならないように守る**（`src/note/separator-guard.ts`・`src/lib/note-guard.ts`）: 点の前でも後ろでも、段落のハイライトの行末で Enter を押すと ID の後ろで空行を挟んで改行する。End キーなどで点の後ろに書き足した文は、手が止まったら ID の前へ移す（`planMoveIdToLineEnd`）。すぐ下に続けた文との間に空行を入れるのは第 2 弾のまま。
- **PDF の中の順番**（`src/lib/reading-order.ts`・`src/viewer/reading-order.ts`）: 同じページの中は本体のテキスト層の要素の順（`data-idx`。PDF の中の文字の順なので、段組みでも本文の流れに沿う）。画像の範囲は、その上端より下にある最初の文字の手前とみなす（テキスト層の要素の位置から求める）。ほかのページとはページで比べる。
- **設定の版 3**: `defaultHeading`（0〜3）を足し、`insertPosition` に `'order'` を足して既定にした。版 2 までの `'end'`（それまでの既定。既定値ごと保存されていた）は `'order'` に移す。

### 16.3 確認（隔離した Obsidian 1.14.4、dev-vault のコピー。本物のマウス操作）

- ペンのメニューは「色」「書き方」「塗り方」の 3 つの見出しつき。見出し 1 にするとペンのボタンに「H1」が出て、ペアの無い PDF の最初の 1 回は吹き出し、以後はドラッグするたびに `# …` が続けて入る
- 3 章分の見出しのあとにペンを本文に戻し、1 章の 2 行目 → 2 章 → 3 章 → 1 章の 1 行目の順に引くと、ノートは「1 章の見出し・1 行目・2 行目・2 章の見出し・…」と PDF の順に並ぶ
- 吹き出しの「見出し」から H2 を押すと、その 1 回だけ `## …` が PDF の順の位置に入る（ペンが本文のときは H1〜H3、見出しのときは「本文」も出る）
- ノートの文字をクリックするとその位置にカーソルが入り、PDF へは移らない。カーソルのある行でも ID は点のまま。行末をクリックすると点の前にカーソル。点の前に書けば ID は行末のまま、点の後ろに書いた文は手が止まると ID の前へ移る。点の前の Enter は ID の後ろで改行する。点のクリックで PDF の該当箇所が点滅する。閲覧モードも文字は押しても何もせず、点で移る
- いずれも `window.__errs` は空

## 17. 第 4 弾（2026-10-08、日本語の PDF で試した結果を受けて）

### 17.1 範囲の画像に文字が出ない

- 症状: 一部の PDF で、範囲を画像にすると枠や図形だけが描かれ、文字が描かれない（PDF の中に画像として入っている図は正しく出る）。
- 原因: 画像を作るために pdf.js で PDF を開き直すとき、本体の PDF ビューと違って cMap の場所（`cMapUrl`）を渡していなかった。定義済みの CMap（UniJIS-UCS2-H など）で文字を書いた PDF は、cMap が無いと文字を描けない。日本語の PDF に多い。ほかの設定（標準フォント・`isEvalSupported`）は関係しなかった（ユーザーの PDF を隔離した Obsidian で読み取りだけして確かめた）。
- 直し方: 本体と同じ設定で開く（`src/pdf/pdfjs.ts`）。本体は `cMapUrl: '/lib/pdfjs/cmaps/'`・`cMapPacked: true`・`standardFontDataUrl`・`wasmUrl`・`iccUrl`・`isEvalSupported: false` で開いている（1.14.4 の app.js）。場所は worker（`GlobalWorkerOptions.workerSrc`）と同じフォルダから求める。
- 確認用に、埋め込まないフォント + 定義済みの CMap の自作 PDF を足した（`dev-vault/PDF/sample-japanese.pdf`、`node scripts/make-sample-japanese-pdf.mjs` で作り直せる）。cMap なしで描くと文字が出ず、直したあとは図の中の日本語も画像に入る。

### 17.2 選んだ文字を段落の形でノートに入れる

- 要望: 複数行を選ぶと 1 行につながってしまい（箇条書きの「・」も 1 行に）、毎回ノートで段落を整えるのが大変。
- 直し方: PDF の行ごとの文字と位置から、段落の途中の折り返し（つなぐ）と、段落・箇条書きの切れ目（改行を残す）を見分ける（`src/lib/paragraphs.ts`。行の取り出しは `src/viewer/text-range.ts` の `selectionLines`）。
  - 次の行が箇条書きの記号（・ ● ① 1. （1） 第1章 など）で始まる → 切れ目
  - 行の間が、ふつうの行間より行の高さの半分以上広い → 切れ目
  - 前の行が段の右端まで届いていない（日本語は 1.2 文字分以上。英語は文の終わりで短いか、かなり短い行）→ 切れ目。段の右端は、ページの中で左端がそろう行の右端から求める（短い行ばかり選んだときも見分けられるように）
  - それ以外はつなぐ（日本語どうしは詰め、それ以外は空白 1 つ）
- ノートには、1 件を 1 段落として、切れ目を改行で残して書く（`・一つ目\n・二つ目\n・三つ目 ^hl-…`）。ID は最後の行の行末。見出しは 1 行にまとめる。箇条書きの設定では 2 行目から字下げする。
- 合わせて、複数行の段落のハイライトを扱えるようにした: 削除（文ごと消すときは段落ごと。PDF 側からは、下から数えて PDF の文字と同じ行だけを消し、上に自分で書いた行は残す）、見出しの大きさの変更（1 行にまとめる）、PDF の順に差し込むときの段落の先頭（箇条書きの続きの行は項目の行から）。

### 17.3 その他

- ユーザーが dev-vault に個人の PDF（とそのノート・画像）を入れて試したので、`.gitignore` で dev-vault の中は README・設定・自作のテスト用 PDF（`dev-vault/PDF/sample-*.pdf`）だけを入れるようにした。

### 17.4 確認（隔離した Obsidian 1.14.4。本物のマウス操作）

- 自作の日本語 PDF で、範囲を画像にすると図の中の日本語も入る（cMap なしでは文字が無い 13 KB、直したあとは 62 KB）
- 箇条書き 3 行をまとめて選ぶと、ノートでは `・…` の 3 行のまま 1 段落になる。折り返した段落は 1 行にまとまる。段落の最後の短い行と次の段落の行をまたいで選ぶと、そこで改行が残る
- `window.__errs` は空

## 18. 第 5 弾（2026-10-09、実際のノートで試した結果を受けて）

### 18.1 要望と決めたこと

- 要望: ユーザーの文献ノートのテンプレートは、`Source::` などの後に `## Next Action`（チェックリスト）・`## Summary` が続き、最後に Excalidraw のデータ（`# Excalidraw Data` から後ろ）がある。ハイライトが Excalidraw のデータの下に入ってしまうので、Summary と Excalidraw Data の間に入るようにしたい。指定したいときもあるが、複雑な機能にはしたくない（基本はどんどん溜まっていけばよい）。
- 決めたこと（3 段構え。どれも、入れる場所の中では PDF の順に並べる）:
  1. 何もしなければ、本文の最後に入れる。本文の最後は、末尾の特別な部分の手前: Excalidraw のデータの見出し（`%%` の中にあれば、その `%%`）と、末尾の `%%` コメント（後ろに空行しか無いもの。ほかのプラグインの設定など）。Excalidraw のデータより後ろに書くと、Excalidraw が保存し直すときに消えるおそれがあり、コメントの中に入ると見えなくなるので、既定で避ける。テンプレートのノートでは、何もしなくても Summary の下（Excalidraw Data の手前）に入る。
  2. いつも同じ見出しに入れたいときは、設定「ハイライトを入れる見出し」に名前を書く（例: `Summary`）。その見出しがあるノートでは、その節（次の同じか上の階層の見出しまで。本文の最後まで）に入れる。名前は大文字・小文字、前の `#`、末尾の `#` を区別しない（§19 で完全一致に変えた）。見出しのハイライトは、その見出しより深くする（節が途中で切れないように。`## Summary` の下なら見出し 1 は `###`）。ハイライトの見出しでは節を終えない。
  3. そのノートだけ変えたいときは、見出しを右クリックして「PDF のハイライトをこの見出しの下に入れる」（§5.6）。コマンドもある（スマホやキーボード用）。
- 第 3 弾までの「見出しの下」（見出しが無ければ末尾に作る）は、2 にまとめてやめた。見出しが無いノートでは作らずに本文の最後に入れる。設定の「ハイライトを足す位置」は「ハイライトの並べ方」（PDF の順 / 足した順）だけにした。

### 18.2 仕組み

- `src/lib/note-regions.ts`: 行ごとにコードブロックと `%%` コメントの状態を求め（コメントの中の ``` は数えない。コードの中の `%%` は数えない）、本文の最後（`contentEndLine`）と入れる範囲（`insertRegion`）を決める。右クリックとコマンドで使う見出しの判定（`targetHeadingAt`。ハイライトの見出し・本文の最後より後ろ・コードやコメントの中は除く）もここ。
- `src/lib/note-insert.ts` の `planInsertHighlight(content, line, { headings, order })`: 範囲の中だけで PDF の順の位置を探す（範囲の外のハイライトとは比べない。比べるものが無ければ範囲の最後）。frontmatter のすぐ下の段落の手前に入れるときも frontmatter の中には入れない。前に何も無いときは文書の先頭に入れて、後ろのデータとの間を空ける。
- すでに Excalidraw のデータの下に入ってしまったハイライトは動かさない（`^hl-…` ごと切り取って上に貼れば、PDF とのつながりは保たれる）。

### 18.3 確認（隔離した Obsidian 1.14.4。dev-vault から個人のファイルを除いたコピー。本物のマウス操作）

- テンプレートと同じ形のノート（`## Next Action` のチェックリスト・`## Summary`・`# Excalidraw Data` と `%%` の中のデータ）で、PDF の文字を選ぶと Summary と Excalidraw Data の間に入る。PDF で前にある文字を後から引くと、その前に入る
- 見出しの右クリックに「PDF のハイライトをこの見出しの下に入れる」が出て、押すとプロパティに書かれ、次のハイライトはその見出しの節の最後に入る。もう一度右クリックすると「…指定を外す」になり、外せる
- 設定画面で「ハイライトを入れる見出し」に書くと、その見出しの節に PDF の順で入る（間の文字は間に入る）。見出し 1 のペンで引くと `###` で入り、PDF には「H3」と出る
- コマンドは見出しの行でだけ出る（ハイライトの行・Excalidraw のデータの中では出ない）
- `window.__errs` は空

## 19. 第 6 弾（2026-10-09、第 5 弾の設定を見た結果を受けて）

### 19.1 要望と決めたこと

- 「ハイライトを入れる見出し」を 1 つしか書けない。2 つ（例: Summary と ハイライト）書けるようにしたとき、両方あるノートでは競合する。ユーザーの案: 競合したら、そのファイルではどちらに入れるかをモーダルで選ばせ、以後はそこに溜める。
  - 決めたこと: 入力欄を複数行にし、1 行に 1 つ書く。ノートにある設定の見出しが 1 つならそれ、2 つ以上ならモーダル（`ConfirmationModal`。見出しごとのボタンとキャンセル）で選ばせ、選んだ見出しをそのノートのプロパティ `pdf-highlights-heading` に記録する（以後は聞かない）。キャンセルしたらハイライトしない（通知）。1 つの指定が 2 つの見出しに合うとき（`Summary` が `## Summary` と `### Summary` に合うなど）も聞く。
- 見出しの指定で、大文字・小文字の違う見出しに反応してほしくない。Markdown の形（`## Summary`）で書けるようにしたい。
  - 決めたこと: 照合を完全一致にした（第 5 弾は大文字・小文字と `#` の数を区別しなかった）。`## Summary` と書けば `#` の数も、`Summary` と書けば名前だけを比べる。名前は大文字・小文字も同じものだけ（続く空白は 1 つとみなし、末尾の `#` の並びとブロック ID は除く）。`##Summary` のように `#` の後に空白が無い行・`#` が 7 つ以上の行・名前の無い行は、設定画面で誤りとして出し、保存しない（`validate`）。
- 説明を、Excalidraw を使っていない人にも分かるように書き直した。設定画面の説明は、要点 1 文と箇条書き 3 つ（書き方・2 つ以上あるとき・ノートの最後のほかのプラグインのデータ）。

### 19.2 仕組み

- `src/lib/heading-spec.ts`: 見出しの指定（`HeadingSpec { level, name }`）の読み取り（`parseHeadingSpec`・`headingSpecs`・`invalidHeadingLine`）と、見出しの行との照合（`matchesHeading`）、見出しの行の形（`headingForm`: `## Summary`）。
- `src/lib/note-regions.ts`: `findHeadings`（指定に合う、入れる先にできる見出しの形を上から順に）と `resolveInsertHeading(content, own, settings)`（`{ heading }` か `{ choices }`）。
- `src/actions.ts` の `insertTargetFor`: 書き込みの前に本文を読んで決める（ペアのノートが決まったあと、ID や画像を作る前）。選ばせたときは `remember` を付けて書き込みに渡し、`NoteWriter.insertHighlight` が本文とハイライトの記録を書いたあとでプロパティに記録する。
- 設定の値は入力欄の文字のまま保存し、使うときに 1 行ずつ読む（入力中に空行を消して保存すると、入力欄が書き換わって改行できなくなるため）。

### 19.3 確認（隔離した Obsidian 1.14.4。本物のマウス操作）

- 設定に `## Summary` と `## ハイライト`、両方の見出しがあるノートで PDF の文字を選ぶと、モーダルに「## Summary」「## ハイライト」「キャンセル」が出る。「## ハイライト」を押すとその下に入り、プロパティに `"## ハイライト"` が書かれる。次のハイライトはモーダル無しで同じ節に PDF の順で入る
- 見出しの右クリックで指定を外したあと、モーダルでキャンセルすると、ハイライトは作られず通知が出る
- 設定画面に複数行の入力欄と箇条書きの説明が出る。`##ハイライト` と書くと入力欄の下に誤りが出て、保存されない
- `window.__errs` は空
- 新しくコピーした Vault を初めて開くと、Obsidian が「コミュニティプラグイン」の設定画面を自動で開く（作者を信頼したあと）。開いたままだと PDF の操作やモーダルの確認が狂うので、E2E では先に閉じる

## 20. 第 7 弾（2026-10-09、PDF の置き場所）

### 20.1 要望と決めたこと

- 要望: PDF を vault に入れると、ルートなど入れた場所に置かれたままになる。Obsidian の「新しい添付ファイルの場所」はノートに貼った（添付した）ファイルの置き場所で、このプラグインのように PDF とノートを組にする使い方には効かない。PDF をわざわざ保存先のフォルダに移すのが面倒なので、PDF の保存場所を決められるようにしたい（移すボタンでもよい）。
- 決めたこと:
  - 設定「PDF の保存先」（フォルダ。宣言的な設定の `folder` で候補を出す）。空なら一切移さない（既定）。保存先の中（下のフォルダも含む）にある PDF は動かさない。
  - 「ハイライトしたら保存先へ移す」（既定はオン）: PDF にハイライトしたとき（画像の取り込みも）と、ノートに PDF を添付したとき（ノートを作ったときも）に、保存先へ移す。通知を出す。PDF を使い始めた時点で移すので、関係の無い PDF（請求書など）は動かさない。
  - 手動でも移せる: PDF の右クリックメニュー（ファイル一覧・PDF ビューの「…」）「PDF の保存先へ移す」、ノートのメニュー「添付した PDF を保存先へ移す」、コマンド「PDF を保存先へ移す」。どれも保存先の外にあるときだけ出す。
  - ツールバーのボタンは足さない（1 つの PDF に 1 回の操作で、自動でも移るため）。

### 20.2 仕組み

- `src/pdf-storage.ts`（`PdfStorage`）: `FileManager.renameFile` で移す。リンク（ノートのプロパティ `pdf`・`pdf-highlights`、埋め込み）はユーザーの設定に従って Obsidian が直す（「内部リンクを自動で更新」が未設定の vault では、初回に Obsidian が更新するかを聞く）。無いフォルダは上から順に作り、同じ名前があれば ` 1`, ` 2` … を付ける（`src/lib/file-paths.ts`。ノートの名前の付け方と同じ）。
- 移すのは書き込みの前: 添付では移してから新しい場所へのリンクを書き、ハイライトでは見出しを決めたあと（モーダルでキャンセルしたら移さない）、ID や記録を作る前に移す。書いた直後に移すと、メタデータの索引が追いつく前の新しいリンクを Obsidian が直せないことがあるため。
- 移した直後は、索引に移す前のパスが残っていることがあるので、PDF の順に並べるときは移す前と後の両方のパスのハイライトと比べる。開いている PDF ビューは Obsidian が新しいパスに付け替え、重ね描きもそのまま続く。

### 20.3 確認（隔離した Obsidian 1.14.4。本物のマウス操作）

- vault のルートに置いた PDF に初めてハイライトすると、ノートができ、PDF が `Library/PDF/` に移る（フォルダも作る）。通知「PDF を「Library/PDF」に移しました。」。PDF ビューは移った PDF を開いたまま（パンくずが `Library / PDF / …`）、ハイライトも描かれたまま。ノートのリンクは移った PDF を指す
- 続けてハイライトしても移さず、PDF の順に入る
- ファイル一覧で別の PDF を右クリックすると「PDF の保存先へ移す」が出て、押すと移る
- 設定画面に「PDF の置き場所」のグループ（保存先のフォルダ・自動で移すか）が出る
- `window.__errs` は空

## 21. 名前（2026-10-09）

- コミュニティプラグインに公開するため、仮の名前 `pdf-tools` / PDF Tools を **`pdf-simple` / PDF Simple** に改めた（ユーザーが決めた）。公開済みのプラグイン 8,603 件・テーマ 847 件（`obsidianmd/obsidian-releases` の一覧）に同じ名前・id は無く、名前に PDF と Simple の両方を含むものも無い。
- 決まり（`Reference/Manifest.md`・`Submit your plugin.md`）: id は英小文字とハイフンだけで、`plugin` で終わらず `obsidian` を含まない。名前は英語で短く、Obsidian・Plugin の語と、コアの機能名だけの名前は使えない。id は公開後に変えられない。
- 変えたもの: `manifest.json` の id と名前、CSS のクラスの接頭辞（`pdf-simple-`）、クラス名（`PdfSimplePlugin` など）、ページプレビューの登録名、E2E のプロファイル名（`pdf-simple-e2e-profile`）、ドキュメント。コマンドの id の前に付くプラグイン id も `pdf-simple:` になる。
- 変えないもの: ノートに書くプロパティ名（`pdf`・`pdf-highlights`・`pdf-highlights-heading`）とブロック ID の形（`^hl-…`）。データの形式なので、名前を変えてもノートやハイライトの移し替えは要らない。
- GitHub のリポジトリも `tk-pkm111/obsidian-pdf-tools` から `tk-pkm111/obsidian-pdf-simple` に改名した（旧 URL は GitHub が転送する）。
- BRAT で入れている環境では、新しい id のプラグインとして入り直す（設定の入れ直しが 1 回。古い PDF Tools は外し、BRAT の一覧からも外す）。

## 22. 使い方の動画と、はじめて読み込んだときの使い方の画面（2026-10-09）

### 22.1 動画

- `promo/` に、使い方の動画（2 分 4 秒・1080p・BGM と効果音つき）の元と書き出しの道具を置いた。`promo/index.html` は 1920×1080 の舞台を時刻 t から決まった形で描く HTML（ブラウザで開けば再生できる）、`promo/render.mjs` はヘッドレスの Chrome で 1 コマずつ撮って ffmpeg で MP4 にし、`promo/audio.mjs` で合成した音（外部の素材は使わない）を付ける（`node promo/render.mjs`、音だけなら `--audio`）。書き出したものは `promo/out/`（git 管理外）。
- GitHub に載せる版は、README に埋め込める大きさ（無料プランでは 10 MB まで）にするため、1080p のまま CRF 25 で 7.1 MB にした（`pdf-simple-guide.mp4`）。
- 置き場所は GitHub の添付（`https://github.com/user-attachments/assets/5667a2b6-…`）。README に URL だけの行を置くと、GitHub がその場で再生できる形で表示する。添付は、どこかに投稿するまで公開されない（ログインしていないと 404）。0.0.5 のリリースノートに載せたところで公開された（`video/mp4`、範囲を指定した読み込みにも対応）。

### 22.2 使い方の画面（`src/ui/welcome.ts`）

- はじめて読み込んだときに 1 回だけ、画面の中央に開く（設定 `welcomeShown` に記録）。コマンド「使い方を見る」（`show-welcome`）と、設定タブのいちばん上の「使い方を見る」から、いつでも開ける。
- 中身: 題名と一言、動画の枠、できることの一覧（なぞってハイライト／ペンで色と見出し／表と裏を行き来／入れる場所と保存先）、「GitHub で詳しく見る」と「はじめる」。広い画面では左に動画・右に一覧の 2 列、狭い画面とスマホでは 1 列（800 px の高さの画面でスクロールなしで収まる）。
- 動画の枠は、はじめは CSS で描いた表紙（ロゴと再生ボタン、「再生すると、GitHub から動画を読み込みます」）だけで、通信しない。押したときに `<video>` を作って GitHub の動画を読み込む。読み込めなければ（オフラインなど）その旨と「ブラウザで開く」を出す。閉じると再生を止める。
- Obsidian は開いたモーダルの最初のボタン（動画の表紙）に焦点を置くので、「はじめる」に移す（開いた直後に Enter を押しても動画が始まらないように。題名が隠れないよう、スクロールもしない）。
- ネット通信は README の「ネット通信について」に書いた（コミュニティの決まりでは、通信は README での明記が必要）。

### 22.3 確認（隔離した Obsidian 1.14.4）

- 新しい vault ではじめて読み込むと開き、`welcomeShown` が true になる。開き直し・プラグインの入れ直しでは開かない（コマンドでは開く）
- 本物のマウス操作で表紙を押すと、GitHub の動画が再生される（`readyState` 4、音あり）。「はじめる」で閉じると止まる
- 幅 460 px では 1 列に並ぶ。設定タブのいちばん上に「使い方 → 使い方を見る」が出る
- `window.__errs` は空
