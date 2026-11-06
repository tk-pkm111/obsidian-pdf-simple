// 「新しくなったこと」の画面に流す、機能ごとの短い動画（5〜8 秒・くり返し再生）を、隔離した Obsidian の本物の画面から録る。
// ① PDF を取り込む ② 練習用の PDF ③ ノートの「PDF」ボタン ④ 見出しの「H」。マウスの矢印だけを重ねて描く（ラベルは画面の側で出す）。
// 画面は CDP の Page.startScreencast で撮り、要る所を切り出して 960×540 の MP4 にする。
//
// 準備: まっさらな vault（このプラグインだけを入れたもの）で隔離した Obsidian を起動し、信頼のダイアログを閉じておく。
//   E2E_VAULT=<まっさらな vault> npm run e2e -- launch
//   node promo/record-whats-new.mjs              → promo/out/whats-new/0.2.0-*-ja.mp4
//   node promo/record-whats-new.mjs --lang en    → promo/out/whats-new/0.2.0-*-en.mp4（Obsidian を英語にしてから）
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT ?? 9334);
const OUT = path.join(import.meta.dirname, 'out', 'whats-new');
const LANG = process.argv.includes('--lang')
	? process.argv[process.argv.indexOf('--lang') + 1]
	: 'ja';
const VERSION = '0.2.0';
/** --only import で①だけを録る（省略ですべて） */
const ONLY = process.argv.includes('--only')
	? new Set(process.argv[process.argv.indexOf('--only') + 1].split(','))
	: null;
const want = (name) => ONLY === null || ONLY.has(name);
const WIDTH = 1100;
const HEIGHT = 660;
// 取り込む PDF（SAMPLE_PDF で指定。無ければ開発用に自作した試験用のもの。英語の画面では英語の PDF）
const SAMPLE =
	process.env.SAMPLE_PDF ??
	path.join(import.meta.dirname, '..', 'dev-vault', 'PDF', LANG === 'ja' ? 'sample-japanese.pdf' : 'sample-3-pages.pdf');

const TEXT = {
	ja: {
		note: '読書ノート',
		imported: '読書会の資料.pdf',
		practiceNote: 'PDF Simple 練習',
		target: 'なぞった文は',
		headingStart: '第',
		headingEnd: 'はじめに',
		back: 'ノートに戻る',
		chip: 'PDF を開く',
	},
	en: {
		note: 'Reading notes',
		imported: 'Book club notes.pdf',
		practiceNote: 'PDF Simple practice',
		target: 'Selected text gets',
		headingStart: 'Chapter 1',
		headingEnd: 'Introduction',
		back: 'Back to note',
		chip: 'Open PDF',
	},
}[LANG];

// ---------------------------------------------------------------------------
// CDP

const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
const target = list.find((t) => t.type === 'page' && t.url.startsWith('app://obsidian.md/index.html'));
if (!target) throw new Error('Obsidian のウィンドウが見つかりません（npm run e2e -- launch を先に）');
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
		expression: `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ${code} })()`,
		awaitPromise: true,
		returnByValue: true,
	});
	const details = response.result?.exceptionDetails;
	if (details) throw new Error(details.exception?.description ?? details.text);
	return response.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// マウスの矢印（録るあいだだけ画面に重ねる）

const OVERLAY = `
	document.getElementById('rec-layer')?.remove();
	const layer = document.body.createDiv({ attr: { id: 'rec-layer' } });
	layer.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;');
	const cursor = layer.createDiv();
	cursor.setAttribute('style', 'position:absolute;left:0;top:0;width:28px;height:28px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));');
	cursor.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.4 20.4 L11.4 13.7 L17.6 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
	window.__rec = {
		move(x, y) { cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; },
		ripple(x, y) {
			const r = layer.createDiv();
			r.setAttribute('style', 'position:absolute;left:' + (x - 18) + 'px;top:' + (y - 18) + 'px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,212,0,.95);transform:scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out;');
			requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
			setTimeout(() => r.remove(), 600);
		},
	};
`;

let mouse = { x: WIDTH / 2, y: HEIGHT / 2 };
async function place(x, y) {
	mouse = { x, y };
	await js(`window.__rec.move(${x}, ${y})`);
	await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
}
async function moveTo(x, y, ms = 700, buttons = 0) {
	const from = { ...mouse };
	const steps = Math.max(1, Math.round(ms / 16));
	for (let i = 1; i <= steps; i++) {
		const t = i / steps;
		const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
		const px = from.x + (x - from.x) * e;
		const py = from.y + (y - from.y) * e;
		await js(`window.__rec.move(${px}, ${py})`);
		await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons, ...(buttons ? { button: 'left' } : {}) });
		await sleep(8);
	}
	mouse = { x, y };
}
async function click(x, y) {
	await moveTo(x, y);
	await sleep(220);
	await js(`window.__rec.ripple(${x}, ${y})`);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
	await sleep(70);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
async function drag(x1, y1, x2, y2, ms = 1100) {
	await moveTo(x1, y1);
	await sleep(200);
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x1, y: y1, button: 'left', buttons: 1, clickCount: 1 });
	await moveTo(x2, y2, ms, 1);
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x2, y: y2, button: 'left', buttons: 0, clickCount: 1 });
}
/** 要素の中心（または左端・右端）。見つからなければ例外 */
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
// 録る・書き出す

