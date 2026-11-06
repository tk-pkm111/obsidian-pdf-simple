// 使い方の動画（約 3 分・1 本）を、隔離した Obsidian の本物の画面から録って書き出す。
// 台本: Claude アーティファクト「PDF Simple 使い方動画の台本」（設計書 §29）。
//
//   1) 題材の PDF を作る:   node promo/tour-demo-pdf.mjs promo/out/tour-pdf/ja ja
//   2) 録る vault を用意し、隔離した Obsidian を起動する（このプラグインだけを入れ、data.json で案内・説明を済みにしておく）
//        E2E_VAULT=<vault> npm run e2e -- launch
//   3) 録る:      node promo/record-tour.mjs record [--lang ja]   → promo/out/tour/<lang>/raw/<章>/（コマと出来事）
//   4) 書き出す:  node promo/record-tour.mjs compose [--lang ja]  → promo/out/tour/tour-<lang>.mp4 と .jpg（最初のコマ）
//
// 録るのは本物の画面とマウスの矢印だけ。寄る・引く（カメラ）、字幕、章のカード、題名と終わりのカード、音は、書き出すときに足す。
// カメラは画面の CSS ピクセルの四角（16:9）で記録し、ffmpeg で切り出して 1920×1080 にする（コマは 2560×1440）。
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { synthesize } from './audio.mjs';

const MODE = process.argv[2] ?? 'record';
const LANG = process.argv.includes('--lang') ? process.argv[process.argv.indexOf('--lang') + 1] : 'ja';
const PORT = Number(process.env.E2E_PORT ?? 9334);
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DIR = import.meta.dirname;
const OUT = path.join(DIR, 'out', 'tour', LANG);
const RAW = path.join(OUT, 'raw');
const PDF_DIR = process.env.TOUR_PDF_DIR ?? path.join(DIR, 'out', 'tour-pdf', LANG);
const W = 1280;
const H = 720;
const OW = 1920;
const OH = 1080;
const CARD = 1.4;
/** 書き出す順（録る順とは違う。つかみは整えたあとの画面で録る） */
const ORDER = ['ch0', 'ch1', 'ch2', 'ch3', 'ch4', 'ch5'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const T = {
	ja: {
		main: '読んだことを、使える知識にする',
		extra: '会議の資料',
		folder: 'ダウンロード',
		open: '開く',
		cancel: 'キャンセル',
		ribbon: 'PDF を取り込む',
		paper: 'ノートに戻る',
		green: '緑',
		yellow: '黄',
		h2: '見出し 2',
		body: '本文',
		insertHeading: 'ハイライトを入れる見出し',
		pdfFolder: 'PDF の保存先',
		flipMode: '切り替え方',
		headingValue: '## ハイライト',
		folderValue: '資料/PDF',
		lines: {
			c1a: '本を読み終えた直後は',
			c1b: 'しかし数日たつと',
			c1c: '読むだけで終わらせず',
			c2a: '大事だと思った文には',
			c2b: '線を引いた文をノートに',
			c2c: '自分の言葉で一言を',
			h1: 'なぜ読んだことを忘れるのか',
			h2: '線を引いて、書き出す',
			figTop: '60%',
			figLeft: '50%',
			figRight: 'ノートにまとめる',
			figBottom: '読むだけ',
		},
		cards: {
			ch1: ['1', 'はじめる'],
			ch2: ['2', 'なぞる'],
			ch3: ['3', '行き来する'],
			ch4: ['4', '整える'],
			ch5: ['5', '設定'],
		},
		chapterNames: ['はじめる', 'なぞる', '行き来', '整える', '設定'],
		title: ['PDF Simple', '3 分でわかる使い方'],
		end: ['まずは 1 回、', 'なぞってみましょう。'],
		cap: {
			hook: 'PDF をなぞると、ノートにたまる。',
			add: 'まず、PDF を Obsidian に入れます。',
			drag: 'ファイル一覧へドラッグするだけです。',
			ribbon: '左の「PDF を取り込む」からも選べます。',
			open: '入った PDF を押して開きます。',
			first: 'なぞって色を選ぶと、この PDF のノートができます。',
			second: '2 回目からは、なぞるだけで塗られます。',
			toNote: '右上のボタンで、ノートに切り替わります。',
			order: 'なぞった文が、PDF の順にたまっています。',
			dot: '文の後ろの ● を押すと、PDF のその場所へ。',
			hl: 'PDF の色の所を押すと、ノートのその行へ。',
			flip: '右上のボタンで、表と裏を切り替えます。',
			pen: '右上のペンで、色を変えられます。',
			heading: '章の名前は、見出しにできます。',
			chapters: 'ノートが章立てになります。',
			region: '図や表は、囲むと画像で入ります。',
			insert: 'ノートのどこに入れるかを決められます。',
			folder: 'PDF の置き場所も決めておけます。',
			split: '「分割して並べる」にすると、左右に並べて開きます。',
		},
	},
	en: {
		main: 'Turning reading into knowledge',
		extra: 'Meeting notes',
		folder: 'Downloads',
		open: 'Open',
		cancel: 'Cancel',
		ribbon: 'Import PDF',
		paper: 'Back to note',
		green: 'Green',
		yellow: 'Yellow',
		h2: 'Heading 2',
		body: 'Body text',
		insertHeading: 'Heading for highlights',
		pdfFolder: 'PDF storage folder',
		flipMode: 'How to flip',
		headingValue: '## Highlights',
		folderValue: 'Library/PDF',
		lines: {
			c1a: 'Right after a book',
			c1b: 'A few days later',
			c1c: "Don't just read",
			c2a: 'Mark the sentences',
			c2b: 'Collect them in a note',
			c2c: 'Add a line in your own',
			h1: 'Why we forget what we read',
			h2: 'Mark it, then write it down',
			figTop: '60%',
			figLeft: '50%',
			figRight: 'Write notes',
			figBottom: 'Read only',
		},
		cards: {
			ch1: ['1', 'Get started'],
			ch2: ['2', 'Select'],
			ch3: ['3', 'Go back and forth'],
			ch4: ['4', 'Organize'],
			ch5: ['5', 'Settings'],
		},
		chapterNames: ['Start', 'Select', 'Go back and forth', 'Organize', 'Settings'],
		title: ['PDF Simple', 'How it works, in 3 minutes'],
		end: ['Try it:', 'select some text.'],
		cap: {
			hook: 'Select text in a PDF. It collects in your note.',
			add: 'First, add a PDF to Obsidian.',
			drag: 'Just drag it into the file list.',
			ribbon: 'Or choose one with Import PDF on the left.',
			open: 'Click the PDF to open it.',
			first: 'Select text and pick a color. A note for this PDF is created.',
			second: "After that, just select. It's highlighted right away.",
			toNote: 'The button at the top right switches to the note.',
			order: 'Your highlights collect there, in PDF order.',
			dot: 'Click the ● after the text to jump to that spot in the PDF.',
			hl: 'Click a highlight to go to its line in the note.',
			flip: 'Flip between note and PDF with the button at the top right.',
			pen: 'Change the color with the pen at the top right.',
			heading: 'Make chapter titles into headings.',
			chapters: 'Your note gets organized by chapter.',
			region: 'Drag a box around a figure to add it as an image.',
			insert: 'Choose where highlights go in your notes.',
			folder: 'And set a folder to keep your PDFs in.',
			split: 'Choose "Open side by side" to see both at once.',
		},
	},
}[LANG];

async function ffmpeg(args) {
	const child = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });
	const [code] = await once(child, 'exit');
	if (code !== 0) throw new Error(`ffmpeg が失敗しました (${code})`);
}

