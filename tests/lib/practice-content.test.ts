import { describe, expect, it } from 'vitest';
import {
	MARGIN,
	layoutPractice,
	practiceContent,
	textWidth,
} from '../../src/lib/practice-content';
import { PAGE_WIDTH, buildPdfSource } from '../../src/lib/practice-pdf';

/** 改行と表示できる ASCII だけか */
function isPrintableAscii(text: string): boolean {
	return [...text].every((c) => c === '\n' || (c >= ' ' && c <= '~'));
}

describe.each([
	['日本語', true],
	['英語', false],
])('練習用の PDF（%s）', (_, japanese) => {
	const content = practiceContent(japanese);
	const { ops, bottom } = layoutPractice(content);

	it('1 ページに収まる（下の余白より上で終わる）', () => {
		expect(bottom).toBeGreaterThanOrEqual(MARGIN);
	});

	it('どの行も右の余白からはみ出さない', () => {
		for (const op of ops) {
			if (op.type !== 'text') continue;
			expect(
				op.x + textWidth(content.script, op.text, op.size),
				op.text,
			).toBeLessThanOrEqual(PAGE_WIDTH - MARGIN);
		}
	});

	it('なぞる文は枠の中に置く', () => {
		const boxes = ops.filter((op) => op.type === 'rect');
		expect(boxes).toHaveLength(2);
		for (const box of boxes) {
			const inside = ops.find(
				(op) =>
					op.type === 'text' &&
					op.y > box.y &&
					op.y < box.y + box.height &&
					op.x > box.x,
			);
			expect(inside).toBeDefined();
		}
	});

	it('PDF にすると中身は ASCII だけ', () => {
		const source = buildPdfSource([ops], content.script, content.title);
		expect(isPrintableAscii(source)).toBe(true);
	});
});

describe('practiceContent', () => {
	it('日本語と英語でファイル名が違う', () => {
		expect(practiceContent(true).fileName).toBe('PDF Simple 練習');
		expect(practiceContent(false).fileName).toBe('PDF Simple practice');
	});
});