let frames = [];
listeners.set('Page.screencastFrame', (params) => {
	frames.push({ data: params.data, t: params.metadata.timestamp });
	void send('Page.screencastFrameAck', { sessionId: params.sessionId });
});
async function start() {
	frames = [];
	await send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: WIDTH * 2, maxHeight: HEIGHT * 2, everyNthFrame: 1 });
	await sleep(300);
}
async function ffmpeg(args) {
	const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
	const [code] = await once(child, 'exit');
	if (code !== 0) throw new Error(`ffmpeg が失敗しました (${code})`);
}
/** 撮ったコマを、crop（CSS ピクセル。省略で窓全体の 16:9）で切り出して書き出す */
async function finish(name, crop) {
	await sleep(250);
	await send('Page.stopScreencast');
	await sleep(250);
	if (frames.length < 2) throw new Error(`${name}: コマが撮れませんでした`);
	const tmp = mkdtempSync(path.join(os.tmpdir(), 'whats-new-'));
	const lines = [];
	frames.forEach((frame, i) => {
		const file = path.join(tmp, `f${String(i).padStart(5, '0')}.jpg`);
		writeFileSync(file, Buffer.from(frame.data, 'base64'));
		const next = frames[i + 1]?.t ?? frame.t + 0.4;
		lines.push(`file '${file}'`, `duration ${Math.max(0.001, next - frame.t).toFixed(4)}`);
	});
	lines.push(`file '${path.join(tmp, `f${String(frames.length - 1).padStart(5, '0')}.jpg`)}'`);
	writeFileSync(path.join(tmp, 'list.txt'), lines.join('\n'));
	const box = crop ?? { x: 0, y: 0, w: WIDTH, h: Math.round((WIDTH * 9) / 16) };
	const s = 2; // 撮ったコマは CSS の 2 倍
	mkdirSync(OUT, { recursive: true });
	const out = path.join(OUT, `${VERSION}-${name}-${LANG}.mp4`);
	await ffmpeg([
		'-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'),
		'-vf', `crop=${box.w * s}:${box.h * s}:${box.x * s}:${box.y * s},fps=30,scale=960:540:flags=lanczos,format=yuv420p`,
		'-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-movflags', '+faststart', '-an', out,
	]);
	rmSync(tmp, { recursive: true, force: true });
	console.log(`${name}: ${frames.length} frames → ${out}`);
}

/** 本体のタブをすべて閉じて、ファイルを 1 つ開く */
async function only(filePath) {
	await js(`
		const leaves = [];
		app.workspace.iterateAllLeaves((l) => { if (l.getRoot() === app.workspace.rootSplit) leaves.push(l); });
		for (const l of leaves) l.detach();
		await sleep(300);
		await app.workspace.getLeaf(false).openFile(app.vault.getFileByPath(${JSON.stringify(filePath)}));
		await sleep(1500);
	`);
}

// ---------------------------------------------------------------------------
// 準備

await send('Emulation.setFocusEmulationEnabled', { enabled: true });
await js(`
	window.require('@electron/remote').getCurrentWindow().setContentSize(${WIDTH}, ${HEIGHT});
	await sleep(600);
	document.querySelectorAll('.modal-container').forEach((m) => m.remove());
	app.workspace.rightSplit.collapse();
	app.workspace.leftSplit.expand();
	if (!app.vault.getFileByPath(${JSON.stringify(TEXT.note + '.md')}))
		await app.vault.create(${JSON.stringify(TEXT.note + '.md')}, '');
`);
await only(`${TEXT.note}.md`);
await js(OVERLAY);
const pl = `app.plugins.plugins['pdf-simple']`;

// ① PDF を取り込む（ファイルを選ぶ画面は OS のものなので、押したら選んだことにして取り込む）
await place(560, 330);
await start();
await sleep(500);
const ribbon = await point(`() => [...document.querySelectorAll('.side-dock-ribbon-action')].find((e) => /PDF/.test(e.getAttribute('aria-label') ?? ''))`);
await moveTo(ribbon.x, ribbon.y, 800);
await sleep(700);
await js(`HTMLInputElement.prototype.__click = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () {};`);
await click(ribbon.x, ribbon.y);
await sleep(700);
await js(`
	HTMLInputElement.prototype.click = HTMLInputElement.prototype.__click;
	document.querySelectorAll('.pdf-simple-file-input').forEach((e) => e.remove());
	const bytes = window.require('fs').readFileSync(${JSON.stringify(SAMPLE)});
	await ${pl}.importer.importFiles([new File([bytes], ${JSON.stringify(TEXT.imported)}, { type: 'application/pdf' })]);
`);
await moveTo(420, 380, 900);
await sleep(2600);
await finish('import', { x: 0, y: 0, w: 704, h: 396 });
// ②〜④ は練習用の PDF を順に使うので、①だけを録るときはここで終える
if (!want('practice')) {
	await js(`document.getElementById('rec-layer')?.remove();`);
	ws.close();
	process.exit(0);
}

