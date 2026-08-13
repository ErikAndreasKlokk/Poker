import { describe, expect, it } from 'vitest';
import { paginate } from './pagination';

describe('paginate', () => {
	it('puts the first page at the start of the list', () => {
		const page = paginate('1', 100, 25);
		expect(page).toMatchObject({ number: 1, offset: 0, limit: 25, hasPrevious: false });
	});

	it('offsets by whole pages', () => {
		expect(paginate('3', 100, 25).offset).toBe(50);
	});

	it('counts a partial last page', () => {
		expect(paginate('1', 26, 25).pageCount).toBe(2);
	});

	it('keeps one page when there is nothing to show', () => {
		const page = paginate('1', 0, 25);
		expect(page.pageCount).toBe(1);
		expect(page.hasNext).toBe(false);
	});

	it('clamps a page past the end back to the last one', () => {
		expect(paginate('99', 30, 25).number).toBe(2);
	});

	it('clamps zero and negatives to the first page', () => {
		expect(paginate('0', 100, 25).number).toBe(1);
		expect(paginate('-4', 100, 25).number).toBe(1);
	});

	it('falls back to the first page for anything that is not a number', () => {
		for (const raw of [undefined, null, '', 'two', {}, NaN]) {
			expect(paginate(raw, 100, 25).number).toBe(1);
		}
	});

	it('ignores a fractional page rather than offsetting by part of one', () => {
		expect(paginate('2.7', 100, 25)).toMatchObject({ number: 2, offset: 25 });
	});

	it('knows when it is in the middle', () => {
		expect(paginate('2', 100, 25)).toMatchObject({ hasPrevious: true, hasNext: true });
	});

	it('knows when it is at the end', () => {
		expect(paginate('4', 100, 25)).toMatchObject({ hasPrevious: true, hasNext: false });
	});

	it('never offsets past a shrinking list', () => {
		// Someone on page 4 when rows are deleted must not get an empty page.
		const page = paginate('4', 26, 25);
		expect(page.number).toBe(2);
		expect(page.offset).toBeLessThan(26);
	});
});
