import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			// npm の `obsidian` パッケージは型定義だけで実行時のコードが無い。
			// テストでは tests/__mocks__/obsidian.ts に差し替える。
			obsidian: fileURLToPath(
				new URL('./tests/__mocks__/obsidian.ts', import.meta.url),
			),
		},
	},
	test: {
		include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
		environment: 'node',
		// window.setTimeout などを使えるようにする
		setupFiles: ['tests/setup.ts'],
	},
});