// ② 練習用の PDF（なぞると、ノートが右に開いて文が入る）
await js(`document.querySelectorAll('.notice').forEach((n) => n.remove()); await ${pl}.onboarding.openPractice(); await sleep(2500);`);
await only(`${TEXT.practiceNote}.pdf`);
await js(`document.querySelectorAll('.notice').forEach((n) => n.remove());`);
await place(700, 420);
await start();
await sleep(500);
const finder = `() => [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')].find((s) => s.textContent.startsWith(${JSON.stringify(TEXT.target)}))`;
const s1 = await point(finder, 'left');
const s2 = await point(finder, 'right');
await drag(s1.x, s1.y, s2.x, s2.y);
await sleep(600);
const dot = await point(`() => document.querySelector('.pdf-simple-selection-popup .pdf-simple-color-dot')`);
await click(dot.x, dot.y);
await moveTo(760, 470, 900);
await sleep(3200);
await finish('practice');

// ③ ノートの「PDF」ボタン（押すと PDF に裏返り、紙のボタンでノートへ戻る）
await js(`document.querySelectorAll('.notice').forEach((n) => n.remove());`);
await only(`${TEXT.practiceNote}.md`);
await place(700, 300);
await start();
await sleep(500);
const chip = await point(`() => document.querySelector('.workspace-leaf.mod-active .view-action.pdf-simple-pdf-chip')`);
await moveTo(chip.x, chip.y, 800);
await sleep(800);
await click(chip.x, chip.y);
await sleep(1500);
const back = await point(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .view-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(TEXT.back)}))`);
await moveTo(back.x, back.y, 700);
await sleep(600);
await click(back.x, back.y);
await sleep(300);
// 戻ったあとは矢印を本文へ離す（同じ場所に本体の閲覧ボタンがあり、その説明が出てしまうため）
await moveTo(WIDTH - 420, 300, 700);
await sleep(1300);
await finish('pdf-button', { x: WIDTH - 800, y: 0, w: 800, h: 450 });

// ④ 見出しの「H」（色を選んでから塗るとき、H に乗せると見出し 1〜3）
await js(`
	await ${pl}.setSelectAction('popup');
	const leaves = [];
	app.workspace.iterateAllLeaves((l) => { if (l.getRoot() === app.workspace.rootSplit) leaves.push(l); });
	for (const l of leaves) l.detach();
	await sleep(300);
	const left = app.workspace.getLeaf(false);
	await left.openFile(app.vault.getFileByPath(${JSON.stringify(TEXT.practiceNote + '.pdf')}));
	const right = app.workspace.createLeafBySplit(left, 'vertical');
	await right.openFile(app.vault.getFileByPath(${JSON.stringify(TEXT.practiceNote + '.md')}), { active: false });
	await sleep(1500);
	app.workspace.setActiveLeaf(left, { focus: true });
	const span = [...left.view.contentEl.querySelectorAll('.textLayer span.textLayerNode')].find((s) => s.textContent.startsWith(${JSON.stringify(TEXT.headingStart)}));
	span.scrollIntoView({ block: 'center' });
	await sleep(900);
	document.querySelectorAll('.notice').forEach((n) => n.remove());
`);
await place(520, 250);
await start();
await sleep(500);
const h1 = await point(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')].find((s) => s.textContent.startsWith(${JSON.stringify(TEXT.headingStart)}))`, 'left');
const h2 = await point(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')].find((s) => s.textContent.includes(${JSON.stringify(TEXT.headingEnd)}))`, 'right');
await drag(h1.x, h1.y, h2.x, h2.y, 800);
await sleep(700);
const hButton = await point(`() => document.querySelector('.pdf-simple-selection-popup .pdf-simple-heading-button')`);
await moveTo(hButton.x, hButton.y, 700);
await sleep(900);
const level2 = await point(`() => [...document.querySelectorAll('.pdf-simple-heading-level')].find((b) => b.textContent === 'H2')`);
await moveTo(level2.x, level2.y, 500);
await sleep(400);
await click(level2.x, level2.y);
await moveTo(780, 360, 900);
await sleep(2600);
await finish('heading');
await js(`await ${pl}.setSelectAction('highlight'); document.getElementById('rec-layer')?.remove();`);
ws.close();
