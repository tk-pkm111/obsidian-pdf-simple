import { loadPdfJs } from 'obsidian';

/**
 * Obsidian に同梱の pdf.js（`loadPdfJs()`）のうち、このプラグインが使う部分だけの型。
 * loadPdfJs() の戻り値は any なので、ここで型を付けて外には any を出さない。
 * API: https://mozilla.github.io/pdf.js/api/
 */

export interface PdfViewport {
	width: number;
	height: number;
}

export interface PdfPage {
	/** rotation は PDF 自体の回転を置き換える値（足すのではない） */
	getViewport(params: { scale: number; rotation?: number }): PdfViewport;
	render(params: {
		canvasContext: CanvasRenderingContext2D;
		viewport: PdfViewport;
		transform?: number[];
	}): { promise: Promise<void> };
	cleanup(): boolean;
}

export interface PdfDocument {
	numPages: number;
	getPage(pageNumber: number): Promise<PdfPage>;
	destroy(): Promise<void>;
}

interface DocumentParams {
	data: Uint8Array;
	cMapUrl: string;
	cMapPacked: boolean;
	standardFontDataUrl: string;
	wasmUrl: string;
	iccUrl: string;
	isEvalSupported: boolean;
}

interface PdfJsLib {
	getDocument(params: DocumentParams): {
		promise: Promise<PdfDocument>;
	};
	GlobalWorkerOptions?: { workerSrc?: unknown };
}

/** 本体の pdf.js の資源（cMap・標準フォントなど）の場所。worker と同じフォルダ（1.14.4 では /lib/pdfjs/） */
function resourceBase(pdfjs: PdfJsLib): string {
	const worker = pdfjs.GlobalWorkerOptions?.workerSrc;
	if (typeof worker === 'string' && worker.includes('/'))
		return worker.slice(0, worker.lastIndexOf('/') + 1);
	return '/lib/pdfjs/';
}

/**
 * PDF の中身から文書を開く（渡したバッファは worker に移されて空になることがある）。
 * 本体の PDF ビューと同じ設定で開く。特に cMap の場所が無いと、日本語などの PDF で文字が描かれない
 * （図形だけの画像になる）。
 */
export async function openPdfDocument(data: ArrayBuffer): Promise<PdfDocument> {
	const pdfjs = (await loadPdfJs()) as PdfJsLib;
	const base = resourceBase(pdfjs);
	return await pdfjs.getDocument({
		data: new Uint8Array(data),
		cMapUrl: `${base}cmaps/`,
		cMapPacked: true,
		standardFontDataUrl: `${base}standard_fonts/`,
		wasmUrl: `${base}wasm/`,
		iccUrl: `${base}iccs/`,
		isEvalSupported: false,
	}).promise;
}

/** パスワード付きで開けなかったときの例外か */
export function isPasswordError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		(error as { name?: unknown }).name === 'PasswordException'
	);
}
