// 隔離した Obsidian（専用のユーザーデータ・dev-vault だけ）を起動し、Chrome DevTools Protocol で操作する。
// UI の動作確認を自動で行うための開発用ツール（macOS 前提）。
//
//   npm run e2e -- launch                 起動（既に起動していれば何もしない）
//   npm run e2e -- eval '<js>'            Obsidian のウィンドウで JS を実行（await 可・return した値を JSON で表示）
//   npm run e2e -- click '<selector>' [right]  その要素を本物のマウス操作で押す（メニューを開く確認など）
//   npm run e2e -- drag '<selector>' <dy>      その要素をつかんで縦に dy ピクセル動かして離す（並べ替えの確認）
//   npm run e2e -- shot <file.png>        スクリーンショット
//   npm run e2e -- quit                   隔離インスタンスだけを終了
//
// 安全のための決めごと:
// - ユーザーデータは OS の一時フォルダ（E2E_PROFILE で変更可）。本番の
//   ~/Library/Application Support/obsidian には書き込まない（自動更新で入った本体 asar を読み取ってコピーするだけ）
// - 開く Vault は dev-vault（または E2E_VAULT で指定したコピー）だけ。本番 Vault は登録しない
// - 終了は、このプロファイルで起動したプロセスだけを対象にする
// - 裏に隠れたウィンドウでもタイマーを間引かないフラグを付ける（待機が止まらないように）
//
// eval では次の補助関数が使える: sleep(ms), btn(text, root?), click(text, root?), modalText(), viewText(), noticeText()
// 初回は Vault の「作成者を信頼」ダイアログが出るので eval で押す（README の例を参照）。
import { execSync, spawn } from 'node:child_process';
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const APP = '/Applications/Obsidian.app/Contents/MacOS/Obsidian';
const PLUGIN_ID = JSON.parse(readFileSync('manifest.json', 'utf8')).id;
// プロファイルとポートはプラグインごとに分ける（Fitness Log のハーネスは fitness-log-e2e-profile と 9333。同時に動かせる）
const PROFILE = process.env.E2E_PROFILE ?? path.join(os.tmpdir(), `${PLUGIN_ID}-e2e-profile`);
// dev-vault をユーザーが Obsidian で開いているときは、コピーした Vault を E2E_VAULT で指定する
// （同じ Vault を 2 つのアプリで開くと data.json や workspace.json を取り合う）
const VAULT = path.resolve(process.env.E2E_VAULT ?? 'dev-vault');
const PORT = Number(process.env.E2E_PORT ?? 9334);
const REAL_PROFILE = path.join(os.homedir(), 'Library/Application Support/obsidian');

const PRELUDE = `
	window.__errs = window.__errs || [];
	if (!window.__errHooked) {
		window.__errHooked = true;
		const original = console.error;
		console.error = (...a) => { window.__errs.push(a.map((x) => (x && x.stack) || String(x)).join(' ')); original(...a); };
		window.addEventListener('error', (e) => window.__errs.push('onerror: ' + e.message));
		window.addEventListener('unhandledrejection', (e) => window.__errs.push('unhandled: ' + ((e.reason && e.reason.stack) || e.reason)));
	}
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const btn = (text, root = document) => [...root.querySelectorAll('button')].find((b) => b.innerText.trim() === text || b.getAttribute('aria-label') === text);
	const click = async (text, root) => { const b = btn(text, root); if (!b) throw new Error('no button: ' + text); b.click(); await sleep(300); };
	const modalText = () => [...document.querySelectorAll('.modal-container')].map((m) => m.innerText);
	const viewText = () => document.querySelector('.workspace-leaf.mod-active .view-content')?.innerText;
	const noticeText = () => [...document.querySelectorAll('.notice')].map((n) => n.innerText);
`;

async function targets() {
	const res = await fetch(`http://127.0.0.1:${PORT}/json`);
	return res.json();
}

async function alive() {
	try {
		await targets();
		return true;
	} catch {
		return false;
	}
}

