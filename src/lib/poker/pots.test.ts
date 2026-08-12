import { describe, expect, it } from 'vitest';
import { awardPots, buildPots, seatOrderFrom } from './pots';

const noFolds = new Set<number>();

describe('buildPots', () => {
	it('makes a single pot when everyone committed the same', () => {
		const pots = buildPots(
			new Map([
				[0, 100],
				[1, 100],
				[2, 100]
			]),
			noFolds
		);

		expect(pots).toEqual([{ amount: 300, eligibleSeats: [0, 1, 2] }]);
	});

	it('builds a main pot and side pots for three unequal all-ins', () => {
		const pots = buildPots(
			new Map([
				[0, 100],
				[1, 200],
				[2, 300]
			]),
			noFolds
		);

		expect(pots).toEqual([
			{ amount: 300, eligibleSeats: [0, 1, 2] },
			{ amount: 200, eligibleSeats: [1, 2] },
			{ amount: 100, eligibleSeats: [2] }
		]);
	});

	it('keeps folded chips in the pot but drops the folder from eligibility', () => {
		const pots = buildPots(
			new Map([
				[0, 50],
				[1, 200],
				[2, 200]
			]),
			new Set([0])
		);

		// Both layers have the same eligible seats, so they merge into one pot.
		expect(pots).toEqual([{ amount: 450, eligibleSeats: [1, 2] }]);
	});

	it('conserves every chip across a messy multi-way pot', () => {
		const contributions = new Map([
			[0, 35],
			[1, 120],
			[2, 120],
			[3, 7],
			[4, 500]
		]);
		const pots = buildPots(contributions, new Set([3, 1]));

		const committed = [...contributions.values()].reduce((a, b) => a + b, 0);
		const potted = pots.reduce((sum, pot) => sum + pot.amount, 0);
		expect(potted).toBe(committed);
	});

	it('isolates an uncalled bet so it returns to the only eligible seat', () => {
		const pots = buildPots(
			new Map([
				[0, 100],
				[1, 400]
			]),
			noFolds
		);

		expect(pots[pots.length - 1]).toEqual({ amount: 300, eligibleSeats: [1] });
	});

	it('ignores seats that committed nothing', () => {
		const pots = buildPots(
			new Map([
				[0, 0],
				[1, 50],
				[2, 50]
			]),
			noFolds
		);

		expect(pots).toEqual([{ amount: 100, eligibleSeats: [1, 2] }]);
	});
});

describe('seatOrderFrom', () => {
	it('starts with the first seat left of the button', () => {
		expect(seatOrderFrom(1, [0, 3, 5])).toEqual([3, 5, 0]);
	});

	it('wraps around when the button is the highest seat', () => {
		expect(seatOrderFrom(5, [0, 3, 5])).toEqual([0, 3, 5]);
	});
});

describe('awardPots', () => {
	it('gives the whole pot to the best hand', () => {
		const pots = [{ amount: 300, eligibleSeats: [0, 1, 2] }];
		const ranks = new Map([
			[0, 500],
			[1, 12],
			[2, 3000]
		]);

		const { payouts } = awardPots(pots, ranks, [0, 1, 2]);
		expect(payouts).toEqual(new Map([[1, 300]]));
	});

	it('lets a short all-in win the main pot while a deeper seat takes the side pot', () => {
		const pots = [
			{ amount: 300, eligibleSeats: [0, 1, 2] },
			{ amount: 200, eligibleSeats: [1, 2] }
		];
		// Seat 0 has the best hand overall but is only eligible for the main pot.
		const ranks = new Map([
			[0, 10],
			[1, 50],
			[2, 900]
		]);

		const { payouts } = awardPots(pots, ranks, [0, 1, 2]);
		expect(payouts).toEqual(
			new Map([
				[0, 300],
				[1, 200]
			])
		);
	});

	it('splits a tied pot evenly', () => {
		const pots = [{ amount: 300, eligibleSeats: [0, 1] }];
		const ranks = new Map([
			[0, 42],
			[1, 42]
		]);

		const { payouts } = awardPots(pots, ranks, [0, 1]);
		expect(payouts).toEqual(
			new Map([
				[0, 150],
				[1, 150]
			])
		);
	});

	it('gives odd chips to the winner closest to the button’s left', () => {
		const pots = [{ amount: 101, eligibleSeats: [3, 5] }];
		const ranks = new Map([
			[3, 42],
			[5, 42]
		]);

		// Button on seat 1, so seat 3 acts first and collects the odd chip.
		const { payouts } = awardPots(pots, ranks, seatOrderFrom(1, [0, 3, 5]));
		expect(payouts).toEqual(
			new Map([
				[3, 51],
				[5, 50]
			])
		);
	});

	it('distributes multiple odd chips one at a time', () => {
		const pots = [{ amount: 302, eligibleSeats: [0, 1, 2] }];
		const ranks = new Map([
			[0, 7],
			[1, 7],
			[2, 7]
		]);

		const { payouts } = awardPots(pots, ranks, [0, 1, 2]);
		expect(payouts).toEqual(
			new Map([
				[0, 101],
				[1, 101],
				[2, 100]
			])
		);
	});

	it('never creates or destroys chips', () => {
		const pots = [
			{ amount: 301, eligibleSeats: [0, 1, 2] },
			{ amount: 200, eligibleSeats: [1, 2] },
			{ amount: 99, eligibleSeats: [2] }
		];
		const ranks = new Map([
			[0, 7],
			[1, 7],
			[2, 7]
		]);

		const { payouts } = awardPots(pots, ranks, [0, 1, 2]);
		const paid = [...payouts.values()].reduce((a, b) => a + b, 0);
		expect(paid).toBe(600);
	});
});
