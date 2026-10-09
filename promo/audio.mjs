// PDF Simple のプロモーション動画の音（BGM と効果音）を合成して WAV に書く。
// 外部の音源は使わない（和音・アルペジオ・ベース・ドラム・効果音は、すべてここで計算して作る）。
// 時刻は promo/index.html の window.__timeline（ハイライト・クリック・字幕・音の合図）から受け取る。
//
//   render.mjs から呼ぶ（synthesize(timeline, wavPath)）
//   単体: node promo/audio.mjs promo/out/timeline.json promo/out/audio.wav
import { readFileSync, writeFileSync } from 'node:fs';

const SR = 44100;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const mix = (a, b, p) => a + (b - a) * p;
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function synthesize(timeline, wavPath) {
	const N = Math.ceil(timeline.DURATION * SR);
	const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
	const music = bus(); // 和音・アルペジオ・ベース（キックに合わせて少し下げる）
	const drums = bus();
	const sfx = bus();
	const send = bus(); // 残響へ送る
	let seed = 20261009;
	const rand = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const panGains = (p) => {
		const a = ((clamp(p, -1, 1) + 1) * Math.PI) / 4;
		return [Math.cos(a), Math.sin(a)];
	};
	const put = (b, i, l, r) => {
		if (i >= 0 && i < N) {
			b.L[i] += l;
			b.R[i] += r;
		}
	};

	/* ---------- 音のもと ---------- */
	const WAVE = {
		sine: (ph) => Math.sin(ph),
		organ: (ph) => (Math.sin(ph) + 0.35 * Math.sin(2 * ph) + 0.12 * Math.sin(3 * ph) + 0.05 * Math.sin(4 * ph)) / 1.4,
		pluck: (ph, tt) => (2 / Math.PI) * Math.asin(Math.sin(ph)) * 0.85 + 0.3 * Math.sin(2 * ph) * Math.exp(-tt * 22),
		marimba: (ph, tt) => Math.sin(ph) + 0.25 * Math.sin(4 * ph) * Math.exp(-tt * 18) + 0.06 * Math.sin(9.8 * ph) * Math.exp(-tt * 40),
		bell: (ph, tt) => (Math.sin(ph) + 0.5 * Math.sin(2.76 * ph) * Math.exp(-tt * 6) + 0.22 * Math.sin(5.4 * ph) * Math.exp(-tt * 13)) / 1.3,
		bass: (ph) => Math.sin(ph) + 0.22 * Math.sin(2 * ph),
	};
	/** 音程のある音（attack で立ち上がり、decay があれば減衰、dur のあと release で消える） */
	function tone(b, { t, dur, f, fEnd = null, amp = 0.2, type = 'sine', attack = 0.005, decay = null, release = 0.05, pan = 0, sendAmt = 0, cents = 0 }) {
		const start = Math.round(t * SR);
		const len = Math.round((dur + release) * SR);
		const [gl, gr] = panGains(pan);
		const wave = WAVE[type];
		const base = f * Math.pow(2, cents / 1200);
		let ph = rand() * Math.PI * 2;
		for (let k = 0; k < len; k++) {
			const i = start + k;
			if (i >= N) break;
			const tt = k / SR;
			const freq = fEnd ? base * Math.pow(fEnd / f, Math.min(1, tt / dur)) : base;
			ph += (2 * Math.PI * freq) / SR;
			if (i < 0) continue;
			let env = tt < attack ? tt / attack : decay ? Math.exp(-(tt - attack) / decay) : 1;
			if (tt > dur) env *= Math.max(0, 1 - (tt - dur) / release);
			const v = wave(ph, tt) * env * amp;
			b.L[i] += v * gl;
			b.R[i] += v * gr;
			if (sendAmt) {
				send.L[i] += v * gl * sendAmt;
				send.R[i] += v * gr * sendAmt;
			}
		}
	}
	/** RBJ の双二次フィルタの係数 */
	function biquad(type, f, q) {
		const w = (2 * Math.PI * clamp(f, 20, SR * 0.45)) / SR;
		const cos = Math.cos(w);
		const alpha = Math.sin(w) / (2 * q);
		let b0, b1, b2;
		if (type === 'lp') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
		else if (type === 'hp') [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
		else [b0, b1, b2] = [alpha, 0, -alpha];
		const a0 = 1 + alpha;
		return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
	}
	/** フィルタを通した雑音（f・env・pan は 0〜1 の進み u の関数でもよい。am は揺れ） */
	function noise(b, { t, dur, amp = 0.1, type = 'bp', f = 1000, q = 1, env = null, pan = 0, sendAmt = 0, am = null }) {
		const start = Math.round(t * SR);
		const len = Math.round(dur * SR);
		let x1 = 0, x2 = 0, y1 = 0, y2 = 0, c = null;
		for (let k = 0; k < len; k++) {
			const i = start + k;
			if (i >= N) break;
			const u = k / len;
			if (k % 32 === 0) c = biquad(type, typeof f === 'function' ? f(u) : f, q);
			const x = rand() * 2 - 1;
			const y = c[0] * x + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
			x2 = x1; x1 = x; y2 = y1; y1 = y;
			if (i < 0) continue;
			let e = env ? env(u) : 1;
			if (am) e *= am(u, k / SR);
			const [gl, gr] = panGains(typeof pan === 'function' ? pan(u) : pan);
			const v = y * e * amp;
			b.L[i] += v * gl;
			b.R[i] += v * gr;
			if (sendAmt) {
				send.L[i] += v * gl * sendAmt;
				send.R[i] += v * gr * sendAmt;
			}
		}
	}

	/* ---------- 効果音 ---------- */
	const bell = (u) => Math.pow(Math.sin(Math.PI * u), 1.6);
	const whoosh = (t, dur, { amp = 0.42, f0 = 420, f1 = 2400, f2 = 900, pan0 = 0, pan1 = 0, q = 0.9, sendAmt = 0.28 } = {}) =>
		noise(sfx, { t, dur, amp, q, sendAmt, f: (u) => (u < 0.5 ? f0 * Math.pow(f1 / f0, u * 2) : f1 * Math.pow(f2 / f1, (u - 0.5) * 2)), env: bell, pan: (u) => mix(pan0, pan1, u) });
	const tick = (t, amp = 0.2, pan = 0.1) => {
		tone(sfx, { t, dur: 0.012, f: 2100, amp, attack: 0.0008, decay: 0.012, release: 0.01, pan });
		noise(sfx, { t, dur: 0.018, amp: amp * 0.7, type: 'hp', f: 3500, q: 0.7, env: (u) => Math.exp(-u * 6), pan });
	};
	const pop = (t, amp = 0.2, f = 720, pan = 0.35) => tone(sfx, { t, dur: 0.09, f, fEnd: f * 1.6, amp, attack: 0.002, decay: 0.06, release: 0.03, pan, sendAmt: 0.2 });
	const plink = (t, note, amp = 0.15, pan = -0.35, type = 'marimba') => tone(sfx, { t, dur: 0.6, f: midi(note), amp, type, attack: 0.002, decay: 0.3, release: 0.3, pan, sendAmt: 0.45 });
	const bloop = (t, amp = 0.085, up = true) => tone(sfx, { t, dur: 0.1, f: up ? 480 : 760, fEnd: up ? 760 : 480, amp, attack: 0.006, decay: 0.07, release: 0.04, sendAmt: 0.2 });
	const paperFlip = (t, dur, amp = 0.18) =>
		noise(sfx, { t, dur, amp, q: 0.8, sendAmt: 0.2, f: (u) => 1600 + 1600 * Math.sin(Math.PI * u), env: (u) => Math.pow(Math.sin(Math.PI * u), 1.2), am: (u, tt) => 0.55 + 0.45 * Math.abs(Math.sin(tt * 2 * Math.PI * (22 - 12 * u))) });
	const markerSwish = (t, dur, amp = 0.15) =>
		noise(sfx, { t, dur, amp, q: 2.2, pan: 0.2, f: (u) => 2500 + 3500 * u, env: (u) => Math.min(1, u * 8, (1 - u) * 12), am: (u, tt) => 0.75 + 0.25 * Math.sin(tt * 2 * Math.PI * 38) });
	const keyTick = (t, amp = 0.38) =>
		noise(sfx, { t, dur: 0.022, amp: amp * (0.8 + rand() * 0.4), f: 2600 + rand() * 1800, q: 1.4, env: (u) => Math.exp(-u * 7), pan: -0.15 + rand() * 0.3 });
	const chime = (t, notes, amp = 0.14) => notes.forEach((m, i) => tone(sfx, { t: t + i * 0.1, dur: 0.9, f: midi(m), amp, type: 'bell', attack: 0.003, decay: 0.55, release: 0.45, pan: 0.2, sendAmt: 0.5 }));
	const shutter = (t) => {
		tick(t, 0.16, 0.3);
		tick(t + 0.05, 0.12, 0.3);
		noise(sfx, { t, dur: 0.14, amp: 0.08, type: 'lp', f: 1300, q: 0.7, env: (u) => Math.exp(-u * 5), pan: 0.3 });
	};
	const swell = (t, dur, amp = 0.07) => noise(sfx, { t, dur, amp, type: 'lp', q: 0.7, sendAmt: 0.3, f: (u) => 300 + 3200 * u * u, env: (u) => u * u * Math.min(1, (1 - u) * 10) });
	const lowWhoosh = (t, dur, amp = 0.08) => noise(sfx, { t, dur, amp, type: 'lp', q: 0.8, sendAmt: 0.15, f: (u) => 250 + 800 * Math.sin(Math.PI * u), env: (u) => Math.sin(Math.PI * u) });
	const shimmer = (t, notes, gap = 0.08, amp = 0.05) =>
		notes.forEach((m, i) => tone(sfx, { t: t + i * gap, dur: 0.5, f: midi(m), amp, type: 'bell', attack: 0.004, decay: 0.35, release: 0.45, pan: -0.4 + (0.8 * i) / Math.max(1, notes.length - 1), sendAmt: 0.6 }));
	const selectHiss = (t, dur, amp = 0.055) => noise(sfx, { t, dur, amp, f: (u) => 3500 + 1500 * u, q: 3, pan: 0.35, env: (u) => Math.min(1, u * 6, (1 - u) * 6) });
	const zip = (t, dur, amp = 0.07) => noise(sfx, { t, dur, amp, f: (u) => 800 + 2400 * u, q: 2, pan: 0.35, env: (u) => Math.min(1, u * 5, (1 - u) * 5) });
	const riser = (t, dur, amp = 0.07) =>
		noise(sfx, { t, dur, amp, type: 'hp', q: 0.8, sendAmt: 0.3, f: (u) => 1500 + 7000 * u * u, env: (u) => u * u * Math.min(1, (1 - u) * 14) });
	/** 低い「ドン」（ロゴが出る瞬間など） */
	const impact = (t, amp = 0.24) => {
		tone(sfx, { t, dur: 0.5, f: 92, fEnd: 38, amp, attack: 0.003, decay: 0.28, release: 0.2, sendAmt: 0.35 });
		noise(sfx, { t, dur: 0.35, amp: amp * 0.35, type: 'lp', f: 900, q: 0.7, env: (u) => Math.exp(-u * 7), sendAmt: 0.4 });
	};

	// ハイライト: なぞる → 塗る → 飛ぶ → 着地（着地の音は着地するたびに上がっていく）
	const LAND_NOTES = [72, 74, 76, 79, 81, 84, 86, 88];
	const hls = Object.values(timeline.HL).sort((a, b) => a.fly[1] - b.fly[1]);
	hls.forEach((h, i) => {
		const [d0, d1] = h.drag;
		const [f0, f1] = h.fly;
		if (h.kind === 'img') {
			zip(d0, d1 - d0);
			shutter(d1);
		} else {
			selectHiss(d0, d1 - d0);
			pop(d1 + 0.01);
		}
		whoosh(f0, f1 - f0, { pan0: 0.55, pan1: -0.45 });
		plink(f1, LAND_NOTES[i % LAND_NOTES.length], 0.22, -0.35, h.kind === 'h' ? 'bell' : 'marimba');
	});
	for (const t of timeline.CLICKS) tick(t);
	// 字幕が入るとき（説明の入れ替わりは小さく）
	for (const cap of timeline.CAPS) {
		whoosh(cap.t[0] - 0.05, 0.55, { amp: 0.1, f0: 900, f1: 3200, f2: 1500, sendAmt: 0.35 });
		tone(sfx, { t: cap.t[0] + 0.05, dur: 0.6, f: midi(91), amp: 0.03, type: 'bell', attack: 0.004, decay: 0.4, release: 0.4, pan: -0.2, sendAmt: 0.6 });
		cap.subs.slice(1).forEach(([t]) => tick(t, 0.035, -0.2));
	}
	for (const cue of timeline.SFX) {
		const { t, dur = 0.8 } = cue;
		switch (cue.type) {
			case 'swell': swell(t, dur); break;
			case 'flip': paperFlip(t, dur); break;
			case 'logo': impact(t - 0.05); shimmer(t, [84, 88, 91, 96]); break;
			case 'marker': markerSwish(t, dur); pop(t + dur, 0.11, 900, 0.2); break;
			case 'text': tick(t, 0.04, -0.1); break;
			case 'lowWhoosh': lowWhoosh(t, dur); break;
			case 'slide': whoosh(t, dur, { amp: 0.18, f0: 300, f1: 1500, f2: 600, pan0: cue.pan0 ?? 0.6, pan1: cue.pan1 ?? 0.1 }); break;
			case 'pageSwap': whoosh(t, dur, { amp: 0.22, f0: 350, f1: 1800, f2: 700, pan0: 0.5, pan1: -0.3 }); break;
			case 'toggle':
				tick(t, 0.12, 0.2);
				tone(sfx, { t: t + 0.02, dur: 0.05, f: 660, fEnd: 990, amp: 0.09, attack: 0.002, decay: 0.05, release: 0.04, pan: 0.2, sendAmt: 0.2 });
				break;
			case 'select': selectHiss(t, dur); break;
			case 'pop': pop(t); break;
			case 'land': plink(t, cue.note, 0.2, -0.35); break;
			case 'scroll': lowWhoosh(t, dur, 0.035); break;
			case 'zoom': whoosh(t, dur, { amp: 0.14, f0: 250, f1: 1100, f2: 400, sendAmt: 0.1 }); break;
			case 'menu': bloop(t); break;
			case 'menuClose': bloop(t, 0.05, false); break;
			case 'flash': plink(t, cue.note, 0.07, 0.1, 'bell'); break;
			case 'typing':
				for (let i = 0; i < cue.n; i++) keyTick(t + ((i + 1) / cue.n) * (cue.end - t));
				break;
			case 'panel': bloop(t, 0.07); whoosh(t, 0.5, { amp: 0.12, f0: 500, f1: 1800, f2: 800 }); break;
			case 'panelOut': bloop(t, 0.04, false); break;
			case 'chip': pop(t, 0.08, 820, 0.4); break;
			case 'chipFly': whoosh(t, dur, { amp: 0.36, pan0: 0.5, pan1: -0.2 }); plink(t + dur, cue.note, 0.2, -0.2); break;
			case 'move': whoosh(t, dur, { amp: 0.32, pan0: 0.1, pan1: -0.2 }); break;
			case 'click': tick(t, 0.08); break;
			case 'toast': chime(t, [88, 91]); break;
		}
	}

	/* ---------- BGM ---------- */
	const M = timeline.MUSIC;
	const BEAT = 60 / 104;
	const BAR = BEAT * 4;
	const ORIGIN = M.drumsIn - 8 * BAR; // ドラムが入る瞬間（STEP 1）が小節の頭になるように
	const CHORDS = [
		{ root: 41, notes: [53, 57, 60, 64] }, // Fmaj7
		{ root: 43, notes: [55, 59, 62, 64] }, // G6
		{ root: 40, notes: [52, 55, 59, 62] }, // Em7
		{ root: 45, notes: [57, 60, 64, 67] }, // Am7
	];
	const ARP = [0, 1, 2, 3, 1, 2, 3, 2];
	const kicks = [];
	const light = (t) => t >= M.lightFrom && t < M.lightTo;
	for (let b = -1; ; b++) {
		const t0 = ORIGIN + b * BAR;
		if (t0 >= M.outro) break;
		const chord = CHORDS[((b % 4) + 4) % 4];
		const intro = t0 < 8.2;
		// 和音（ゆっくり立ち上がる・左右に広げる）
		const padAmp = intro ? 0.026 : light(t0) ? 0.034 : 0.03;
		for (const n of chord.notes)
			for (const [cents, pan] of [[-6, -0.45], [6, 0.45]])
				tone(music, { t: t0, dur: BAR, f: midi(n), amp: padAmp, type: 'organ', attack: intro ? 1.2 : 0.45, release: 1.1, pan, cents, sendAmt: 0.25 });
		if (t0 + BAR <= 8.2) continue;
		// アルペジオ（8 分音符）とベース
		for (let s = 0; s < 8; s++) {
			const ts = t0 + s * (BEAT / 2);
			if (ts < 8.2 || ts >= M.outro) continue;
			const n = chord.notes[ARP[s]] + 12;
			tone(music, { t: ts, dur: 0.05, f: midi(n), amp: light(ts) ? 0.034 : 0.042, type: 'pluck', attack: 0.002, decay: 0.17, release: 0.25, pan: s % 2 ? 0.3 : -0.3, sendAmt: 0.35 });
		}
		const bassAmp = light(t0) ? 0.075 : 0.105;
		for (const [beat, len] of [[0, 0.95], [2.5, 0.45], [3, 0.9]]) {
			const tb = t0 + beat * BEAT;
			if (tb < 8.2 || tb >= M.outro) continue;
			tone(music, { t: tb, dur: len * BEAT, f: midi(chord.root), amp: bassAmp, type: 'bass', attack: 0.01, release: 0.12 });
		}
		// ドラム（STEP 1 から。設定とファイルの場面は軽く）
		if (t0 < M.drumsIn) continue;
		for (let s = 0; s < 8; s++) {
			const ts = t0 + s * (BEAT / 2);
			if (ts >= M.outro) continue;
			const isLight = light(ts);
			if (s % 4 === 0 && !(isLight && s === 4)) kicks.push(ts);
			if (!isLight || s % 2 === 1)
				noise(drums, { t: ts, dur: 0.05, amp: s % 2 ? 0.032 : 0.02, type: 'hp', f: 8000, q: 0.7, env: (u) => Math.exp(-u * 5), pan: 0.25 });
			if ((s === 2 || s === 6) && ts >= 33.0 && !isLight) {
				for (const d of [0, 0.011, 0.022]) noise(drums, { t: ts + d, dur: 0.012, amp: 0.05, f: 1500, q: 0.9, env: (u) => 1 - u });
				noise(drums, { t: ts + 0.022, dur: 0.17, amp: 0.05, f: 1400, q: 0.8, env: (u) => Math.exp(-u * 6), sendAmt: 0.3 });
			}
			if (ts >= 47.0 && !isLight)
				for (const d of [0, BEAT / 4]) noise(drums, { t: ts + d, dur: 0.06, amp: 0.012, f: 6200, q: 1.2, env: (u) => Math.sin(Math.PI * u), pan: -0.3 });
		}
	}
	for (const t of kicks) {
		const start = Math.round(t * SR);
		let ph = 0;
		for (let k = 0; k < 0.42 * SR; k++) {
			const tt = k / SR;
			ph += (2 * Math.PI * (46 + 110 * Math.exp(-tt * 30))) / SR;
			const v = Math.sin(ph) * Math.exp(-tt * 7.5) * 0.24;
			put(drums, start + k, v, v);
		}
	}
	riser(M.drumsIn - 0.85, 0.85);
	riser(M.lightTo - 0.85, 0.85);
	// 締め: Fmaj7 から Cmaj9 に解決して、ゆっくり消える
	for (const [t0, dur, notes, root] of [[M.outro, 2.3, [53, 57, 60, 64], 41], [M.outro + 2.3, 5.2, [48, 55, 59, 62, 64], 36]]) {
		for (const n of notes)
			for (const [cents, pan] of [[-6, -0.45], [6, 0.45]])
				tone(music, { t: t0, dur, f: midi(n), amp: 0.03, type: 'organ', attack: 0.6, release: 1.8, pan, cents, sendAmt: 0.35 });
		tone(music, { t: t0, dur, f: midi(root), amp: 0.07, type: 'bass', attack: 0.2, release: 1.5 });
	}

	/* ---------- まとめる ---------- */
	// キックに合わせて和音とベースを少し下げる（うねりが出る）
	const duck = new Float32Array(N).fill(1);
	for (const t of kicks) {
		const start = Math.round(t * SR);
		for (let k = 0; k < 0.22 * SR; k++) {
			const i = start + k;
			if (i >= N) break;
			duck[i] = Math.min(duck[i], 1 - 0.32 * Math.exp(-(k / SR) / 0.08));
		}
	}
	const verb = freeverb(send, N);
	const out = bus();
	for (let i = 0; i < N; i++) {
		const t = i / SR;
		const fade = Math.min(1, t / 0.15, (timeline.DURATION - t) / 1.2);
		const m = 0.62;
		out.L[i] = fade * ((music.L[i] * duck[i] + drums.L[i]) * m + sfx.L[i] + verb.L[i]);
		out.R[i] = fade * ((music.R[i] * duck[i] + drums.R[i]) * m + sfx.R[i] + verb.R[i]);
	}
	// 最大値を -1 dBFS に（音の大きさは ffmpeg の loudnorm でそろえる）
	let peak = 0;
	for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out.L[i]), Math.abs(out.R[i]));
	const gain = peak > 0 ? 0.89 / peak : 1;
	writeWav(wavPath, out.L, out.R, gain);
	if (process.env.AUDIO_STEMS) {
		// 確認用: 音のまとまりごとに、同じ倍率で書き出す（音量のつり合いを測る）
		const stem = (name, f) => {
			const L = new Float32Array(N), R = new Float32Array(N);
			for (let i = 0; i < N; i++) [L[i], R[i]] = f(i);
			writeWav(wavPath.replace(/\.wav$/, `-${name}.wav`), L, R, gain);
		};
		const fade = (i) => Math.min(1, i / SR / 0.15, (timeline.DURATION - i / SR) / 1.2);
		stem('music', (i) => [fade(i) * music.L[i] * duck[i] * 0.62, fade(i) * music.R[i] * duck[i] * 0.62]);
		stem('drums', (i) => [fade(i) * drums.L[i] * 0.62, fade(i) * drums.R[i] * 0.62]);
		stem('sfx', (i) => [fade(i) * sfx.L[i], fade(i) * sfx.R[i]]);
		stem('verb', (i) => [fade(i) * verb.L[i], fade(i) * verb.R[i]]);
	}
	return { peak, seconds: N / SR };
}