async function launch() {
	if (await alive()) return console.log('already running');
	if (!existsSync(APP)) throw new Error(`Obsidian が見つかりません: ${APP}`);
	mkdirSync(PROFILE, { recursive: true });
	if (existsSync(REAL_PROFILE))
		for (const f of readdirSync(REAL_PROFILE))
			if (/^obsidian-[\d.]+\.asar$/.test(f) && !existsSync(path.join(PROFILE, f)))
				copyFileSync(path.join(REAL_PROFILE, f), path.join(PROFILE, f));
	writeFileSync(
		path.join(PROFILE, 'obsidian.json'),
		JSON.stringify({ vaults: { devvault: { path: VAULT, ts: Date.now(), open: true } } }),
	);
	const child = spawn(
		APP,
		[
			`--user-data-dir=${PROFILE}`,
			`--remote-debugging-port=${PORT}`,
			'--disable-background-timer-throttling',
			'--disable-renderer-backgrounding',
			'--disable-backgrounding-occluded-windows',
		],
		{ detached: true, stdio: 'ignore' },
	);
	child.unref();
	for (let i = 0; i < 60; i++) {
		await new Promise((r) => setTimeout(r, 500));
		if (await alive()) return console.log(`launched (pid ${child.pid}, profile ${PROFILE})`);
	}
	throw new Error('DevTools のポートに接続できませんでした');
}

/** E2E_TARGET=<タイトルの一部> で別ウィンドウ（1.14 の設定ウィンドウ等）を選べる */
async function pageTarget() {
	const want = process.env.E2E_TARGET;
	for (let i = 0; i < 40; i++) {
		const page = (await targets()).find((t) =>
			t.type === 'page' && (want ? t.title.includes(want) : t.url.startsWith('app://obsidian.md/index.html')),
		);
		if (page) return page;
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error('Obsidian のウィンドウが見つかりません');
}

async function session(fn) {
	const target = await pageTarget();
	const ws = new WebSocket(target.webSocketDebuggerUrl);
	await new Promise((resolve, reject) => {
		ws.onopen = resolve;
		ws.onerror = reject;
	});
	let id = 0;
	const pending = new Map();
	ws.onmessage = (event) => {
		const message = JSON.parse(event.data);
		if (message.id && pending.has(message.id)) {
			pending.get(message.id)(message);
			pending.delete(message.id);
		}
	};
	const send = (method, params = {}) =>
		new Promise((resolve) => {
			const mid = ++id;
			pending.set(mid, resolve);
			ws.send(JSON.stringify({ id: mid, method, params }));
		});
	try {
		return await fn(send);
	} finally {
		ws.close();
	}
}

async function evaluate(code) {
	return session(async (send) => {
		// ウィンドウが裏にあっても focus / blur が起きるようにする（入力欄の確定を試すため。この接続の間だけ有効）
		await send('Emulation.setFocusEmulationEnabled', { enabled: true });
		const response = await send('Runtime.evaluate', {
			expression: `(async () => { ${PRELUDE}\n${code} })()`,
			awaitPromise: true,
			returnByValue: true,
		});
		const details = response.result?.exceptionDetails;
		if (details) return { error: details.exception?.description ?? details.text };
		return response.result?.result?.value;
	});
}

async function screenshot(file) {
	return session(async (send) => {
		const response = await send('Page.captureScreenshot', { format: 'png' });
		writeFileSync(file, Buffer.from(response.result.data, 'base64'));
		return file;
	});
}

/**
 * 本物のマウス操作（CDP の Input.dispatchMouseEvent）で、CSS セレクタに合う要素の中央を押す。
 * JS の el.click() では開かないもの（Obsidian のメニュー等）を確かめるのに使う。
 * button は 'left'（既定）か 'right'（右クリック＝コンテキストメニュー）
 */
async function realClick(selector, button = 'left') {
	return session(async (send) => {
		await send('Emulation.setFocusEmulationEnabled', { enabled: true });
		const response = await send('Runtime.evaluate', {
			expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
			returnByValue: true,
		});
		const point = response.result?.result?.value;
		if (!point) return `not found: ${selector}`;
		for (const type of ['mousePressed', 'mouseReleased'])
			await send('Input.dispatchMouseEvent', { type, x: point.x, y: point.y, button, clickCount: 1 });
		// 開いたメニューは、この接続を閉じる（＝フォーカスの模擬が切れる）と閉じることがあるので、ここで読む
		await new Promise((r) => setTimeout(r, 300));
		const menu = await send('Runtime.evaluate', {
			expression: `[...document.querySelectorAll('.menu .menu-item')].map((i) => i.textContent)`,
			returnByValue: true,
		});
		const items = menu.result?.result?.value ?? [];
		return `clicked ${selector} at ${Math.round(point.x)},${Math.round(point.y)}${items.length ? ` / menu: ${items.join(', ')}` : ''}`;
	});
}

/** 本物のマウス操作で、要素の中央を押して dy ピクセル縦に動かして離す（並べ替えのドラッグの確認） */
async function realDrag(selector, dy) {
	return session(async (send) => {
		await send('Emulation.setFocusEmulationEnabled', { enabled: true });
		const response = await send('Runtime.evaluate', {
			expression: `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`,
			returnByValue: true,
		});
		const point = response.result?.result?.value;
		if (!point) return `not found: ${selector}`;
		const mouse = (type, y, buttons) =>
			send('Input.dispatchMouseEvent', { type, x: point.x, y, button: 'left', buttons, clickCount: 1 });
		await mouse('mousePressed', point.y, 1);
		const steps = 12;
		for (let i = 1; i <= steps; i++) {
			await mouse('mouseMoved', point.y + (dy * i) / steps, 1);
			await new Promise((r) => setTimeout(r, 30));
		}
		await mouse('mouseReleased', point.y + dy, 0);
		return `dragged ${selector} by ${dy}px`;
	});
}

const MODIFIERS = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

/** 'alt' / 'meta+shift' などを CDP の修飾キーのビットに */
function modifierBits(names = '') {
	return names.split('+').reduce((bits, name) => bits | (MODIFIERS[name] ?? 0), 0);
}

/** 本物のマウス操作で、座標 (x, y) を count 回続けて押す（2 ならダブルクリック）。mods は 'alt' など */
async function clickXY(x, y, count = 1, mods = '') {
	return session(async (send) => {
		await send('Emulation.setFocusEmulationEnabled', { enabled: true });
		const modifiers = modifierBits(mods);
		await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
		for (let i = 1; i <= count; i++) {
			await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: i, modifiers });
			await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: i, modifiers });
			await new Promise((r) => setTimeout(r, 60));
		}
		return `clicked ${x},${y} x${count}${mods ? ` with ${mods}` : ''}`;
	});
}

