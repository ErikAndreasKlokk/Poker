import { describe, expect, it } from 'vitest';
import { breakdown, denominationsFor, drawablePile } from './chips';

describe('denominationsFor', () => {
	it('sizes the top chip so a full stack is roughly eight of them', () => {
		const denominations = denominationsFor(1000, 10);
		expect(denominations[0]).toBe(100);
		expect(1000 / denominations[0]).toBeLessThanOrEqual(12);
		expect(1000 / denominations[0]).toBeGreaterThanOrEqual(5);
	});

	it('returns denominations highest first', () => {
		const denominations = denominationsFor(1000, 10);
		expect(denominations).toEqual([...denominations].sort((a, b) => b - a));
	});

	it('never goes below the small blind', () => {
		for (const [stack, blind] of [
			[1000, 10],
			[20000, 100],
			[500, 25]
		]) {
			const denominations = denominationsFor(stack, blind);
			expect(Math.min(...denominations)).toBeGreaterThanOrEqual(blind);
		}
	});

	it('keeps the palette to at most four colours', () => {
		expect(denominationsFor(1_000_000, 1).length).toBeLessThanOrEqual(4);
	});

	it('adapts to a deep-stacked game', () => {
		// 200 big blinds deep: the top chip should scale up, not stay at 100.
		const denominations = denominationsFor(20_000, 50);
		expect(denominations[0]).toBeGreaterThan(1000);
	});

	it('copes with a stack smaller than the blind', () => {
		expect(denominationsFor(5, 50)).toEqual([50]);
	});
});

describe('breakdown', () => {
	const denominations = denominationsFor(1000, 10); // [100, 50, 20, 10]

	it('renders a full starting stack as chips of the top colour', () => {
		expect(breakdown(1000, denominations)).toEqual([{ value: 100, count: 10, tier: 3 }]);
	});

	it('mixes denominations for an awkward amount', () => {
		// 60 is one 50 and one 10.
		// Tier 0 is the cheapest colour in play, tier 3 the dearest.
		expect(breakdown(60, denominations)).toEqual([
			{ value: 50, count: 1, tier: 2 },
			{ value: 10, count: 1, tier: 0 }
		]);
	});

	it('accounts for every chip it is given', () => {
		for (const amount of [10, 30, 60, 170, 999, 1000, 2340]) {
			const total = breakdown(amount, denominations).reduce(
				(sum, column) => sum + column.value * column.count,
				0
			);
			// Greedy decomposition is exact whenever the amount is a multiple of
			// the smallest chip, which every wager is.
			if (amount % 10 === 0) expect(total).toBe(amount);
		}
	});

	it('never draws an empty pile for money that exists', () => {
		// Below the smallest chip, but the pot is not empty.
		expect(breakdown(3, denominations)).toHaveLength(1);
	});

	it('draws nothing for nothing', () => {
		expect(breakdown(0, denominations)).toEqual([]);
		expect(breakdown(-50, denominations)).toEqual([]);
	});

	it('orders columns from most to least valuable', () => {
		const columns = breakdown(1370, denominations);
		const values = columns.map((column) => column.value);
		expect(values).toEqual([...values].sort((a, b) => b - a));
	});
});

describe('drawablePile', () => {
	const columns = [
		{ value: 100, count: 10, tier: 3 },
		{ value: 50, count: 1, tier: 2 },
		{ value: 20, count: 2, tier: 1 }
	];

	it('keeps every colour rather than spending the budget on the top one', () => {
		const drawn = drawablePile(columns, 4);
		expect(drawn).toHaveLength(3);
		expect(drawn.map((column) => column.drawn)).toEqual([4, 1, 2]);
	});

	it('preserves the true count alongside what it draws', () => {
		const [top] = drawablePile(columns, 4);
		expect(top.count).toBe(10);
		expect(top.drawn).toBe(4);
	});

	it('leaves a short pile untouched', () => {
		expect(drawablePile(columns, 20).map((c) => c.drawn)).toEqual([10, 1, 2]);
	});

	it('always draws at least one chip per column it keeps', () => {
		expect(drawablePile(columns, 0).every((column) => column.drawn === 1)).toBe(true);
	});
});
