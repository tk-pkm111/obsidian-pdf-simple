// 30 秒の「最初の 1 回」の動画を、隔離した Obsidian の本物の画面から録る。
// 使い方の画面 → 練習用の PDF → なぞる → ノートが右に開く → 点とハイライトで行き来 → 「PDF を取り込む」。
// マウスの矢印と字幕は、録るあいだだけ画面に重ねて描く（Obsidian の DOM に足し、終わったら外す）。
// 画面は CDP の Page.startScreencast で撮り、ffmpeg で 30 fps の MP4 と README 用の GIF にする。
//
// 準備: まっさらな vault（このプラグインだけを入れたもの）で隔離した Obsidian を起動し、
//       信頼のダイアログを閉じておく（使い方の画面が開いている状態）。
//   E2E_VAULT=<まっさらな vault> npm run e2e -- launch
//   node promo/record-first-run.mjs              → promo/out/first-run-ja.mp4 / .gif
//   node promo/record-first-run.mjs --lang en    → promo/out/first-run-en.mp4 / .gif（Obsidian を英語にしてから）
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 9334);
const OUT = path.join(import.meta.dirname, 'out');
const LANG = process.argv.includes('--lang')
	? process.argv[process.argv.indexOf('--lang') + 1]
	: 'ja';
const WIDTH = 1280;
const HEIGHT = 720;

const CAPTIONS = {
	ja: {
		intro: 'PDF Simple　はじめての 1 回（30 秒）',
		practice: '①「練習用の PDF で試す」を押す',
		select: '② 枠の中の文をなぞって、色を選ぶ',
		note: '③ ノートが右に開いて、文が入る',
		dot: '④ ノートの点を押すと、PDF のその場所へ',
		back: '⑤ PDF のハイライトを押すと、ノートのその行へ',
		import: '⑥ 自分の PDF は「PDF を取り込む」から',
		outro: 'なぞるだけで、ノートにたまっていく。',
		practiceButton: '練習用の PDF で試す',
		target: 'なぞった文は',
	},
	en: {
		intro: 'PDF Simple: your first highlight (30 seconds)',
		practice: '1. Press "Try the practice PDF"',
		select: '2. Select the sentence in the box, pick a color',
		note: '3. The note opens on the right with the text',
		dot: '4. Click the dot in the note to jump to the PDF',
		back: '5. Click the highlight in the PDF to jump back',
		import: '6. Bring your own PDFs with "Import PDF"',
		outro: 'Just select, and your notes fill up.',
		practiceButton: 'Try the practice PDF',
		target: 'Selected text gets',
	},
}[LANG];

// ---------------------------------------------------------------------------
// CDP

async function pageTarget() {
	const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
	const page = list.find(
		(t) => t.type === 'page' && t.url.startsWith('app://obsidian.md/index.html'),
	);
	if (!page) throw new Error('Obsidian のウィンドウが見つかりません（npm run e2e -- launch を先に）');
	return page;
}