/** Freeverb（櫛形 8 本 + 全域通過 4 本）。左右で長さを少しずらす */
function freeverb(send, N, { room = 0.84, damp = 0.4, wet = 2.4 } = {}) {
	const combTune = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
	const apTune = [556, 441, 341, 225];
	const out = { L: new Float32Array(N), R: new Float32Array(N) };
	for (const [ch, offset] of [['L', 0], ['R', 23]]) {
		const input = send[ch];
		const o = out[ch];
		const combs = combTune.map((n) => ({ buf: new Float32Array(n + offset), i: 0, store: 0 }));
		const aps = apTune.map((n) => ({ buf: new Float32Array(n + offset), i: 0 }));
		for (let k = 0; k < N; k++) {
			const x = input[k] * 0.015;
			let acc = 0;
			for (const c of combs) {
				const y = c.buf[c.i];
				c.store = y * (1 - damp) + c.store * damp;
				c.buf[c.i] = x + c.store * room;
				if (++c.i >= c.buf.length) c.i = 0;
				acc += y;
			}
			for (const a of aps) {
				const b = a.buf[a.i];
				a.buf[a.i] = acc + b * 0.5;
				if (++a.i >= a.buf.length) a.i = 0;
				acc = b - acc;
			}
			o[k] = acc * wet;
		}
	}
	return out;
}

