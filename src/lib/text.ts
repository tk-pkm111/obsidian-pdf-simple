/**
 * PDF から選んだ文字列を、ノートの 1 行に入れられる形にする。
 */

const CJK =
	/[\u2e80-\u2fdf\u3000-\u303f\u3040-\u30ff\u3100-\u312f\u3190-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]/;

/** 日本語・中国語の文字（改行をまたいでも空白を入れずにつなぐ文字）か */
export function isCjk(char: string): boolean {
	return CJK.test(char);
}

/**
 * 改行・連続する空白を 1 つの空白にまとめ、前後を削る。
 * 改行の両側が日本語などの文字なら空白を入れずにつなぐ（PDF の行末で文が折り返されているだけなので）。
 */
export function normalizeSelectedText(raw: string): string {
	const lines = raw
		.split('\u0000')
		.join('')
		.split(/\r\n|\r|\n/);
	let out = '';
	for (const rawLine of lines) {
		const line = rawLine.replace(/\s+/g, ' ').trim();
		if (line === '') continue;
		if (out === '') {
			out = line;
			continue;
		}
		const tight =
			isCjk(out.charAt(out.length - 1)) && isCjk(line.charAt(0));
		out += tight ? line : ` ${line}`;
	}
	return out;
}

/** Markdown で \ を付けると記号そのものになる ASCII の記号 */
const ESCAPABLE = /\\(?=[!-/:-@[-`{-~])/g;

/**
 * ノートに 1 行の文として入れても、見出し・箇条書き・引用・表・コードなどにならず、
 * タグ・リンク・HTML・数式・コメント・ハイライトにもならないようにする（text は正規化済みの 1 行）。
 * Markdown のエスケープ（\）は表示されない。
 */
export function escapeNoteText(text: string): string {
	// 元の \ が後ろの記号を打ち消さないように、先に \ 自体をエスケープする
	let escaped = text.replace(ESCAPABLE, '\\\\');
	escaped = escaped.replace(/\[\[/g, '[\\[');
	escaped = escaped.replace(/\[\^/g, '[\\^');
	escaped = escaped.replace(/(^|\s)#(?=[^\s#])/g, '$1\\#');
	escaped = escaped.replace(/<(?=[A-Za-z/!?])/g, '\\<');
	escaped = escaped.replace(/\$/g, '\\$');
	escaped = escaped.replace(/%%/g, '%\\%');
	escaped = escaped.replace(/=(?==)/g, '\\=');
	// 行頭: 見出し・引用・箇条書き・番号付きリスト・表・コードの囲み・区切り線
	if (/^#{1,6}(?:\s|$)/.test(escaped)) escaped = `\\${escaped}`;
	else if (/^([-*_])(?:\s*\1){2,}\s*$/.test(escaped))
		escaped = `\\${escaped}`;
	else if (/^[-+*](?:\s|$)/.test(escaped)) escaped = `\\${escaped}`;
	else if (/^[>|]/.test(escaped)) escaped = `\\${escaped}`;
	else if (/^(?:`{3,}|~{3,})/.test(escaped)) escaped = `\\${escaped}`;
	else escaped = escaped.replace(/^(\d{1,9})([.)])(?=\s|$)/, '$1\\$2');
	return escaped;
}

/**
 * 文の照合用のキー: エスケープの \ と空白を除く。
 * ノートの行（行頭の記号と ID を外したもの）と、PDF から取り出した文字列を比べるのに使う。
 */
export function textKey(text: string): string {
	return text.replace(/\\([!-/:-@[-`{-~])/g, '$1').replace(/\s+/g, '');
}

/** 先頭から max 文字（サロゲートペアを分けない）。切ったら … を付ける */
export function truncateText(text: string, max: number): string {
	const chars = Array.from(text);
	return chars.length <= max ? text : `${chars.slice(0, max).join('')}…`;
}