/** 本物のマウス操作で、(x1, y1) から (x2, y2) までドラッグする（文字の選択・四角の取り込みの確認） */
async function dragXY(x1, y1, x2, y2, mods = '') {
	return session(async (send) => {
		await send('Emulation.setFocusEmulationEnabled', { enabled: true });
		const modifiers = modifierBits(mods);
		const mouse = (type, x, y, buttons) =>
			send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1, modifiers });
		await mouse('mouseMoved', x1, y1, 0);
		await mouse('mousePressed', x1, y1, 1);
		const steps = 16;
		for (let i = 1; i <= steps; i++) {
			await mouse('mouseMoved', x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, 1);
			await new Promise((r) => setTimeout(r, 20));
		}
		await mouse('mouseReleased', x2, y2, 0);
		return `dragged ${x1},${y1} -> ${x2},${y2}${mods ? ` with ${mods}` : ''}`;
	});
}

function quit() {
	const pids = execSync(`pgrep -f "MacOS/Obsidian --user-data-dir=${PROFILE}" || true`).toString().trim();
	if (pids) execSync(`kill ${pids.split('\n').join(' ')}`);
	console.log(pids ? `killed ${pids.replace(/\n/g, ' ')}` : 'not running');
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'launch') await launch();
else if (command === 'eval') console.log(JSON.stringify(await evaluate(rest.join(' ')), null, 1));
else if (command === 'shot') console.log(await screenshot(rest[0] ?? 'e2e-shot.png'));
else if (command === 'click') console.log(await realClick(rest[0] ?? 'body', rest[1]));
else if (command === 'drag') console.log(await realDrag(rest[0] ?? 'body', Number(rest[1] ?? 0)));
else if (command === 'clickxy') console.log(await clickXY(Number(rest[0]), Number(rest[1]), Number(rest[2] ?? 1), rest[3]));
else if (command === 'dragxy') console.log(await dragXY(Number(rest[0]), Number(rest[1]), Number(rest[2]), Number(rest[3]), rest[4]));
else if (command === 'quit') quit();
else console.log('usage: npm run e2e -- launch | eval <js> | click <selector> [right] | drag <selector> <dy> | clickxy <x> <y> [count] [alt|meta|shift] | dragxy <x1> <y1> <x2> <y2> [mods] | shot <file> | quit');