/** CDP につなぐ（ページを選ぶ関数を渡す） */
async function connect(port, pick) {
	const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const target = list.find(pick);
	if (!target) throw new Error(`ページが見つかりません (port ${port})`);
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
	const js = async (code) => {
		const response = await send('Runtime.evaluate', {
			expression: `(async () => { const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); ${code} })()`,
			awaitPromise: true,
			returnByValue: true,
		});
		const details = response.result?.exceptionDetails;
		if (details) throw new Error(details.exception?.description ?? details.text);
		return response.result?.result?.value;
	};
	return { ws, send, js, listeners };
}

// ===========================================================================
// 録る

async function record() {
	const { ws, send, js, listeners } = await connect(PORT, (t) => t.type === 'page' && t.url.startsWith('app://obsidian.md/index.html'));
	const pl = `app.plugins.plugins['pdf-simple']`;

	// --- マウスの矢印・ドラッグの影・波紋（録るあいだだけ html の直下に重ねる） ---
	const OVERLAY = `
		document.getElementById('rec-layer')?.remove();
		const layer = document.documentElement.createDiv({ attr: { id: 'rec-layer' } });
		layer.setAttribute('style', 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;');
		const cursor = layer.createDiv();
		cursor.setAttribute('style', 'position:absolute;left:0;top:0;width:26px;height:26px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));');
		cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.4 20.4 L11.4 13.7 L17.6 13.4 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
		const ghost = layer.createDiv();
		ghost.setAttribute('style', 'position:absolute;left:0;top:0;display:none;opacity:.85;');
		window.__rec = {
			move(x, y) { cursor.style.transform = 'translate(' + (x - 4) + 'px,' + (y - 2) + 'px)'; ghost.style.transform = 'translate(' + (x - 18) + 'px,' + (y - 6) + 'px)'; },
			ghost(html) { if (html) { ghost.innerHTML = html; ghost.style.display = 'block'; } else ghost.style.display = 'none'; },
			ripple(x, y) {
				const r = layer.createDiv();
				r.setAttribute('style', 'position:absolute;left:' + (x - 18) + 'px;top:' + (y - 18) + 'px;width:36px;height:36px;border-radius:50%;border:3px solid rgba(255,212,0,.95);transform:scale(.4);opacity:1;transition:transform .45s ease-out,opacity .45s ease-out;');
				requestAnimationFrame(() => { r.style.transform = 'scale(1.4)'; r.style.opacity = '0'; });
				setTimeout(() => r.remove(), 600);
			},
			poke() { layer.style.opacity = layer.style.opacity === '0.999' ? '1' : '0.999'; },
		};
	`;

	// --- 出来事の記録 ---
	let events = [];
	const ev = (type, data = {}) => events.push({ t: Date.now() / 1000, type, ...data });

	let mouse = { x: W / 2, y: H / 2 };
	async function place(x, y) {
		mouse = { x, y };
		await js(`window.__rec.move(${x}, ${y})`);
		await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
	}
	async function moveTo(x, y, ms = 800, buttons = 0) {
		const from = { ...mouse };
		const steps = Math.max(1, Math.round(ms / 16));
		for (let i = 1; i <= steps; i++) {
			const u = i / steps;
			const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
			const px = from.x + (x - from.x) * e;
			const py = from.y + (y - from.y) * e;
			await js(`window.__rec.move(${px}, ${py})`);
			await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: px, y: py, buttons, ...(buttons ? { button: 'left' } : {}) });
			await sleep(8);
		}
		mouse = { x, y };
	}
	async function click(p, { modifiers = 0, wait = 380, ms = 800 } = {}) {
		await moveTo(p.x, p.y, ms);
		await sleep(wait);
		ev('sfx', { sfx: 'click' });
		await js(`window.__rec.ripple(${p.x}, ${p.y})`);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1, modifiers });
		await sleep(80);
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1, modifiers });
	}
