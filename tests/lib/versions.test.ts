import { describe, expect, it } from 'vitest';
import { compareVersions, versionsToAnnounce } from '../../src/lib/versions';

describe('compareVersions', () => {
	it('数字として比べる（文字列の順ではない）', () => {
		expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
		expect(compareVersions('0.1.1', '0.2.0')).toBeLessThan(0);
		expect(compareVersions('1.0', '1.0.0')).toBe(0);
	});
});

describe('versionsToAnnounce', () => {
	const notes = ['0.2.0', '0.3.0'];

	it('前の版より新しく、今の版以下のものを、新しい順に', () => {
		expect(versionsToAnnounce(notes, '0.1.1', '0.3.0')).toEqual([
			'0.3.0',
			'0.2.0',
		]);
		expect(versionsToAnnounce(notes, '0.2.0', '0.3.1')).toEqual(['0.3.0']);
	});

	it('前の版を覚えていない（0.1.x 以前から上げた）なら、今の版までのすべて', () => {
		expect(versionsToAnnounce(notes, '', '0.2.0')).toEqual(['0.2.0']);
	});

	it('同じ版・まだ出していない版の知らせは見せない', () => {
		expect(versionsToAnnounce(notes, '0.2.0', '0.2.0')).toEqual([]);
		expect(versionsToAnnounce(notes, '0.1.1', '0.1.2')).toEqual([]);
	});
});
