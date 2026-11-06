import { describe, expect, it } from 'vitest';
import {
	MARGIN,
	PADDING,
	PAGE_WIDTH,
	SIZE,
	layoutPractice,
	measure,
	practiceContent,
} from '../../src/lib/practice-content';
import { buildPdfSource, type RectOp } from '../../src/lib/practice-pdf';

/** 改行と表示できる ASCII だけか */
function isPrintableAscii(text: string): boolean {
	return [...text].every((c) => c === '\n' || (c >= ' ' && c <= '~'));
}

describe.each([
	['日本語', true],
	['英語', false],
])('練習用の PDF（%s）', (_, japanese) => {
	const content = practiceContent(japanese);
	const { ops, size } = layoutPractice(content);

	it('幅の狭い 1 ページ。高さは中身に合わせる', () => {
		expect(size.width).toBe(PAGE_WIDTH);
		expect(size.height).toBeGreaterThan(200);
		expect(size.height).toBeLessThan(320);
	});

	it('どの要素もページの中（余白の内側）に収まる', () => {
		for (const op of ops) {
			if (op.type === 'text') {
				expect(op.y, op.text).toBeGreaterThanOrEqual(MARGIN);
				expect(op.y, op.text).toBeLessThanOrEqual(size.height - MARGIN);
				expect(
					op.x + measure(content.script, op.text, op.size, op.bold),
					op.text,
				).toBeLessThanOrEqual(PAGE_WIDTH - MARGIN);
			} else if (op.type === 'rect') {
				expect(op.y).toBeGreaterThanOrEqual(MARGIN - 0.01);
				expect(op.y + op.height).toBeLessThanOrEqual(
					size.height - MARGIN + 0.01,
				);
			}
		}
	});

	it('なぞる文は枠の中に 1 行で収まる', () => {
		const box = ops.find(
			(op): op is RectOp => op.type === 'rect' && op.stroke !== undefined,
		);
		expect(box).toBeDefined();
		if (!box) return;
		const target = ops.find(
			(op) => op.type === 'text' && op.text === content.target,
		);
		expect(target?.type).toBe('text');
		if (target?.type !== 'text') return;
		expect(target.y).toBeGreaterThan(box.y);
		expect(target.y).toBeLessThan(box.y + box.height);
		expect(
			target.x + measure(content.script, target.text, target.size),
		).toBeLessThanOrEqual(box.x + box.width - PADDING);
	});

	it('半分の幅（323px）に縮めても、なぞる文は 14px 以上', () => {
		expect((SIZE.target * 323) / PAGE_WIDTH).toBeGreaterThanOrEqual(14);
	});

	it('PDF にすると中身は ASCII だけで、ページの大きさが入る', () => {
		const source = buildPdfSource(
			[ops],
			content.script,
			content.title,
			size,
		);
		expect(isPrintableAscii(source)).toBe(true);
		expect(source).toContain(
			`/MediaBox [0 0 ${size.width} ${size.height}]`,
		);
	});

	it('「色を選ぶ」とは書かない（既定はなぞるとすぐ塗る）', () => {
		const all = [content.title, content.lead, content.target].join(' ');
		expect(all).not.toMatch(/色を選|pick a color/i);
	});
});

describe('practiceContent', () => {
	it('日本語と英語でファイル名が違う', () => {
		expect(practiceContent(true).fileName).toBe('PDF Simple 練習');
		expect(practiceContent(false).fileName).toBe('PDF Simple practice');
	});
});
