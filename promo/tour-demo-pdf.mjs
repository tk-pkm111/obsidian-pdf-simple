// 使い方の動画（3 分）で使う題材の PDF を作る。文章は架空の書き下ろし（個人のデータ・他人の著作物は使わない）。
// 練習用の PDF と同じ作り方（src/lib/practice-pdf.ts。フォントを埋め込まない数 KB の PDF）。
//
//   node promo/tour-demo-pdf.mjs <出力フォルダ> [ja|en]
//   → 本編の資料（2 ページ。章 3 つ・図 1 つ）と、取り込みの場面で使う短い資料（1 ページ）
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
	buildPdf,
	latinWidth,
	textWidth,
} from '../src/lib/practice-pdf.ts';

const [outDir = 'promo/out/tour-pdf', lang = 'ja'] = process.argv.slice(2);
const JA = lang === 'ja';
const script = JA ? 'ja' : 'latin';
const W = 595;
const H = 842;
const MARGIN = 64;
const INK = [0.12, 0.13, 0.17];
const MUTED = [0.42, 0.44, 0.5];
const ACCENT = [0.38, 0.29, 0.86];
const width = (text, size, bold = false) =>
	JA ? textWidth(text, size, bold) : latinWidth(text, size, bold);

const TEXT = JA
	? {
			file: '読んだことを、使える知識にする',
			title: '読んだことを、使える知識にする',
			subtitle: '読書メモの取り方　（架空の資料です）',
			chapters: [
				{
					head: '第 1 章　なぜ読んだことを忘れるのか',
					lines: [
						'本を読み終えた直後は、内容をよく覚えていると感じます。',
						'しかし数日たつと、多くのことは思い出せなくなります。',
						'読むだけで終わらせず、手を動かすことが大切です。',
					],
				},
				{
					head: '第 2 章　線を引いて、書き出す',
					lines: [
						'大事だと思った文には、迷わず線を引きます。',
						'線を引いた文をノートに集めると、あとで見返せます。',
						'自分の言葉で一言を書き足すと、さらに記憶に残ります。',
					],
				},
			],
			figure: {
				caption: '図 1　読み方と、1 週間後に覚えていた割合（架空の数値）',
				bars: [
					['読むだけ', 20],
					['線を引く', 35],
					['ノートにまとめる', 60],
				],
			},
			last: {
				head: '第 3 章　見返す仕組みを作る',
				lines: [
					'ノートは章ごとに見出しを付けて、整理しておきます。',
					'週に一度見返すだけで、知識は使えるものになります。',
				],
			},
			footer: (n) => `${n} / 2`,
			extra: {
				file: '会議の資料',
				title: '会議の資料',
				lines: [
					'今月の目標と、来月に向けた課題をまとめます。',
					'次回までに、それぞれの担当を決めておきます。',
				],
			},
		}
	: {
			file: 'Turning reading into knowledge',
			title: 'Turning reading into knowledge',
			subtitle: 'How to take reading notes (a sample document)',
			chapters: [
				{
					head: 'Chapter 1  Why we forget what we read',
					lines: [
						'Right after a book, we feel we remember it well.',
						'A few days later, most of it is hard to recall.',
						"Don't just read. Do something with your hands.",
					],
				},
				{
					head: 'Chapter 2  Mark it, then write it down',
					lines: [
						'Mark the sentences that feel important.',
						'Collect them in a note to look back on later.',
						'Add a line in your own words to remember more.',
					],
				},
			],
			figure: {
				caption: 'Figure 1  How much people remembered a week later (sample data)',
				bars: [
					['Read only', 20],
					['Mark it', 35],
					['Write notes', 60],
				],
			},
			last: {
				head: 'Chapter 3  Build a habit of review',
				lines: [
					'Organize your notes with a heading per chapter.',
					'Review them once a week to make them useful.',
				],
			},
			footer: (n) => `${n} / 2`,
			extra: {
				file: 'Meeting notes',
				title: 'Meeting notes',
				lines: [
					"This month's goals and next month's issues.",
					'Decide who owns each item before the next meeting.',
				],
			},
		};

function check(text, size, bold, max = W - MARGIN * 2) {
	const w = width(text, size, bold);
	if (w > max) throw new Error(`はみ出します (${Math.round(w)} > ${max}): ${text}`);
}

