// PDF Simple のプロモーション動画を書き出す。
// promo/index.html をヘッドレスの Chrome で開き、時刻 t のコマを 1 枚ずつ撮って ffmpeg で MP4 にまとめる。
// 依存パッケージは不要（Node 22 の fetch / WebSocket と、ffmpeg・Google Chrome）。
//
//   node promo/render.mjs                         promo/out/pdf-simple-promo.mp4（全編。映像を書き出してから音を付ける）
//   node promo/render.mjs --audio                 音だけ作り直して付け直す（映像は前回の video-silent.mp4 を使う）
//   node promo/render.mjs --stills 9.5,23.4       promo/out/still-9.5.png …（確認用の静止画）
//   node promo/render.mjs --from 19 --to 33 --out step1.mp4（一部だけ。音は付けない）
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { synthesize } from './audio.mjs';

const CHROME =
	process.env.CHROME ??
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = Number(process.env.PROMO_PORT ?? 9444);
const W = 1920;
const H = 1080;
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out');

function parseArgs(argv) {
	const args = {};
	for (let i = 0; i < argv.length; i++) {
		const key = argv[i]?.replace(/^--/, '');
		const next = argv[i + 1];
		if (next !== undefined && !next.startsWith('--')) {
			args[key] = next;
			i++;
		} else args[key] = true;
	}
	return args;
}

const args = parseArgs(process.argv.slice(2));
const FPS = Number(args.fps ?? 30);
mkdirSync(OUT, { recursive: true });

const profile = mkdtempSync(path.join(os.tmpdir(), 'pdf-simple-promo-'));
const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${PORT}`,
		`--user-data-dir=${profile}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--hide-scrollbars',
		'--mute-audio',
		'--force-color-profile=srgb',
		'--disable-background-timer-throttling',
		'--disable-renderer-backgrounding',
		`--window-size=${W},${H}`,
		'about:blank',
	],
	{ stdio: 'ignore' },
);

function cleanup() {
	try {
		chrome.kill('SIGTERM');
	} catch {}
	setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
}
process.on('exit', cleanup);

async function pageTarget() {
	for (let i = 0; i < 100; i++) {
		try {
			const list = await (
				await fetch(`http://127.0.0.1:${PORT}/json/list`)
			).json();
			const page = list.find((target) => target.type === 'page');
			if (page) return page;
		} catch {}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('Chrome に接続できませんでした');
}

const target = await pageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	ws.onopen = resolve;
	ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
ws.onmessage = (event) => {
	const message = JSON.parse(String(event.data));
	const waiter = pending.get(message.id);
	if (!waiter) return;
	pending.delete(message.id);
	if (message.error) waiter.reject(new Error(message.error.message));
	else waiter.resolve(message.result);
};
function send(method, params = {}) {
	const id = ++nextId;
	ws.send(JSON.stringify({ id, method, params }));
	return new Promise((resolve, reject) =>
		pending.set(id, { resolve, reject }),
	);
}
async function evaluate(expression) {
	const result = await send('Runtime.evaluate', {
		expression,
		awaitPromise: true,
		returnByValue: true,
	});
	if (result.exceptionDetails)
		throw new Error(
			result.exceptionDetails.exception?.description ??
				result.exceptionDetails.text,
		);
	return result.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
	width: W,
	height: H,
	deviceScaleFactor: 1,
	mobile: false,
});
const url = `${pathToFileURL(path.join(DIR, 'index.html')).href}?render`;
await send('Page.navigate', { url });
for (let i = 0; i < 200; i++) {
	const ready = await evaluate('window.__ready === true').catch(() => false);
	if (ready) break;
	await new Promise((resolve) => setTimeout(resolve, 100));
}
const duration = await evaluate('window.__duration');

async function frame(t) {
	await evaluate(`window.__render(${t})`);
	const { data } = await send('Page.captureScreenshot', {
		format: 'png',
		fromSurface: true,
	});
	return Buffer.from(data, 'base64');
}

if (args.probe) {
	// 確認用: 時刻 --at のコマを描いてから、式の値を出す
	await evaluate(`window.__render(${Number(args.at ?? 0)})`);
	console.log(JSON.stringify(await evaluate(String(args.probe)), null, 1));
	cleanup();
	process.exit(0);
}

if (args.stills) {
	for (const value of String(args.stills).split(',')) {
		const t = Number(value);
		const file = path.join(OUT, `still-${t}.png`);
		writeFileSync(file, await frame(t));
		console.log(file);
	}
	cleanup();
	process.exit(0);
}

/** ffmpeg を動かし、標準エラーの内容を返す（失敗したら例外） */
function run(cmd, argv) {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'] });
		let err = '';
		child.stderr.on('data', (d) => (err += d));
		child.on('close', (code) => (code === 0 ? resolve(err) : reject(new Error(err))));
	});
}

/** 音を作って映像に付ける（音の大きさは 2 回通しの loudnorm で -16 LUFS にそろえる） */
async function addAudio(video, file) {
	const timeline = await evaluate('window.__timeline');
	writeFileSync(path.join(OUT, 'timeline.json'), JSON.stringify(timeline));
	const wav = path.join(OUT, 'audio.wav');
	synthesize(timeline, wav);
	const target = 'I=-16:TP=-1.5:LRA=11';
	const measured = await run('ffmpeg', ['-hide_banner', '-i', wav, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']);
	const open = measured.lastIndexOf('{');
	const m = JSON.parse(measured.slice(open, measured.indexOf('}', open) + 1));
	const norm = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
	await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', norm, '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-shortest', file]);
	console.log(`wrote ${file}（音: ${m.input_i} LUFS → -16 LUFS）`);
}

const silent = path.join(OUT, 'video-silent.mp4');
if (args.audio) {
	await addAudio(silent, path.join(OUT, 'pdf-simple-promo.mp4'));
	cleanup();
	process.exit(0);
}

const from = Number(args.from ?? 0);
const to = Math.min(Number(args.to ?? duration), duration);
const partial = Boolean(args.out || args.from || args.to);
const file = partial ? path.join(OUT, String(args.out ?? 'part.mp4')) : silent;
const ffmpeg = spawn(
	'ffmpeg',
	[
		'-y',
		'-loglevel',
		'error',
		'-f',
		'image2pipe',
		'-framerate',
		String(FPS),
		'-c:v',
		'png',
		'-i',
		'-',
		'-c:v',
		'libx264',
		'-preset',
		'slow',
		'-crf',
		String(args.crf ?? 16),
		'-pix_fmt',
		'yuv420p',
		'-profile:v',
		'high',
		'-movflags',
		'+faststart',
		file,
	],
	{ stdio: ['pipe', 'inherit', 'inherit'] },
);
const first = Math.round(from * FPS);
const last = Math.round(to * FPS);
const started = Date.now();
for (let i = first; i < last; i++) {
	const png = await frame(i / FPS);
	if (!ffmpeg.stdin.write(png)) await once(ffmpeg.stdin, 'drain');
	if ((i - first) % (FPS * 5) === 0) {
		const done = (i - first) / (last - first);
		const elapsed = (Date.now() - started) / 1000;
		console.log(
			`${(i / FPS).toFixed(1)}s / ${to}s  (${(done * 100).toFixed(0)}%, ${elapsed.toFixed(0)}s)`,
		);
	}
}
ffmpeg.stdin.end();
await once(ffmpeg, 'close');
console.log(`wrote ${file}`);
if (!partial) await addAudio(silent, path.join(OUT, 'pdf-simple-promo.mp4'));
cleanup();
process.exit(0);
