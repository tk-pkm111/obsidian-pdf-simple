import { Component, type App, type TFile } from 'obsidian';
import type { PdfRegion } from '../lib/types';
import { openPdfDocument, type PdfDocument } from './pdfjs';

/** 描く倍率（1 = PDF の 1 pt を 1 px）。3 倍で網点や細い線もくっきり見える */
const SCALE = 3;
/** 画像の長い辺の上限（スマホのメモリを考えて） */
const MAX_SIDE = 4096;
/** 読み込んだ文書を使い回す時間（続けて取り込むときに読み直さない） */
const KEEP_MS = 60_000;
/** PDF の 1 pt → 100% 表示の CSS px */
const PT_TO_CSS = 96 / 72;

export interface RenderedRegion {
	/** PNG の中身 */
	data: ArrayBuffer;
	/** PDF を 100% で見たときの幅（CSS px。ノートに埋め込むときの幅） */
	cssWidth: number;
}

/**
 * PDF のページの一部を PNG にする。
 * 画面の拡大率に左右されないよう、同梱の pdf.js でそのページを描き直して切り抜く（範囲だけを描く）。
 */
export class RegionRenderer extends Component {
	private cached: {
		path: string;
		mtime: number;
		doc: Promise<PdfDocument>;
		timer: number;
	} | null = null;

	constructor(private readonly app: App) {
		super();
	}

	onunload(): void {
		this.drop();
	}

	/**
	 * region は見えている向きのページに対する割合、rotation はその向き（PDF 自体の回転を含む表示の回転）。
	 */
	async render(
		file: TFile,
		pageNumber: number,
		region: PdfRegion,
		rotation: number,
	): Promise<RenderedRegion> {
		const doc = await this.documentFor(file);
		const page = await doc.getPage(pageNumber);
		try {
			const base = page.getViewport({ scale: 1, rotation });
			const width = (region.right - region.left) * base.width;
			const height = (region.bottom - region.top) * base.height;
			const scale = Math.min(
				SCALE,
				MAX_SIDE / Math.max(width, height, 1),
			);
			const viewport = page.getViewport({ scale, rotation });
			const canvas = createEl('canvas');
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			const context = canvas.getContext('2d');
			if (!context) throw new Error('Canvas is not available');
			await page.render({
				canvasContext: context,
				viewport,
				transform: [
					1,
					0,
					0,
					1,
					-region.left * viewport.width,
					-region.top * viewport.height,
				],
			}).promise;
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob(resolve, 'image/png'),
			);
			if (!blob) throw new Error('Could not encode the image');
			return {
				data: await blob.arrayBuffer(),
				cssWidth: Math.max(1, Math.round(width * PT_TO_CSS)),
			};
		} finally {
			page.cleanup();
		}
	}

	private async documentFor(file: TFile): Promise<PdfDocument> {
		const cached = this.cached;
		if (
			cached &&
			cached.path === file.path &&
			cached.mtime === file.stat.mtime
		) {
			window.clearTimeout(cached.timer);
			cached.timer = window.setTimeout(() => this.drop(), KEEP_MS);
			return cached.doc;
		}
		this.drop();
		const doc = this.app.vault
			.readBinary(file)
			.then((data) => openPdfDocument(data));
		this.cached = {
			path: file.path,
			mtime: file.stat.mtime,
			doc,
			timer: window.setTimeout(() => this.drop(), KEEP_MS),
		};
		try {
			return await doc;
		} catch (error) {
			this.drop();
			throw error;
		}
	}

	private drop(): void {
		const cached = this.cached;
		if (!cached) return;
		this.cached = null;
		window.clearTimeout(cached.timer);
		void cached.doc.then(
			(doc) => doc.destroy(),
			() => undefined,
		);
	}
}
