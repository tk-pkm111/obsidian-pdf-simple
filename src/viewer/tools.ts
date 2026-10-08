/**
 * PDF ビューごとの道具の状態: 範囲の取り込み（ページの上をドラッグして四角を描き、画像として取り込む。1 回で解除）。
 * 見出しはペンの設定（書き方）で選ぶので、ここでは持たない。
 */
export type ToolMode = { kind: 'idle' } | { kind: 'region' };

export class ViewTools {
	private current: ToolMode = { kind: 'idle' };
	private readonly listeners = new Set<() => void>();

	get mode(): ToolMode {
		return this.current;
	}

	get capturing(): boolean {
		return this.current.kind === 'region';
	}

	toggleRegion(): void {
		this.set(this.capturing ? { kind: 'idle' } : { kind: 'region' });
	}

	disarm(): void {
		if (this.current.kind !== 'idle') this.set({ kind: 'idle' });
	}

	/** 変わったら呼ぶ。戻り値で解除 */
	onChange(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private set(mode: ToolMode): void {
		this.current = mode;
		for (const listener of [...this.listeners]) {
			try {
				listener();
			} catch (error) {
				console.error(error);
			}
		}
	}
}