/** ヘッダーのボタンを押して、すぐ矢印を本文へ離す（押したあとに同じ場所の本体のボタンの説明が出ないように） */
	async function clickHeader(r) {
		const p = center(r);
		await click(p);
		await moveTo(p.x - 260, p.y + 240, 350);
	}
	async function drag(a, b, ms = 1500) {
		await moveTo(a.x, a.y);
		await sleep(350);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', buttons: 1, clickCount: 1 });
		ev('sfx', { sfx: 'select', dur: ms / 1000 });
		await moveTo(b.x, b.y, ms, 1);
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', buttons: 0, clickCount: 1 });
	}
	async function type(text, firstChunk = 1) {
		const chars = [...text];
		const chunks = [chars.slice(0, firstChunk).join(''), ...chars.slice(firstChunk)];
		ev('sfx', { sfx: 'typing', n: chunks.length, dur: chunks.length * 0.11 });
		for (const chunk of chunks) {
			await send('Input.insertText', { text: chunk });
			await sleep(110);
		}
	}
	/** 要素の四角（見つからなければ例外） */
	async function rect(finder) {
		const r = await js(`const el = (${finder})(); if (!el) return null; const b = el.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom };`);
		if (!r) throw new Error(`見つかりません: ${finder}`);
		return r;
	}
	const center = (r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 });
	/** アクティブな PDF の、その文を含む 1 行（同じ高さの span をまとめる） */
	async function line(probe, exact = false) {
		const r = await js(`
			const spans = [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')];
			const first = spans.find((s) => ${exact} ? s.textContent.trim() === ${JSON.stringify(probe)} : s.textContent.includes(${JSON.stringify(probe)}));
			if (!first) return null;
			const mid = (s) => { const b = s.getBoundingClientRect(); return (b.top + b.bottom) / 2; };
			const y = mid(first);
			const same = spans.filter((s) => s.closest('.page') === first.closest('.page') && Math.abs(mid(s) - y) < 7 && s.textContent.trim() !== '');
			const rs = same.map((s) => s.getBoundingClientRect());
			return { left: Math.min(...rs.map((b) => b.left)), right: Math.max(...rs.map((b) => b.right)), top: Math.min(...rs.map((b) => b.top)), bottom: Math.max(...rs.map((b) => b.bottom)) };
		`);
		if (!r) throw new Error(`行が見つかりません: ${probe}`);
		return r;
	}
	/**
	 * その行が画面の端に近ければ、真ん中あたりまで PDF をスクロールしてから四角を返す
	 * （端の近くでなぞると、ブラウザが自動でスクロールして次の行まで選んでしまう）
	 */
	async function visibleLine(probe, exact = false) {
		let r = await line(probe, exact);
		if (r.bottom > H - 150 || r.top < 130) {
			const delta = Math.round(r.top - H * 0.45);
			await js(`document.querySelector('.workspace-leaf.mod-active .pdf-viewer-container')?.scrollBy({ top: ${delta}, behavior: 'smooth' }); await sleep(800);`);
			ev('sfx', { sfx: 'scroll', dur: 0.6 });
			r = await line(probe, exact);
		}
		return r;
	}
	/** 行をなぞる（左端から右端まで） */
	async function selectLine(probe, ms = 1500) {
		const r = await visibleLine(probe);
		const y = (r.top + r.bottom) / 2;
		// 行の端ちょうどで離すと次の行まで選ばれることがあるので、少し手前で離す（語の終わりまでは選んだ側で広がる）
		await drag({ x: r.left + 2, y }, { x: r.right - 0.5, y }, ms);
		return r;
	}
	/** カメラ: 四角 r を zoom 倍で真ん中に（null で全体）。動き終わるまで待つ */
	async function camera(r, zoom = 1.6, ms = 750) {
		let box = null;
		if (r) {
			const w = W / zoom;
			const h = (w * 9) / 16;
			const c = center(r);
			box = {
				x: Math.min(Math.max(0, c.x - w / 2), W - w),
				y: Math.min(Math.max(0, c.y - h / 2), H - h),
				w,
			};
		}
		ev('camera', { box, ms: ms / 1000 });
		ev('sfx', { sfx: 'zoom', dur: ms / 1000 });
		await sleep(ms + 150);
	}
	const caption = (text) => ev('caption', { text });
	async function card(key) {
		ev('card', { key, dur: CARD });
		await sleep(CARD * 1000 + 200);
	}
	const notices = () => js(`document.querySelectorAll('.notice').forEach((n) => n.remove())`);

	// --- 章ごとに録る（コマはその場でファイルに書く） ---
	let frameDir = null;
	let frames = [];
	listeners.set('Page.screencastFrame', (params) => {
		void send('Page.screencastFrameAck', { sessionId: params.sessionId });
		if (!frameDir) return;
		const file = `f${String(frames.length).padStart(5, '0')}.jpg`;
		writeFileSync(path.join(frameDir, file), Buffer.from(params.data, 'base64'));
		frames.push({ file, t: params.metadata.timestamp });
	});
	async function chapter(name, fn) {
		frameDir = path.join(RAW, name);
		rmSync(frameDir, { recursive: true, force: true });
		mkdirSync(frameDir, { recursive: true });
		frames = [];
		events = [];
		await send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 2560, maxHeight: 1440, everyNthFrame: 1 });
		await sleep(200);
		const start = Date.now() / 1000;
		await js(`window.__rec.poke()`);
		await sleep(200);
		await fn();
		await js(`window.__rec.poke()`);
		await sleep(250);
		const end = Date.now() / 1000;
		await send('Page.stopScreencast');
		await sleep(300);
		frameDir = null;
		writeFileSync(path.join(RAW, name, 'meta.json'), JSON.stringify({ start, end, frames, events }, null, '\t'));
		console.log(`${name}: ${frames.length} frames, ${(end - start).toFixed(1)}s`);
	}

	// --- 準備: 窓の大きさ、vault を空に、設定を既定に ---
	await send('Emulation.setFocusEmulationEnabled', { enabled: true });
	await js(`
		window.require('@electron/remote').getCurrentWindow().setContentSize(${W}, ${H});
		await sleep(600);
		document.querySelectorAll('.modal-container').forEach((m) => m.remove());
		const p = ${pl};
		await p.applySettings({ ...p.settings, onboardingDone: true, welcomeShown: true, tipsShown: ['pen', 'chip'], insertHeading: '', pdfFolder: '', flipMode: 'same-leaf', selectAction: 'highlight', defaultColor: 'yellow', defaultHeading: 0 });
		const leaves = [];
		app.workspace.iterateAllLeaves((l) => { if (l.getRoot() === app.workspace.rootSplit) leaves.push(l); });
		for (const l of leaves) l.detach();
		for (const f of [...app.vault.getAllLoadedFiles()].filter((f) => f.path !== '/' && !f.path.startsWith('.')))
			if (app.vault.getAbstractFileByPath(f.path)) await app.vault.delete(f, true);
		app.workspace.rightSplit.collapse();
		app.workspace.leftSplit.expand();
		app.workspace.leftSplit.setSize?.(250);
		await sleep(800);
	`);
	await js(OVERLAY);
	const mainPdf = path.join(PDF_DIR, `${T.main}.pdf`);
	const extraPdf = path.join(PDF_DIR, `${T.extra}.pdf`);
	if (!existsSync(mainPdf)) throw new Error(`題材の PDF がありません: ${mainPdf}（promo/tour-demo-pdf.mjs で作る）`);
	await place(760, 400);

	// ------------------------------------------------------------------------
	// 1 はじめる: パソコンのフォルダからドラッグ → 「PDF を取り込む」 → 開く
	await chapter('ch1', async () => {
		await card('ch1');
		// パソコンのフォルダの窓（OS の画面は録れないので、録るあいだだけ描く）
		await js(`
			const win = document.body.createDiv({ attr: { id: 'rec-finder' } });
			win.setAttribute('style', 'position:fixed;left:640px;top:170px;width:420px;height:250px;background:#2b2b2e;border:1px solid #4a4a50;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);z-index:50;font:13px -apple-system,"Hiragino Sans",sans-serif;color:#e6e6e8;overflow:hidden;user-select:none;');
			win.innerHTML = '<div style="height:38px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#323236;border-bottom:1px solid #444"><span style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></span><span style="width:12px;height:12px;border-radius:50%;background:#febc2e"></span><span style="width:12px;height:12px;border-radius:50%;background:#28c840"></span><span style="margin-left:12px;font-weight:600">${T.folder}</span></div>'
				+ '<div style="display:flex;gap:28px;padding:30px 34px">'
				+ '<div id="rec-file" style="width:150px;text-align:center;padding:10px;border-radius:8px"><div style="width:58px;height:74px;margin:0 auto;border-radius:6px;background:#fff;position:relative;box-shadow:0 2px 6px rgba(0,0,0,.35)"><div style="position:absolute;left:0;right:0;bottom:12px;margin:auto;width:42px;padding:2px 0;border-radius:3px;background:#e5484d;color:#fff;font:700 11px sans-serif">PDF</div></div><div style="margin-top:10px;line-height:1.35">${T.main}.pdf</div></div>'
				+ '</div>';
		`);
		await sleep(300);
		const file = center(await rect(`() => document.getElementById('rec-file')`));
		const list = await rect(`() => document.querySelector('.workspace-split.mod-left-split .nav-files-container')`);
		await camera({ left: 0, top: 60, right: 1080, bottom: 560 }, 1.25);
		caption(T.cap.add);
		await moveTo(file.x, file.y, 1000);
		await sleep(500);
		await js(`document.getElementById('rec-file').style.background = 'rgba(80,130,255,.35)'`);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: file.x, y: file.y, button: 'left', buttons: 1, clickCount: 1 });
		await js(`window.__rec.ghost('<div style="width:40px;height:52px;border-radius:5px;background:#fff;box-shadow:0 4px 14px rgba(0,0,0,.5);position:relative"><div style="position:absolute;left:4px;right:4px;bottom:8px;padding:1px 0;border-radius:2px;background:#e5484d;color:#fff;font:700 9px sans-serif;text-align:center">PDF</div></div>')`);
		caption(T.cap.drag);
		ev('sfx', { sfx: 'slide', dur: 1.6 });
		await moveTo((list.left + list.right) / 2, list.top + 60, 1800, 1);
		await sleep(250);
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: mouse.x, y: mouse.y, button: 'left', buttons: 0, clickCount: 1 });
		await js(`
			window.__rec.ghost(null);
			window.__rec.ripple(${(list.left + list.right) / 2}, ${list.top + 60});
			document.getElementById('rec-file').style.background = '';
			const bytes = window.require('fs').readFileSync(${JSON.stringify(mainPdf)});
			await app.vault.createBinary(${JSON.stringify(`${T.main}.pdf`)}, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
		`);
		ev('sfx', { sfx: 'pop' });
		await sleep(2200);
		await js(`document.getElementById('rec-finder')?.remove()`);
		await sleep(300);

		// 左の「PDF を取り込む」（ファイルを選ぶ画面は OS のものなので、録るあいだだけ描く）
		const ribbon = center(await rect(`() => [...document.querySelectorAll('.side-dock-ribbon-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(T.ribbon)}))`));
		await camera({ left: 0, top: 0, right: 900, bottom: 500 }, 1.4);
		caption(T.cap.ribbon);
		await js(`HTMLInputElement.prototype.__click = HTMLInputElement.prototype.click; HTMLInputElement.prototype.click = function () {};`);
		await click(ribbon);
		await js(`
			HTMLInputElement.prototype.click = HTMLInputElement.prototype.__click;
			document.querySelectorAll('.pdf-simple-file-input').forEach((e) => e.remove());
			const sheet = document.body.createDiv({ attr: { id: 'rec-picker' } });
			sheet.setAttribute('style', 'position:fixed;left:250px;top:120px;width:560px;height:300px;background:#2b2b2e;border:1px solid #4a4a50;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.6);z-index:50;font:13px -apple-system,"Hiragino Sans",sans-serif;color:#e6e6e8;display:flex;flex-direction:column;overflow:hidden;');
			sheet.innerHTML = '<div style="height:40px;display:flex;align-items:center;padding:0 16px;border-bottom:1px solid #444;font-weight:600">${T.folder}</div>'
				+ '<div style="flex:1;padding:8px 10px">'
				+ '<div id="rec-pick" style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px"><span style="width:16px;height:20px;border-radius:2px;background:#fff;display:inline-block;position:relative"><span style="position:absolute;left:1px;right:1px;bottom:3px;height:5px;background:#e5484d;border-radius:1px"></span></span>${T.extra}.pdf</div>'
				+ '<div style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;color:#9a9aa3"><span style="width:16px;height:20px;border-radius:2px;background:#8a8a90;display:inline-block"></span>${T.main}.pdf</div>'
				+ '</div>'
				+ '<div style="display:flex;justify-content:flex-end;gap:10px;padding:12px 16px;border-top:1px solid #444"><span style="padding:5px 14px;border-radius:6px;background:#3a3a40">${T.cancel}</span><span id="rec-open" style="padding:5px 18px;border-radius:6px;background:#3d7bf7;color:#fff;font-weight:600">${T.open}</span></div>';
		`);
		ev('sfx', { sfx: 'panel' });
		await sleep(700);
		const pick = center(await rect(`() => document.getElementById('rec-pick')`));
		await click(pick, { wait: 250 });
		await js(`document.getElementById('rec-pick').style.background = '#3d7bf7'`);
		await sleep(400);
		const open = center(await rect(`() => document.getElementById('rec-open')`));
		await click(open, { wait: 300 });
		await js(`
			document.getElementById('rec-picker')?.remove();
			const bytes = window.require('fs').readFileSync(${JSON.stringify(extraPdf)});
			await ${pl}.importer.importFiles([new File([bytes], ${JSON.stringify(`${T.extra}.pdf`)}, { type: 'application/pdf' })]);
		`);
		ev('sfx', { sfx: 'panelOut' });
		await camera(null);
		await sleep(2200);
		await notices();

		// ファイル一覧の PDF を押して開く
		caption(T.cap.open);
		const item = center(await rect(`() => [...document.querySelectorAll('.nav-file-title')].find((e) => e.dataset.path === ${JSON.stringify(`${T.main}.pdf`)})`));
		await click(item);
		await js(`await sleep(120); const c = document.querySelector('.workspace-leaf.mod-active .pdf-viewer-container'); if (c) c.scrollTop = 0;`);
		ev('sfx', { sfx: 'pageSwap', dur: 0.6 });
		await sleep(2600);
		caption(null);
	});

	// ------------------------------------------------------------------------
	// 2 なぞる: 最初の 1 回は色を選ぶ → 2 回目からはなぞるだけ → 右上のボタンでノートへ
	await chapter('ch2', async () => {
		// 前に開いたときの位置が残っていることがあるので、ページの上へ（章のカードの間に）
		await js(`const c = document.querySelector('.workspace-leaf.mod-active .pdf-viewer-container'); if (c) c.scrollTop = 0;`);
		await card('ch2');
		const c1 = await line(T.lines.c1a);
		await camera({ left: c1.left, top: c1.top - 60, right: c1.left + 520, bottom: c1.bottom + 120 }, 1.7);
		caption(T.cap.first);
		await selectLine(T.lines.c1a);
		await sleep(700);
		const yellow = center(await rect(`() => document.querySelector('.pdf-simple-selection-popup .pdf-simple-color-dot')`));
		await click(yellow, { ms: 600 });
		ev('sfx', { sfx: 'pop' });
		await sleep(900);
		// 右上に「ノートを作りました」が出る
		await camera(null);
		ev('sfx', { sfx: 'toast' });
		await sleep(2400);
		await notices();
		await visibleLine(T.lines.c2b);
		const c1c = await line(T.lines.c1c);
		const c2b = await line(T.lines.c2b);
		await camera({ left: c1c.left, top: c1c.top - 30, right: c1c.left + 520, bottom: c2b.bottom + 30 }, 1.6);
		caption(T.cap.second);
		await selectLine(T.lines.c1c);
		ev('sfx', { sfx: 'pop' });
		await sleep(900);
		await selectLine(T.lines.c2b);
		ev('sfx', { sfx: 'pop' });
		await sleep(1400);
		// 右上の紙のボタンでノートへ
		const paper = await rect(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .view-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(T.paper)}))`);
		await camera({ left: paper.left - 300, top: 0, right: paper.right + 10, bottom: 200 }, 1.8);
		caption(T.cap.toNote);
		await clickHeader(paper);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(900);
		await camera(null);
		caption(T.cap.order);
		await moveTo(900, 520, 900);
		await sleep(3000);
		caption(null);
	});

	// ------------------------------------------------------------------------
	// 3 行き来: ● で PDF へ → 色の所でノートへ → 右上のボタンで表と裏
	await chapter('ch3', async () => {
		await card('ch3');
		const dot = await rect(`() => document.querySelector('.workspace-leaf.mod-active .pdf-simple-dot')`);
		await camera({ left: dot.left - 420, top: dot.top - 120, right: dot.right + 80, bottom: dot.bottom + 120 }, 1.8);
		caption(T.cap.dot);
		await click(center(dot), { wait: 600 });
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(700);
		await camera(null);
		await sleep(1800);
		const hl = await visibleLine(T.lines.c1c);
		await camera({ left: hl.left - 40, top: hl.top - 100, right: hl.right + 40, bottom: hl.bottom + 100 }, 1.7);
		caption(T.cap.hl);
		await click({ x: (hl.left + hl.right) / 2, y: (hl.top + hl.bottom) / 2 }, { wait: 600 });
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(700);
		await camera(null);
		await sleep(1800);
		const chip = await rect(`() => document.querySelector('.workspace-leaf.mod-active .view-action.pdf-simple-pdf-chip')`);
		await camera({ left: chip.left - 300, top: 0, right: chip.right + 40, bottom: 200 }, 1.8);
		caption(T.cap.flip);
		await clickHeader(chip);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(1500);
		const paper = await rect(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .view-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(T.paper)}))`);
		await clickHeader(paper);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(1500);
		caption(null);
		await camera(null);
		await sleep(400);
	});

	// ------------------------------------------------------------------------
	// 4 整える: ペンで色 → 見出し 2 で章の名前 → ノートが章立てに → 範囲を画像に
	async function penMenu(label) {
		const pen = center(await rect(`() => document.querySelector('.workspace-leaf.mod-active .pdf-simple-tool-pen')`));
		await click(pen);
		ev('sfx', { sfx: 'menu' });
		await sleep(700);
		const item = center(await rect(`() => [...document.querySelectorAll('.menu .menu-item')].find((e) => e.querySelector('.menu-item-title')?.textContent.trim().endsWith(${JSON.stringify(label)}))`));
		await click(item, { ms: 600 });
		ev('sfx', { sfx: 'menuClose' });
		await sleep(600);
	}
	await chapter('ch4', async () => {
		await card('ch4');
		// ノートから PDF へ（ここは章のカードの間に済ませる）
		const chip = await rect(`() => document.querySelector('.workspace-leaf.mod-active .view-action.pdf-simple-pdf-chip')`);
		await clickHeader(chip);
		await sleep(1200);
		await camera({ left: 700, top: 40, right: 1280, bottom: 360 }, 1.6);
		caption(T.cap.pen);
		await penMenu(T.green);
		const c2 = await visibleLine(T.lines.c2a);
		await camera({ left: c2.left, top: c2.top - 60, right: c2.left + 520, bottom: c2.bottom + 100 }, 1.6);
		await selectLine(T.lines.c2a);
		ev('sfx', { sfx: 'pop' });
		await sleep(1500);
		// 見出し 2 にして、章の名前をなぞる
		await camera({ left: 700, top: 40, right: 1280, bottom: 360 }, 1.6);
		caption(T.cap.heading);
		await penMenu(T.h2);
		const h1 = await visibleLine(T.lines.h1);
		await camera({ left: h1.left - 20, top: h1.top - 60, right: h1.left + 560, bottom: h1.bottom + 300 }, 1.4);
		await selectLine(T.lines.h1, 1200);
		ev('sfx', { sfx: 'pop' });
		await sleep(900);
		await selectLine(T.lines.h2, 1200);
		ev('sfx', { sfx: 'pop' });
		await sleep(1200);
		// 本文・黄に戻して、ノートへ
		await camera({ left: 700, top: 40, right: 1280, bottom: 360 }, 1.6);
		await penMenu(T.body);
		await penMenu(T.yellow);
		const paper = await rect(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .view-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(T.paper)}))`);
		await clickHeader(paper);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(900);
		await camera({ left: 300, top: 60, right: 1100, bottom: 520 }, 1.3);
		caption(T.cap.chapters);
		await moveTo(1100, 560, 900);
		await sleep(3200);
		// 範囲を画像に
		await camera(null);
		const chip2 = await rect(`() => document.querySelector('.workspace-leaf.mod-active .view-action.pdf-simple-pdf-chip')`);
		await clickHeader(chip2);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(1400);
		await js(`
			const span = [...document.querySelectorAll('.workspace-leaf.mod-active .textLayer span.textLayerNode')].find((s) => s.textContent.includes(${JSON.stringify(T.lines.figRight)}));
			span?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			await sleep(900);
		`);
		ev('sfx', { sfx: 'scroll', dur: 0.8 });
		const region = center(await rect(`() => document.querySelector('.workspace-leaf.mod-active .pdf-simple-tool-region')`));
		caption(T.cap.region);
		await click(region);
		await sleep(500);
		const top = await line(T.lines.figTop, true);
		const left = await line(T.lines.figLeft, true);
		const right = await line(T.lines.figRight, true);
		const bottom = await line(T.lines.figBottom, true);
		const box = { left: left.left - 14, top: top.top - 16, right: right.right + 16, bottom: bottom.bottom + 12 };
		await camera({ left: box.left - 40, top: box.top - 40, right: box.right + 40, bottom: box.bottom + 40 }, 1.35);
		await moveTo(box.left, box.top, 700);
		await sleep(300);
		await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.left, y: box.top, button: 'left', buttons: 1, clickCount: 1 });
		ev('sfx', { sfx: 'select', dur: 1.2 });
		await moveTo(box.right, box.bottom, 1300, 1);
		await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.right, y: box.bottom, button: 'left', buttons: 0, clickCount: 1 });
		ev('sfx', { sfx: 'pop' });
		await sleep(1800);
		await notices();
		// ノートに画像が入った
		const paper2 = await rect(`() => [...document.querySelectorAll('.workspace-leaf.mod-active .view-action')].find((e) => (e.getAttribute('aria-label') ?? '').includes(${JSON.stringify(T.paper)}))`);
		await camera(null);
		await clickHeader(paper2);
		ev('sfx', { sfx: 'flip', dur: 0.8 });
		await sleep(900);
		await js(`
			const img = document.querySelector('.workspace-leaf.mod-active .markdown-source-view img, .workspace-leaf.mod-active .markdown-preview-view img');
			img?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			await sleep(900);
		`);
		await moveTo(1100, 600, 800);
		await sleep(2600);
		caption(null);
	});

	// ------------------------------------------------------------------------
	// つかみ（ここまでで整ったノートと PDF を左右に並べ、もう 1 文なぞる）
	await js(`
		await ${pl}.setPenColor('yellow');
		const leaves = [];
		app.workspace.iterateAllLeaves((l) => { if (l.getRoot() === app.workspace.rootSplit) leaves.push(l); });
		for (const l of leaves) l.detach();
		await sleep(300);
		const left = app.workspace.getLeaf(false);
		await left.openFile(app.vault.getFileByPath(${JSON.stringify(`${T.main}.md`)}));
		const right = app.workspace.createLeafBySplit(left, 'vertical');
		await right.openFile(app.vault.getFileByPath(${JSON.stringify(`${T.main}.pdf`)}));
		await sleep(1800);
		app.workspace.setActiveLeaf(right, { focus: true });
		const scroller = right.view.containerEl.querySelector('.pdf-viewer-container');
		if (scroller) scroller.scrollTop = 0;
		left.view.editor?.scrollTo?.(0, 0);
		await sleep(500);
		document.querySelectorAll('.notice').forEach((n) => n.remove());
	`);
	await place(980, 560);
	await chapter('ch0', async () => {
		await sleep(600);
		caption(T.cap.hook);
		await selectLine(T.lines.c2c, 1600);
		ev('sfx', { sfx: 'pop' });
		await sleep(1200);
		await moveTo(640, 600, 900);
		await sleep(1800);
		caption(null);
		// 題名のカード（書き出すときに重ねる）の間、画面は止めておく
		ev('title', { dur: 3.6 });
		await sleep(3800);
	});

	// ------------------------------------------------------------------------
	// 5 設定: 入れる見出し → 保存先 → 切り替え方（分割して並べる）
	await js(`
		const leaves = [];
		app.workspace.iterateAllLeaves((l) => { if (l.getRoot() === app.workspace.rootSplit) leaves.push(l); });
		for (const l of leaves) l.detach();
		await sleep(300);
		await app.workspace.getLeaf(false).openFile(app.vault.getFileByPath(${JSON.stringify(`${T.main}.md`)}));
		await sleep(1200);
	`);
	await chapter('ch5', async () => {
		await card('ch5');
		await js(`app.setting.open(); app.setting.openTabById('pdf-simple'); await sleep(900);`);
		ev('sfx', { sfx: 'panel' });
		const settingOf = (name) => `() => [...document.querySelectorAll('.mod-settings .setting-item')].find((e) => e.querySelector('.setting-item-name')?.textContent.trim() === ${JSON.stringify(name)})`;
		await js(`(${settingOf(T.insertHeading)})()?.scrollIntoView({ block: 'center' }); await sleep(500);`);
		const area = await rect(`() => (${settingOf(T.insertHeading)})()?.querySelector('textarea')`);
		const item = await rect(settingOf(T.insertHeading));
		await camera({ left: item.left, top: item.top - 40, right: item.right, bottom: item.bottom + 40 }, 1.45);
		caption(T.cap.insert);
		await click(center(area));
		await sleep(300);
		await type(T.headingValue, 4);
		await sleep(1500);
		await js(`(${settingOf(T.pdfFolder)})()?.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(800);`);
		ev('sfx', { sfx: 'scroll', dur: 0.8 });
		const folder = await rect(`() => (${settingOf(T.pdfFolder)})()?.querySelector('input')`);
		const item2 = await rect(settingOf(T.pdfFolder));
		await camera({ left: item2.left, top: item2.top - 40, right: item2.right, bottom: item2.bottom + 40 }, 1.45);
		caption(T.cap.folder);
		await click(center(folder));
		await sleep(300);
		await type(T.folderValue);
		await sleep(400);
		await js(`document.querySelectorAll('.suggestion-container').forEach((s) => s.remove())`);
		await sleep(1200);
		await js(`(${settingOf(T.flipMode)})()?.scrollIntoView({ block: 'center', behavior: 'smooth' }); await sleep(800);`);
		ev('sfx', { sfx: 'scroll', dur: 0.8 });
		const visibleSelect = `[...(${settingOf(T.flipMode)})()?.querySelectorAll('select') ?? []].find((e) => e.offsetParent !== null)`;
		const select = await rect(`() => ${visibleSelect}`);
		const item3 = await rect(settingOf(T.flipMode));
		await camera({ left: item3.left, top: item3.top - 40, right: item3.right, bottom: item3.bottom + 40 }, 1.45);
		caption(T.cap.split);
		await click(center(select));
		// 選択肢の一覧は OS のもので録れないので、押したら選んだことにする
		await js(`
			const select = ${visibleSelect};
			select.value = 'split';
			select.dispatchEvent(new Event('change', { bubbles: true }));
			await sleep(400);
		`);
		ev('sfx', { sfx: 'toggle' });
		await sleep(1400);
		await camera(null);
		await js(`app.setting.close(); await sleep(600);`);
		ev('sfx', { sfx: 'panelOut' });
		const chip = await rect(`() => document.querySelector('.workspace-leaf.mod-active .view-action.pdf-simple-pdf-chip')`);
		await clickHeader(chip);
		ev('sfx', { sfx: 'move', dur: 0.6 });
		await sleep(1600);
		await moveTo(640, 620, 900);
		await sleep(1800);
		caption(null);
		// 終わりのカード（書き出すときに重ねる）の間、画面は止めておく
		ev('end', { dur: 4 });
		await sleep(4200);
	});

	await js(`document.getElementById('rec-layer')?.remove(); document.getElementById('rec-finder')?.remove(); document.getElementById('rec-picker')?.remove();`);
	ws.close();
}

// ===========================================================================
// 書き出す

/** 重ねる絵（字幕・章のカード・題名・終わり）を、ヘッドレスの Chrome で透明な PNG にする */
async function renderOverlays(items, dir) {
	const port = 9446;
	const profile = path.join(OUT, 'chrome-profile');
	const chrome = spawn(CHROME, [
		'--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
		'--hide-scrollbars', '--no-first-run', '--no-default-browser-check', `--window-size=${OW},${OH}`, 'about:blank',
	], { stdio: 'ignore' });
	try {
		let page = null;
		for (let i = 0; i < 50 && !page; i++) {
			await sleep(200);
			try {
				page = await connect(port, (t) => t.type === 'page');
			} catch {
				page = null;
			}
		}
		if (!page) throw new Error('Chrome に接続できません');
		await page.send('Emulation.setDeviceMetricsOverride', { width: OW, height: OH, deviceScaleFactor: 1, mobile: false });
		await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
		for (const item of items) {
			await page.js(`document.documentElement.innerHTML = ${JSON.stringify(item.html)}; await document.fonts.ready; await sleep(60); return 1;`);
			const shot = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: OW, height: OH, scale: 1 } });
			writeFileSync(path.join(dir, item.file), Buffer.from(shot.result.data, 'base64'));
		}
		page.ws.close();
	} finally {
		chrome.kill();
	}
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = `-apple-system,"Hiragino Sans","Hiragino Kaku Gothic ProN",sans-serif`;
const BASE = `<style>*{margin:0;box-sizing:border-box}html,body{width:${OW}px;height:${OH}px;background:transparent;font-family:${FONT};-webkit-font-smoothing:antialiased}</style>`;
function captionHtml(text) {
	return `${BASE}<body><div style="position:absolute;left:0;right:0;bottom:70px;display:flex;justify-content:center"><div style="max-width:1640px;padding:16px 34px 18px;border-radius:16px;background:rgba(14,14,18,.84);color:#fff;font-size:46px;font-weight:700;letter-spacing:.01em;line-height:1.35;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.35)">${esc(text).replace('●', '<span style="color:#FFD400">●</span>')}</div></div></body>`;
}
function cardHtml(n, name, names, index) {
	const pills = names
		.map((label, i) => `<div style="flex:1;border-top:6px solid ${i === index ? '#8B74FF' : i < index ? '#5b5470' : '#34323d'};padding-top:14px;color:${i === index ? '#fff' : '#8d8a99'};font-size:28px;font-weight:${i === index ? 700 : 500}">${esc(label)}</div>`)
		.join('');
	return `${BASE}<body><div style="position:absolute;inset:0;background:radial-gradient(120% 120% at 15% 10%,#2a2350 0%,#141319 62%);color:#fff">
		<div style="position:absolute;left:150px;top:110px;font-size:32px;font-weight:800;color:#cfcbe0">PDF <span style="background:#FFD400;color:#1b1b1b;padding:2px 10px;border-radius:8px;font-style:italic">Simple</span></div>
		<div style="position:absolute;left:150px;top:330px;display:flex;align-items:baseline;gap:42px"><div style="font-size:220px;font-weight:800;color:#8B74FF;line-height:1">${esc(n)}</div><div style="font-size:120px;font-weight:800;line-height:1.1">${esc(name)}</div></div>
		<div style="position:absolute;left:150px;right:150px;bottom:120px;display:flex;gap:18px">${pills}</div>
	</div></body>`;
}
function titleHtml([brand, sub]) {
	return `${BASE}<body><div style="position:absolute;inset:0;background:rgba(12,11,18,.78);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:34px;color:#fff">
		<div style="font-size:150px;font-weight:800;letter-spacing:-.01em">${esc(brand.split(' ')[0])} <span style="background:#FFD400;color:#1b1b1b;padding:0 26px;border-radius:22px;font-style:italic">${esc(brand.split(' ')[1] ?? '')}</span></div>
		<div style="font-size:60px;font-weight:700;color:#e8e6f2">${esc(sub)}</div>
	</div></body>`;
}
function endHtml([a, b]) {
	return `${BASE}<body><div style="position:absolute;inset:0;background:rgba(12,11,18,.8);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:40px;color:#fff">
		<div style="font-size:96px;font-weight:800;line-height:1.3;text-align:center">${esc(a)}<br>${esc(b)}</div>
		<div style="font-size:44px;font-weight:800;color:#cfcbe0">PDF <span style="background:#FFD400;color:#1b1b1b;padding:2px 12px;border-radius:10px;font-style:italic">Simple</span></div>
	</div></body>`;
}

/** カメラの出来事から、時刻 it（zoompan の入力の時刻＝章の中の秒）の四角を返す ffmpeg の式（x, y, w。CSS ピクセル） */
function cameraExpr(events) {
	const full = { x: 0, y: 0, w: W };
	const keys = [];
	let current = full;
	for (const e of events.filter((e) => e.type === 'camera')) {
		const to = e.box ?? full;
		keys.push({ t0: e.t, t1: e.t + e.ms, from: current, to });
		current = to;
	}
	const ease = (u) => `(${u})*(${u})*(3-2*(${u}))`;
	const build = (k) => {
		let expr = String(current[k]);
		for (let i = keys.length - 1; i >= 0; i--) {
			const { t0, t1, from, to } = keys[i];
			const u = `clip((it-${t0.toFixed(3)})/${(t1 - t0).toFixed(3)},0,1)`;
			const value = `(${from[k]}+(${to[k] - from[k]})*${ease(u)})`;
			expr = `if(lt(it,${t1.toFixed(3)}),${value},${expr})`;
			if (i === 0) expr = `if(lt(it,${t0.toFixed(3)}),${from[k]},${expr})`;
		}
		return expr;
	};
	return { x: build('x'), y: build('y'), w: build('w') };
}

async function compose() {
	const chapters = ORDER.map((name) => {
		const meta = JSON.parse(readFileSync(path.join(RAW, name, 'meta.json'), 'utf8'));
		return { name, ...meta };
	});
	const work = path.join(OUT, 'work');
	rmSync(work, { recursive: true, force: true });
	mkdirSync(work, { recursive: true });

	// 重ねる絵を作る
	const overlays = [];
	const names = T.chapterNames;
	const cardIndex = { ch1: 0, ch2: 1, ch3: 2, ch4: 3, ch5: 4 };
	for (const ch of chapters)
		for (const e of ch.events) {
			if (e.type === 'caption' && e.text) e.file = `cap-${overlays.push({ file: `cap-${overlays.length}.png`, html: captionHtml(e.text) }) - 1}.png`;
			if (e.type === 'card') {
				const [n, name] = T.cards[e.key];
				e.file = `card-${e.key}.png`;
				overlays.push({ file: e.file, html: cardHtml(n, name, names, cardIndex[e.key]) });
			}
			if (e.type === 'title') {
				e.file = 'title.png';
				overlays.push({ file: e.file, html: titleHtml(T.title) });
			}
			if (e.type === 'end') {
				e.file = 'end.png';
				overlays.push({ file: e.file, html: endHtml(T.end) });
			}
		}
	await renderOverlays(overlays, work);
	console.log(`overlays: ${overlays.length}`);

	// 章ごとに 1 本の MP4 にする（カメラ・重ねる絵）
	const parts = [];
	const audio = { HL: {}, CAPS: [], CLICKS: [], SFX: [] };
	let offset = 0;
	const chapterStarts = {};
	for (const ch of chapters) {
		const local = (t) => t - ch.start;
		const duration = ch.end - ch.start;
		chapterStarts[ch.name] = offset;
		// コマの並び（章の始まりの時点で見えていたコマから。最初のコマは章の始まりから数える）
		const first = Math.max(0, ch.frames.findLastIndex((f) => f.t <= ch.start));
		const frames = ch.frames.slice(first);
		const lines = [];
		frames.forEach((frame, i) => {
			const from = i === 0 ? ch.start : frame.t;
			const next = frames[i + 1]?.t ?? ch.end;
			lines.push(`file '${path.join(RAW, ch.name, frame.file)}'`, `duration ${Math.max(0.001, next - from).toFixed(4)}`);
		});
		lines.push(`file '${path.join(RAW, ch.name, frames[frames.length - 1].file)}'`);
		const list = path.join(work, `${ch.name}.txt`);
		writeFileSync(list, lines.join('\n'));

		const events = ch.events.map((e) => ({ ...e, t: local(e.t) }));
		const cam = cameraExpr(events);
		// コマ（2560×1440）を 3840×2160 に広げてから zoompan で切り出す（広げておくと、寄る途中の位置の丸めでがたつかない）
		const k = 3840 / W;
		const inputs = ['-f', 'concat', '-safe', '0', '-i', list];
		const filters = [
			`[0:v]fps=30,scale=3840:2160:flags=lanczos,zoompan=z='${W}/(${cam.w})':x='(${cam.x})*${k}':y='(${cam.y})*${k}':d=1:s=${OW}x${OH}:fps=30,setsar=1[v0]`,
		];
		// 字幕は次の字幕（か null）まで。カード・題名・終わりは決まった長さ
		const shown = [];
		events.forEach((e, i) => {
			if (e.type === 'caption' && e.text) {
				const next = events.slice(i + 1).find((n) => n.type === 'caption');
				shown.push({ file: e.file, start: e.t, end: next ? next.t : duration, fade: 0.22 });
			}
			if (e.type === 'card') shown.push({ file: e.file, start: e.t, end: e.t + e.dur, fade: 0.25 });
			// 題名は章の終わりまで、終わりのカードは動画の終わりまで出したままにする
			if (e.type === 'title') shown.push({ file: e.file, start: e.t, end: duration, fade: 0.4 });
			if (e.type === 'end') shown.push({ file: e.file, start: e.t, end: duration, fade: 0.4, hold: true });
		});
		shown.forEach((s, i) => {
			const len = s.end - s.start;
			inputs.push('-loop', '1', '-t', len.toFixed(3), '-i', path.join(work, s.file));
			const out = s.hold ? '' : `,fade=t=out:st=${Math.max(0, len - s.fade).toFixed(3)}:d=${s.fade}:alpha=1`;
			filters.push(`[${i + 1}:v]format=rgba,fade=t=in:st=0:d=${s.fade}:alpha=1${out},setpts=PTS-STARTPTS+${s.start.toFixed(3)}/TB[o${i}]`);
			filters.push(`[v${i}][o${i}]overlay=eof_action=pass:enable='between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})'[v${i + 1}]`);
		});
		const out = path.join(work, `${ch.name}.mp4`);
		await ffmpeg([
			...inputs,
			'-filter_complex', filters.join(';'),
			'-map', `[v${shown.length}]`,
			'-t', duration.toFixed(3),
			'-r', '30', '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '28', '-pix_fmt', 'yuv420p', '-an', out,
		]);
		parts.push(out);
		console.log(`${ch.name}: ${duration.toFixed(1)}s`);

		// 音の合図（全体の時刻に直す）
		for (const e of events) {
			const t = offset + e.t;
			if (e.type === 'card') audio.CAPS.push({ t: [t, t + e.dur], subs: [] });
			if (e.type === 'caption' && e.text) audio.SFX.push({ t, type: 'text' });
			if (e.type === 'title' || e.type === 'end') audio.SFX.push({ t, type: 'logo' });
			if (e.type === 'sfx') {
				if (e.sfx === 'click') audio.CLICKS.push(t);
				else audio.SFX.push({ t, type: e.sfx, dur: e.dur, n: e.n, end: e.dur ? t + e.dur : undefined, note: 84 });
			}
		}
		offset += duration;
	}

	// つなげて、音を付ける
	const concat = path.join(work, 'parts.txt');
	writeFileSync(concat, parts.map((p) => `file '${p}'`).join('\n'));
	const silent = path.join(work, 'video.mp4');
	await ffmpeg(['-f', 'concat', '-safe', '0', '-i', concat, '-c', 'copy', silent]);
	const DURATION = offset;
	const wav = path.join(work, 'audio.wav');
	synthesize({ DURATION, ...audio, MUSIC: { drumsIn: Infinity, lightFrom: 0, lightTo: 0, outro: DURATION - 6, end: DURATION - 0.3, gain: 0.42 } }, wav);
	const final = path.join(path.dirname(OUT), `tour-${LANG}.mp4`);
	await ffmpeg([
		'-i', silent, '-i', wav,
		'-c:v', 'copy', // 合成した音は大きさがそろっているので、少し上げて頭を抑えるだけ（AAC にすると鋭い音が 3dB ほど上に出るので、低めに抑える）
		'-af', 'alimiter=level_in=1.5:limit=0.6:attack=2:release=60:level=false', '-c:a', 'aac', '-b:a', '128k',
		'-movflags', '+faststart', '-shortest', final,
	]);
	await ffmpeg(['-ss', '0.2', '-i', final, '-frames:v', '1', '-q:v', '3', final.replace(/\.mp4$/, '.jpg')]);
	const at = (name) => Math.round(chapterStarts[name]);
	console.log(`${final} (${DURATION.toFixed(1)}s)`);
	console.log(`TOUR_CHAPTERS: はじめる 0 / なぞる ${at('ch2')} / 行き来 ${at('ch3')} / 整える ${at('ch4')} / 設定 ${at('ch5')}`);
	writeFileSync(path.join(path.dirname(OUT), `tour-${LANG}-chapters.json`), JSON.stringify({ duration: DURATION, chapters: { start: 0, select: at('ch2'), flip: at('ch3'), organize: at('ch4'), settings: at('ch5') } }, null, '\t'));
}

if (MODE === 'record') await record();
else if (MODE === 'compose') await compose();
else console.log('usage: node promo/record-tour.mjs record|compose [--lang ja|en]');
