/** 動画の章（始まりの秒）。使い方の画面の目盛りに使う */
export interface Chapter<K extends string = string> {
	at: number;
	label: K;
}

/** 秒 time を含む章の番号（最初の章より前なら 0） */
export function chapterAt(chapters: readonly Chapter[], time: number): number {
	let index = 0;
	chapters.forEach((chapter, i) => {
		if (time >= chapter.at) index = i;
	});
	return index;
}

/**
 * 章ごとの長さ（秒）と、どこまで見たか（0〜1）。
 * duration が分からない（読み込み前・NaN）ときは、最後の章を前の章と同じ長さとみなす。
 */
export function chapterSpans(
	chapters: readonly Chapter[],
	time: number,
	duration: number,
): { length: number; done: number }[] {
	return chapters.map((chapter, i) => {
		const next = chapters[i + 1];
		const end =
			next?.at ??
			(Number.isFinite(duration) && duration > chapter.at
				? duration
				: chapter.at +
					(i > 0 ? chapter.at - (chapters[i - 1]?.at ?? 0) : 1));
		const length = Math.max(0, end - chapter.at);
		const done =
			length === 0
				? 0
				: Math.min(1, Math.max(0, (time - chapter.at) / length));
		return { length, done };
	});
}
