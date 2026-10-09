import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'main.js',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
		// プロジェクト固有: コードではないもの
		'dev-vault',
		'references',
		'docs',
		'scripts',
		'.claude',
		// プロモーション動画の元（ブラウザで動く HTML と書き出しスクリプト）
		'promo',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	// Obsidian 公式のプラグイン向けルール（レビューで指摘される項目を機械的に検出する）
	...obsidianmd.configs.recommended,
	{
		// テストとその設定は Node.js 上で動く。プラグイン本体向けのモバイル制約は適用しない。
		files: ['tests/**/*.ts', 'vitest.config.ts'],
		rules: {
			'obsidianmd/no-nodejs-modules': 'off',
			// Node 上で動くので window は無い
			'obsidianmd/prefer-window-timers': 'off',
			'obsidianmd/no-global-this': 'off',
		},
	},
	{
		// obsidian モジュールの代役。本物の Obsidian と同じく npm の moment を再輸出する。
		files: ['tests/__mocks__/obsidian.ts'],
		rules: {
			'@typescript-eslint/no-restricted-imports': 'off',
		},
	},
	{
		// src/lib は Obsidian に依存しない純粋なロジック置き場。
		// 'obsidian' を import しないことで vitest でそのままテストできる。
		files: ['src/lib/**/*.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'obsidian',
							message:
								'src/lib は Obsidian API に依存させない（テスト可能な純粋ロジックだけを置く）。',
						},
					],
				},
			],
		},
	},
);
