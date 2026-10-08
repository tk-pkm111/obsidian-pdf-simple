/**
 * ハイライトのデータ型（Obsidian に依存しない）。
 * 保存形式の正は docs/implementation-plan.md の「データ設計」。
 */

/**
 * PDF のテキスト層の位置。
 * idx は本体改変版 pdf.js が span.textLayerNode に付ける data-idx（空文字の要素も番号を消費するので欠番がある）、
 * offset はその要素の文字列内の位置（UTF-16）。
 */
export interface TextPoint {
	idx: number;
	offset: number;
}

/** 1 ページ内のテキスト範囲。end の位置の文字は含まない */
export interface PdfSelection {
	begin: TextPoint;
	end: TextPoint;
}

/** ページ上の矩形（回転前のページに対する 0〜1 の割合）。範囲を画像として取り込んだハイライトの位置 */
export interface PdfRegion {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** ハイライトの位置: 文字の範囲か、ページ上の矩形 */
export type PdfAnchor =
	| { type: 'text'; selection: PdfSelection }
	| { type: 'region'; region: PdfRegion };

/** `#page=…&selection=…（または region=…）&color=…&id=…` を読んだ結果 */
export interface PdfSubpath {
	page: number | null;
	selection: PdfSelection | null;
	region: PdfRegion | null;
	color: string | null;
	id: string | null;
	/** すべてのパラメータ（並びも値も書かれたまま。未知のものを書き戻すときに保つため） */
	params: Array<[string, string]>;
}

/** 色。name はリンクに書く識別子（英小文字）、label は画面に出す名前（空なら既定の訳語） */
export interface PaletteEntry {
	name: string;
	color: string;
	label: string;
}

/** プロパティ pdf-highlights の 1 要素（PDF 上の位置と色） */
export interface HighlightEntry {
	id: string;
	/** この要素が書かれているノート */
	notePath: string;
	pdfPath: string;
	page: number;
	anchor: PdfAnchor;
	color: string | null;
	/** リンクの表示名（p.3 …） */
	label: string;
}

/** 本文の `^hl-…` の所在 */
export interface BlockRef {
	id: string;
	notePath: string;
	/** 0 始まりの行（段落なら先頭の行） */
	line: number;
	/** 見出しの行なら 1〜6（見出しでなければ 0 か無し） */
	level?: number;
}

/** 1 つのノートから読み取ったもの */
export interface NoteHighlights {
	entries: HighlightEntry[];
	blocks: BlockRef[];
}

/** PDF に描く単位。同じ位置のエントリはまとめる */
export interface Highlight {
	/** 位置の識別子（anchorKey） */
	key: string;
	pdfPath: string;
	page: number;
	anchor: PdfAnchor;
	/** 本文の行が見出しなら 1〜6（先頭の所在のもの）。見出しでなければ 0 */
	level: number;
	color: string | null;
	ids: string[];
	entries: HighlightEntry[];
	/** 本文の所在（1 件以上） */
	blocks: BlockRef[];
	label: string;
}
