/**
 * プラグインの版（`x.y.z`）の比べ方と、「新しくなったこと」に出す版の選び方（純粋な関数）。
 */

/** 版の数字（足りない所は 0。数でない所も 0） */
function parts(version: string): number[] {
	return version
		.trim()
		.split('.')
		.slice(0, 3)
		.map((part) => {
			const value = Number.parseInt(part, 10);
			return Number.isFinite(value) ? value : 0;
		});
}

/** a が b より新しければ正、古ければ負、同じなら 0 */
export function compareVersions(a: string, b: string): number {
	const x = parts(a);
	const y = parts(b);
	for (let i = 0; i < 3; i++) {
		const diff = (x[i] ?? 0) - (y[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/**
 * 前に使っていた版（last。空なら、版を覚える前＝0.1.x 以前）から今の版（current）に上げたときに見せる版。
 * last より新しく、current 以下のもの（新しい順）。
 */
export function versionsToAnnounce(
	available: readonly string[],
	last: string,
	current: string,
): string[] {
	return available
		.filter(
			(version) =>
				(last === '' || compareVersions(version, last) > 0) &&
				compareVersions(version, current) <= 0,
		)
		.sort((a, b) => compareVersions(b, a));
}
