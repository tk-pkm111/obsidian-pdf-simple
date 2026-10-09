/**
 * vault の中のパス（純粋な文字列操作）: 設定のフォルダの正規化・フォルダの中か・作るフォルダ・重ならない名前。
 */

/** 設定のフォルダを vault の中のパスに（\ は /、続く / は 1 つ、前後の / と空白を除く。空や `/` は ''＝未設定） */
export function normalizeFolder(value: string): string {
	return value
		.trim()
		.replace(/\\/g, '/')
		.replace(/\/{2,}/g, '/')
		.replace(/^\/+|\/+$/g, '')
		.trim();
}

/** path が folder の中（下のフォルダも含む）にあるか */
export function isInFolder(path: string, folder: string): boolean {
	return folder !== '' && path.startsWith(`${folder}/`);
}

/** folder を作るのに要るフォルダ（上から順に。`a/b` → `a`, `a/b`） */
export function folderChain(folder: string): string[] {
	const parts = folder.split('/').filter((part) => part !== '');
	return parts.map((_, i) => parts.slice(0, i + 1).join('/'));
}

/** 新しいファイルのパス（`<folder>/<basename>.<extension>`。あれば ` 1`, ` 2` … を付ける） */
export function uniqueFilePath(
	folder: string,
	basename: string,
	extension: string,
	exists: (path: string) => boolean,
): string {
	const dir =
		folder === '' || folder === '/' ? '' : `${folder.replace(/\/+$/, '')}/`;
	for (let n = 0; n < 1000; n++) {
		const candidate = `${dir}${basename}${n === 0 ? '' : ` ${n}`}.${extension}`;
		if (!exists(candidate)) return candidate;
	}
	throw new Error(`No free file name for ${basename}.${extension}`);
}
