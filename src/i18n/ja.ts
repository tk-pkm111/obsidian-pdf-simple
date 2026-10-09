/** 日本語の UI 文言。キーは「場所.意味」。英単語を混ぜるときは sentence case。 */
export const ja = {
	// コマンド（名前の前に Obsidian がプラグイン名を付ける）
	'command.flip': '表と裏を切り替える',
	'command.attachPdf': 'このノートに PDF を添付',
	'command.createNoteForPdf': 'この PDF のノートを開く（無ければ作る）',
	'command.highlightSelection': '選択範囲をハイライト',
	'command.highlightSelectionWithColor': '選択範囲をハイライト（{color}）',
	'command.openHighlightInPdf': 'カーソル行のハイライトを PDF で開く',
	'command.recolorHighlightAtCursor': 'カーソル行のハイライトの色を変える',
	'command.removeHighlightAtCursor': 'カーソル行のハイライトを削除',
	'command.cleanOrphanEntries': '本文に無いハイライト項目を整理',
	'command.movePdf': 'PDF を保存先へ移す',
	'command.insertUnderHeading':
		'カーソルのある見出しの下に PDF のハイライトを入れる',
	'command.toggleInstantHighlight': '選んだらすぐハイライトする（オン/オフ）',
	'command.penText': 'ペンを本文にする',
	'command.penHeading': 'ペンを見出し {level} にする',
	'command.captureRegion': '範囲を画像として取り込む',
	'command.undoLastHighlight': '直前のハイライトを取り消す',
	'command.showWelcome': '使い方を見る',

	// PDF の右上のボタン
	'toolbar.penHighlight': 'ペン: {color}（選んだらすぐ塗る）',
	'toolbar.penPopup': 'ペン: {color}（色を選んでから塗る）',
	'toolbar.penNone': 'ペン: 塗らない（選ぶだけ）',
	'toolbar.region': '範囲を画像として取り込む',
	'toolbar.regionArmed':
		'ページの上をドラッグして範囲を選ぶ（もう一度押すか Esc で解除）',

	// ビューのヘッダーのボタン
	'action.openPdf': 'PDF を開く（裏面）',
	'action.openNote': 'ノートに戻る（表面）',

	// メニュー
	'menu.openNote': 'ノートの該当行を開く',
	'menu.openNoteIn': 'ノートを開く: {name}',
	'menu.recolor': '色を変える…',
	'menu.copyText': 'テキストをコピー',
	'menu.delete': 'ハイライトを削除',
	'menu.deleteLine': 'ハイライトを削除（行ごと）',
	'menu.unlink': 'PDF とのつながりを外す（文は残す）',
	'menu.changeHeading': '見出しの大きさを変える…',
	'menu.headingLevel': '見出し {level}',
	'menu.kindText': '本文',
	'menu.sectionColor': '色',
	'menu.sectionKind': '書き方',
	'menu.sectionAction': '塗り方',
	'menu.selectHighlight': '選んだらすぐ塗る',
	'menu.selectPopup': '色を選んでから塗る',
	'menu.selectNone': '塗らない（選ぶだけ）',
	'menu.openInPdf': 'PDF で開く',
	'menu.movePdf': 'PDF の保存先へ移す',
	'menu.movePairedPdf': '添付した PDF を保存先へ移す',
	'menu.insertUnderHeading': 'PDF のハイライトをこの見出しの下に入れる',
	'menu.clearInsertHeading': 'PDF のハイライトを入れる見出しの指定を外す',
	'menu.attachPdf': 'PDF を添付…',
	'menu.changePdf': '添付する PDF を変える…',
	'menu.openPairedNote': 'ノートを開く（表面）',
	'menu.createNote': 'この PDF のノートを作る',

	// 通知
	'notice.noteCreated':
		'ノート「{name}」を作りました。ハイライトはここに溜まります。',
	'notice.attached': '「{pdf}」を添付しました。',
	'notice.duplicateHighlight': 'この範囲はもうハイライトしています。',
	'notice.emptySelection': '選択範囲に文字がありません。',
	'notice.noSelection': 'PDF の文字を 1 ページの中で選択してください。',
	'notice.unsafePdfName':
		'PDF のファイル名に # ^ [ ] | のどれかが含まれているため、ハイライトを記録できません。ファイル名を変えてください。',
	'notice.highlightFailed': 'ハイライトを保存できませんでした: {message}',
	'notice.highlightRemoved': 'ハイライトを削除しました。',
	'notice.highlightKept':
		'ノートの文は書き換えられていたので残しました（PDF のハイライトは外しました）。',
	'notice.unlinked': 'PDF とのつながりを外しました。',
	'notice.nothingToUndo': '取り消せるハイライトがありません。',
	'notice.pdfMoved': 'PDF を「{folder}」に移しました。',
	'notice.pdfMoveFailed': 'PDF を移せませんでした: {message}',
	'notice.insertHeadingSet':
		'このノートでは、PDF のハイライトを「{heading}」の下に入れます。',
	'notice.insertHeadingCleared':
		'ハイライトを入れる見出しの指定を外しました（設定どおりに入れます）。',
	'notice.insertHeadingSkipped':
		'見出しを選ばなかったので、ハイライトしませんでした。',
	'notice.penText': 'ペンを本文にしました。',
	'notice.penHeading':
		'ペンを見出し {level} にしました。選んだ文字は見出しとしてノートに入ります。',
	'notice.regionArmed':
		'ページの上をドラッグして、画像にする範囲を選んでください。',
	'notice.regionFailed': '画像にできませんでした: {message}',
	'notice.regionPassword': 'パスワード付きの PDF は画像にできません。',
	'notice.instantOn': '選んだらすぐハイライトします。',
	'notice.instantOff': '選んでもハイライトしません（選ぶだけ）。',
	'notice.pdfNotFound': 'PDF が見つかりません: {path}',
	'notice.noteNotFound': 'ノートが見つかりません: {path}',
	'notice.notHighlightLine': 'カーソル行にハイライトがありません。',
	'notice.overlayUnavailable':
		'この版の Obsidian の PDF ビューにはハイライトを描けませんでした。ノートの記録はそのまま残っています。',
	'notice.orphansNone': '整理するハイライト項目はありません。',
	'notice.orphansRemoved': '{count} 件のハイライト項目を整理しました。',
	'notice.rescued':
		'削除されたノートにあったハイライト {count} 件を、本文のあるノートへ移しました。',

	// モーダル
	'modal.choosePdf': '添付する PDF を選ぶ',
	'modal.chooseNote': 'ハイライトを書き込むノートを選ぶ',
	'modal.chooseColor': '色を選ぶ',
	'modal.chooseHeading': '見出しの大きさを選ぶ',
	'modal.headingNone': '本文（見出しにしない）',
	'modal.noPdfs': 'vault に PDF がありません。',
	'modal.insertHeadingTitle': 'ハイライトを入れる見出しを選ぶ',
	'modal.insertHeadingBody':
		'このノートには、設定の「ハイライトを入れる見出し」が 2 つ以上あります。どの見出しの下に入れますか？ 選んだ見出しはこのノートに記録され（プロパティ pdf-highlights-heading）、以後のハイライトはそこに入ります。見出しを右クリックすると変えられます。',
	'modal.orphansTitle': '本文に無いハイライト項目を整理',
	'modal.orphansBody':
		'どのノートの本文にも ^hl-… が無いハイライト {count} 件を、プロパティから削除します。',
	'modal.orphansMore': 'ほか {count} 件',
	'modal.delete': '削除',
	'modal.cancel': 'キャンセル',
	'modal.addColorTitle': '色を追加',
	'modal.colorName': '識別名',
	'modal.colorNameDesc':
		'リンクに書く名前。英小文字で始まり、英小文字・数字・ハイフンだけ（例: pink）。',
	'modal.colorLabel': '表示名',
	'modal.colorLabelDesc': '画面に出す名前（空なら識別名）。',
	'modal.colorValue': '色',
	'modal.add': '追加',
	'modal.invalidColorName':
		'英小文字で始まる、英小文字・数字・ハイフンの名前にしてください。',
	'modal.duplicateColorName': 'その識別名はもう使われています。',

	// 使い方の画面
	'welcome.title': 'PDF Simple へようこそ',
	'welcome.lead':
		'PDF の文字をなぞるだけで、ハイライトした文がノートにたまっていきます。まずは 2 分の動画で、使い方をひととおり見てみましょう。',
	'welcome.videoTitle': '2 分でわかる使い方',
	'welcome.play': '使い方の動画を再生する',
	'welcome.videoNote': '再生すると、GitHub から動画を読み込みます',
	'welcome.videoError':
		'動画を読み込めませんでした。インターネットに接続しているか確かめてください。',
	'welcome.openInBrowser': 'ブラウザで開く',
	'welcome.step1Title': 'なぞってハイライト',
	'welcome.step1Body':
		'PDF の文字をマウスで選ぶと、すぐに塗られて、その文がノートに入ります。',
	'welcome.step2Title': 'ペンで色と見出し',
	'welcome.step2Body':
		'PDF の右上のペンで、色や見出しの大きさを切り替えます。',
	'welcome.step3Title': '表と裏を行き来',
	'welcome.step3Body':
		'ノートの点を押すと PDF へ、PDF のハイライトを押すとノートへ移ります。',
	'welcome.step4Title': '入れる場所と保存先',
	'welcome.step4Body':
		'「設定 → PDF Simple」で、ハイライトを入れる見出しや PDF の保存先を決められます。',
	'welcome.hint': 'この画面は、コマンド「使い方を見る」でいつでも開けます。',
	'welcome.more': 'GitHub で詳しく見る',
	'welcome.start': 'はじめる',

	// 設定
	'settings.groupHelp': '使い方',
	'settings.showWelcome': '使い方を見る',
	'settings.showWelcomeDesc': '動画と、できることの一覧を開きます。',
	'settings.colors': '色',
	'settings.addColor': '色を追加',
	'settings.colorsEmpty': '色がありません。',
	'settings.colorDesc': '識別名: {name}',
	'settings.groupHighlight': 'ハイライト',
	'settings.defaultColor': '既定の色',
	'settings.defaultColorDesc':
		'すぐハイライトするときと、色を指定しないコマンドで使う色。PDF の右上のペンのボタンでも変えられます。',
	'settings.selectAction': '文字を選んだとき',
	'settings.selectActionDesc':
		'PDF でマウスで文字を選んだときの動き。Alt（Option）を押しながら選ぶと塗りません。キーボードやスマホでの選択では、色のボタンを出します。',
	'settings.defaultHeading': '既定の書き方',
	'settings.defaultHeadingDesc':
		'選んだ文字を本文として入れるか、見出しとして入れるか。見出しにすると、変えるまで続けて見出しを引けます。PDF の右上のペンのボタンでも変えられます。',
	'settings.selectHighlight': 'すぐハイライトする',
	'settings.selectPopup': '色を選んでからハイライトする',
	'settings.selectNone': '何もしない',
	'settings.groupNote': 'ノート',
	'settings.insertHeading': 'ハイライトを入れる見出し',
	'settings.insertHeadingDesc':
		'ノートにこの見出しがあれば、ハイライトはその見出しの下に入ります。無ければノートの最後に入ります。',
	'settings.insertHeadingDescFormat':
		'1 行に 1 つ、Markdown の見出しと同じ形で書きます（例: ## Summary）。# の数と大文字・小文字まで同じ見出しだけが対象です。# を付けずに書くと、見出しの大きさは問いません。',
	'settings.insertHeadingDescConflict':
		'書いた見出しが 1 つのノートに 2 つ以上あるときは、最初にハイライトするときに、どれに入れるかを聞きます。選んだ見出しはそのノートに記録され、以後はそこに入ります。ノートの見出しを右クリックして選ぶこともできます。',
	'settings.insertHeadingDescEnd':
		'ノートの最後に、ほかのプラグインが使うデータ（Excalidraw の図のデータや、%% で囲んだ隠しコメントなど）があるときは、その手前に入れます。',
	'settings.insertHeadingPlaceholder': '## Summary\n## ハイライト',
	'settings.invalidHeading':
		'「{line}」は見出しとして読めません。# の後に空白を入れて「## Summary」のように書いてください。',
	'settings.insertPosition': 'ハイライトの並べ方',
	'settings.insertPositionDesc':
		'入れる場所の中での並べ方。PDF の順にすると、章の見出しを先に引いておけば、本文はその章の下に入ります。',
	'settings.insertOrder': 'PDF の順',
	'settings.insertEnd': '足した順（最後に足す）',
	'settings.bulletList': '箇条書きにする',
	'settings.bulletListDesc':
		'行頭に「- 」を付けます。オフなら 1 件ずつ段落にします（前後に空行）。',
	'settings.hideEntriesProperty': 'プロパティ欄に記録を出さない',
	'settings.hideEntriesPropertyDesc':
		'ノートのプロパティ欄で、PDF 上の位置と色の記録（pdf-highlights）の行を隠します。記録はノートに残ります（ソースモードでは見えます）。',
	'settings.groupPdf': 'PDF の置き場所',
	'settings.pdfFolder': 'PDF の保存先',
	'settings.pdfFolderDesc':
		'ノートと組にした PDF を置くフォルダ。無ければ作ります。空なら PDF を移しません（このフォルダの中のフォルダに入っている PDF も、そのままにします）。',
	'settings.pdfFolderPlaceholder': '例: Library/PDF',
	'settings.autoMovePdf': 'ハイライトしたら保存先へ移す',
	'settings.autoMovePdfDesc':
		'PDF にハイライトしたときや、ノートに PDF を添付したときに、保存先へ自動で移します。PDF へのリンク（ノートのプロパティや埋め込み）は Obsidian が新しい場所に直します。オフにしても、PDF の右クリックメニューか、コマンド「PDF を保存先へ移す」で移せます。',
	'settings.groupFlip': '表と裏',
	'settings.flipMode': '切り替え方',
	'settings.flipSameLeaf': '同じタブで入れ替える',
	'settings.flipSplit': '分割して並べる',
	'settings.flipModeDesc':
		'Cmd / Ctrl を押しながら押すと、設定によらず新しいタブで開きます。',
	'settings.groupAdvanced': '詳細',
	'settings.pairingProperty': 'PDF を添付するプロパティ',
	'settings.pairingPropertyDesc': 'ノートと PDF の対応を書くプロパティ名。',
	'settings.invalidProperty':
		'プロパティ名に使えない文字があります（. : # [ ] など）。',
	'settings.reservedProperty':
		'pdf-highlights と pdf-highlights-heading はこのプラグインが使っているので使えません。',

	// 色の既定の表示名
	'color.yellow': '黄',
	'color.red': '赤',
	'color.green': '緑',
	'color.blue': '青',
	'color.purple': '紫',
	'color.orange': 'オレンジ',

	// 文字を選んだときの吹き出し
	'popup.heading': '見出しにする',
	'popup.asHeading': '見出し {level} として入れる',
	'popup.asText': '本文として入れる',

	// ノートに書く表示名
	'label.image': '画像',

	// ツールチップ
	'tooltip.openInPdf': 'PDF の {page} ページ目を開く',
	'tooltip.highlightWith': '{color}でハイライト',
};