function writeWav(path, L, R, gain) {
	const n = L.length;
	const buf = Buffer.alloc(44 + n * 4);
	buf.write('RIFF', 0);
	buf.writeUInt32LE(36 + n * 4, 4);
	buf.write('WAVE', 8);
	buf.write('fmt ', 12);
	buf.writeUInt32LE(16, 16);
	buf.writeUInt16LE(1, 20);
	buf.writeUInt16LE(2, 22);
	buf.writeUInt32LE(SR, 24);
	buf.writeUInt32LE(SR * 4, 28);
	buf.writeUInt16LE(4, 32);
	buf.writeUInt16LE(16, 34);
	buf.write('data', 36);
	buf.writeUInt32LE(n * 4, 40);
	for (let i = 0; i < n; i++) {
		buf.writeInt16LE(Math.round(clamp(L[i] * gain, -1, 1) * 32767), 44 + i * 4);
		buf.writeInt16LE(Math.round(clamp(R[i] * gain, -1, 1) * 32767), 46 + i * 4);
	}
	writeFileSync(path, buf);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
	const [timelinePath, wavPath] = process.argv.slice(2);
	const result = synthesize(JSON.parse(readFileSync(timelinePath, 'utf8')), wavPath);
	console.log(`wrote ${wavPath} (${result.seconds.toFixed(1)}s)`);
}