const target = await pageTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
	ws.onopen = resolve;
	ws.onerror = reject;
});
let nextId = 0;
const pending = new Map();
const listeners = new Map();
ws.onmessage = (event) => {
	const message = JSON.parse(event.data);
	if (message.id && pending.has(message.id)) {
		pending.get(message.id)(message);
		pending.delete(message.id);
	} else if (message.method) listeners.get(message.method)?.(message.params);
};
const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = ++nextId;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});
async function js(code) {
	const response = await send('Runtime.evaluate', {
		expression: `(async () => { ${code} })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	const details = response.result?.exceptionDetails;
	if (details) throw new Error(details.exception?.description ?? details.text);
	return response.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 画面に重ねる矢印と字幕

const OVERLAY = `
	document.getElementById('rec-layer')?.remove();
	const layer = document.body.createDiv({ attr: { id: 'rec-layer' } });
	layer.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;');
	const cursor = layer.createDiv({ attr: { id: 'rec-cursor' } });
	cursor.setAttribute('style', 'position:absolute;left:0;top:0;width:28px;height:28px;transform:translate(640px,360px);transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));');
	cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.4 20.4 L11.4 13.7 L17.6 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
	const caption = layer.createDiv({ attr: { id: 'rec-caption' } });
	caption.setAttribute('style', 'position:absolute;left:50%;bottom:34px;transform:translateX(-50%);padding:12px 26px;border-radius:999px;background:rgba(20,22,28,.88);color:#fff;font:600 22px/1.3 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 8px 30px rgba(0,0,0,.35);opacity:0;transition:opacity .35s;white-space:nowrap;');
	window.__rec = {
		move(x, y) { cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; },
		caption(text) {
			if (!text) { caption.style.opacity = '0'; return; }
			caption.textContent = text; caption.style.opacity = '1';
		},
		ripple(x, y) {
			const r = layer.createDiv();
			r.setAttribute('style', 'position:absolute;left:' + (x - 18) + 'px;top:' + (y - 18) + 'px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,212,0,.95);transform:scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out;');
			requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
			setTimeout(() => r.remove(), 600);
		},
	};
`;

let mouse = { x: WIDTH / 2, y: HEIGHT / 2 };

async function moveTo(x, y, ms = 800, buttons = 0) {
	const from = { ...mouse };
	const steps = Math.max(1, Math.round(ms / 16));
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
		const px = from.x + (x - from.x) * e;
		const py = from.y + (y - from.y) * e;
		await js(`window.__rec.move(${px}, ${py})`);
		await send('Input.dispatchMouseEvent', {
			type: 'mouseMoved',
			x: px,
			y: py,
			buttons,
			...(buttons ? { button: 'left' } : {}),
		});
		await sleep(8);
	}
	mouse = { x, y };
}

async function click(x, y) {
	await moveTo(x, y);
	await sleep(250);
	await js(`window.__rec.ripple(${x}, ${y})`);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
	await sleep(70);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}

async function drag(x1, y1, x2, y2, ms = 1300) {
	await moveTo(x1, y1);
	await sleep(250);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
	await moveTo(x2, y2, ms, 1);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
}

const caption = (text) => js(`window.__rec.caption(${JSON.stringify(text ?? '')})`);

/** 要素の中心（または左端・右端）の座標。見つからなければ例外 */
async function point(finder, where = 'center') {
	const p = await js(`
		const el = (${finder})();
		if (!el) return null;
		const r = el.getBoundingClientRect();
		const x = ${JSON.stringify(where)} === 'left' ? r.left + 2 : ${JSON.stringify(where)} === 'right' ? r.right - 2 : r.left + r.width / 2;
		return { x, y: r.top + r.height / 2 };
	`);
	if (!p) throw new Error(`見つかりません: ${finder}`);
	return p;
}

// ---------------------------------------------------------------------------
// 録る

const frames = [];
listeners.set('Page.screencastFrame', (params) => {
	frames.push({ data: params.data, t: params.metadata.timestamp });
	void send('Page.screencastFrameAck', { sessionId: params.sessionId });
});

await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await js(`
	const win = window.require('@electron/remote').getCurrentWindow();
	win.setContentSize(${WIDTH}, ${HEIGHT});
	await new Promise((r) => setTimeout(r, 600));
	app.workspace.rightSplit.collapse();
	if (!document.querySelector('.pdf-simple-welcome')) {
		app.commands.executeCommandById('pdf-simple:show-welcome');
		await new Promise((r) => setTimeout(r, 800));
	}
	document.querySelectorAll('.notice').forEach((n) => n.remove());
`);
await js(OVERLAY);
await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await sleep(400);

await caption(CAPTIONS.intro);
await sleep(2200);

await caption(CAPTIONS.practice);
const practice = await point(`() => [...document.querySelectorAll('.pdf-simple-welcome button')].find((b) => b.textContent.includes(${JSON.stringify(CAPTIONS.practiceButton)}))`);
await sleep(500);
await click(practice.x, practice.y);
await sleep(2200);

await caption(CAPTIONS.select);
const finder = `() => [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')].find((s) => s.textContent.startsWith(${JSON.stringify(CAPTIONS.target)}))`;
const start = await point(finder, 'left');
const end = await point(finder, 'right');
await drag(start.x, start.y, end.x, end.y);
await sleep(700);
const dot = await point(`() => document.querySelector('.pdf-simple-selection-popup .pdf-simple-color-dot')`);
await click(dot.x, dot.y);
await sleep(900);

await caption(CAPTIONS.note);
await sleep(3600);
await js(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);

await caption(CAPTIONS.dot);
const noteDot = await point(`() => [...document.querySelectorAll('.pdf-simple-dot')].find((d) => d.isShown())`);
await click(noteDot.x, noteDot.y);
await sleep(2400);

await caption(CAPTIONS.back);
const mark = await point(`() => document.querySelector('.pdf-simple-highlight-layer .pdf-simple-highlight-group > *')`);
await click(mark.x, mark.y);
await sleep(2400);

await caption(CAPTIONS.import);
const ribbon = await point(`() => [...document.querySelectorAll('.side-dock-ribbon-action')].find((e) => /PDF/.test(e.getAttribute('aria-label') ?? ''))`);
await moveTo(ribbon.x, ribbon.y, 900);
await sleep(2400);

await caption(CAPTIONS.outro);
await moveTo(WIDTH * 0.62, HEIGHT * 0.45, 900);
await sleep(2400);
await caption('');
await sleep(500);

await send('Page.stopScreencast');
await sleep(300);
await js(`document.getElementById('rec-layer')?.remove()`);
ws.close();

// ---------------------------------------------------------------------------
// MP4 と GIF にする（コマの間隔は、届いた時刻の差のとおり）

if (frames.length < 2) throw new Error('コマが撮れませんでした（ウィンドウが隠れていないか確かめる）');
mkdirSync(OUT, { recursive: true });
const tmp = mkdtempSync(path.join(os.tmpdir(), 'first-run-'));
const list = [];
frames.forEach((frame, i) => {
	const file = path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
	writeFileSync(file, Buffer.from(frame.data, 'base64'));
	const next = frames[i + 1]?.t ?? frame.t + 0.5;
	list.push(`file '${file}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(4)}`);
});
list.push(`file '${path.join(tmp, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));

async function ffmpeg(args) {
	const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
	const [code] = await once(child, 'exit');
	if (code !== 0) throw new Error(`ffmpeg が失敗しました (${code})`);
}

const mp4 = path.join(OUT, `first-run-${LANG}.mp4`);
const gif = path.join(OUT, `first-run-${LANG}.gif`);
await ffmpeg([
	'-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
	'-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p',
	'-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', mp4,
]);
await ffmpeg([
	'-i', mp4,
	'-vf', 'fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160[p];[b][p]paletteuse=dither=sierra2_4a',
	gif,
]);
rmSync(tmp, { recursive: true, force: true });
console.log(`frames ${frames.length}, ${mp4}, ${gif}`);