/** 章（見出し＋本文の行）。y は見出しの基準線。戻り値は次の要素の上端 */
function chapter(ops, y, { head, lines }) {
	check(head, 16, true);
	ops.push({ type: 'rect', x: MARGIN, y: y - 4, width: 4, height: 20, fill: ACCENT });
	ops.push({ type: 'text', x: MARGIN + 14, y, size: 16, text: head, bold: true, color: INK });
	let line = y - 34;
	for (const text of lines) {
		check(text, 12.5, false);
		ops.push({ type: 'text', x: MARGIN, y: line, size: 12.5, text, color: INK });
		line -= 24;
	}
	return line - 18;
}

/** 図（棒グラフ）。top は図の上端。戻り値は次の要素の上端 */
function figure(ops, top) {
	const { caption, bars } = TEXT.figure;
	const left = MARGIN + 40;
	const chartH = 120;
	const base = top - chartH - 24;
	const max = 70;
	ops.push({ type: 'rect', x: left, y: base, width: W - MARGIN * 2 - 60, height: 1, fill: [0.6, 0.62, 0.68] });
	for (const pct of [25, 50]) {
		const gy = base + (chartH * pct) / max;
		ops.push({ type: 'rect', x: left, y: gy, width: W - MARGIN * 2 - 60, height: 0.5, fill: [0.88, 0.89, 0.92] });
		ops.push({ type: 'text', x: MARGIN, y: gy - 3, size: 9, text: `${pct}%`, color: MUTED });
	}
	const colors = [[0.8, 0.81, 0.85], [0.64, 0.7, 0.9], [0.36, 0.45, 0.8]];
	bars.forEach(([label, pct], i) => {
		const x = left + 40 + i * 130;
		const h = (chartH * pct) / max;
		ops.push({ type: 'rect', x, y: base, width: 70, height: h, fill: colors[i] });
		ops.push({ type: 'text', x: x + 35 - width(`${pct}%`, 11, true) / 2, y: base + h + 8, size: 11, text: `${pct}%`, bold: true, color: INK });
		ops.push({ type: 'text', x: x + 35 - width(label, 10.5) / 2, y: base - 18, size: 10.5, text: label, color: INK });
	});
	check(caption, 10.5, false);
	ops.push({ type: 'text', x: MARGIN, y: base - 46, size: 10.5, text: caption, color: MUTED });
	return base - 80;
}

function page1() {
	const ops = [];
	check(TEXT.title, 24, true);
	ops.push({ type: 'text', x: MARGIN, y: H - 96, size: 24, text: TEXT.title, bold: true, color: INK });
	ops.push({ type: 'text', x: MARGIN, y: H - 124, size: 11.5, text: TEXT.subtitle, color: MUTED });
	ops.push({ type: 'rect', x: MARGIN, y: H - 146, width: W - MARGIN * 2, height: 1, fill: [0.85, 0.86, 0.9] });
	let y = H - 196;
	for (const c of TEXT.chapters) y = chapter(ops, y, c);
	figure(ops, y);
	ops.push({ type: 'text', x: W / 2 - 10, y: 40, size: 9, text: TEXT.footer(1), color: MUTED });
	return ops;
}

function page2() {
	const ops = [];
	chapter(ops, H - 110, TEXT.last);
	ops.push({ type: 'text', x: W / 2 - 10, y: 40, size: 9, text: TEXT.footer(2), color: MUTED });
	return ops;
}

function extra() {
	const ops = [];
	ops.push({ type: 'text', x: MARGIN, y: H - 96, size: 22, text: TEXT.extra.title, bold: true, color: INK });
	let y = H - 150;
	for (const text of TEXT.extra.lines) {
		check(text, 12.5, false);
		ops.push({ type: 'text', x: MARGIN, y, size: 12.5, text, color: INK });
		y -= 24;
	}
	return ops;
}

mkdirSync(outDir, { recursive: true });
const main = path.join(outDir, `${TEXT.file}.pdf`);
writeFileSync(main, Buffer.from(buildPdf([page1(), page2()], script, TEXT.title)));
const second = path.join(outDir, `${TEXT.extra.file}.pdf`);
writeFileSync(second, Buffer.from(buildPdf([extra()], script, TEXT.extra.title)));
console.log(`${main}\n${second}`);
