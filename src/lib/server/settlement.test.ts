import { describe, expect, it } from 'vitest';
import { formatOre } from '../money';
import {
	boksFeeOre,
	chipsToOre,
	computeSettlement,
	distributePool,
	type LedgerRow
} from './settlement';

/** 250 kr buys a 1000-chip stack, so one chip is 25 øre. */
const BUY_IN_ORE = 25000;
const STARTING_STACK = 1000;

function buyIn(userId: string): LedgerRow {
	return { userId, type: 'buy_in', chips: STARTING_STACK, amountOre: BUY_IN_ORE };
}

function cashOut(userId: string, amountOre: number): LedgerRow {
	return { userId, type: 'cash_out', chips: 0, amountOre };
}

describe('boksFeeOre', () => {
	it.each([
		[0, 0],
		[50_000, 0], // 500 kr — under a full thousand, no fee
		[99_999, 0], // 999,99 kr
		[100_000, 1900], // exactly 1000 kr
		[125_000, 1900], // 1250 kr still only one whole thousand
		[199_999, 1900],
		[200_000, 3800],
		[240_000, 3800], // 2400 kr — two whole thousands
		[1_000_000, 19_000] // 10 000 kr
	])('charges %i øre in the boks a fee of %i øre', (total, expected) => {
		expect(boksFeeOre(total)).toBe(expected);
	});

	it('never charges a negative fee', () => {
		expect(boksFeeOre(-500)).toBe(0);
	});

	it('matches the five-player example: 1250 kr costs 19 kr', () => {
		expect(formatOre(boksFeeOre(BUY_IN_ORE * 5))).toBe('19,00 kr');
	});
});

describe('chipsToOre', () => {
	it('values a full starting stack at exactly one buy-in', () => {
		expect(chipsToOre(STARTING_STACK, BUY_IN_ORE, STARTING_STACK)).toBe(BUY_IN_ORE);
	});

	it('scales linearly', () => {
		expect(chipsToOre(2000, BUY_IN_ORE, STARTING_STACK)).toBe(50000);
		expect(chipsToOre(0, BUY_IN_ORE, STARTING_STACK)).toBe(0);
	});
});

describe('distributePool', () => {
	it('splits a pool evenly between equal stacks', () => {
		const amounts = distributePool(
			new Map([
				['a', 1000],
				['b', 1000]
			]),
			48_100
		);
		expect(amounts.get('a')).toBe(24_050);
		expect(amounts.get('b')).toBe(24_050);
	});

	it('shrinks every payout by the same proportion once the fee is taken', () => {
		// Five 250 kr buy-ins is 1250 kr; the fee is 19 kr, leaving 1231 kr.
		const paidIn = BUY_IN_ORE * 5;
		const pool = paidIn - boksFeeOre(paidIn);
		const amounts = distributePool(
			new Map([
				['winner', 3000],
				['even', 1000],
				['loser', 1000],
				['down', 0],
				['busted', 0]
			]),
			pool
		);

		// The whole pool is handed out, nothing stranded in the Boks.
		expect([...amounts.values()].reduce((sum, v) => sum + v, 0)).toBe(pool);
		// A player holding no chips withdraws nothing and carries no fee.
		expect(amounts.get('busted')).toBe(0);
		// A player who broke even gets slightly less than their 250 kr buy-in.
		expect(amounts.get('even')).toBeLessThan(BUY_IN_ORE);
		expect(amounts.get('even')).toBeGreaterThan(BUY_IN_ORE - 1000);
	});

	it('hands out exactly the pool even when shares do not divide evenly', () => {
		const amounts = distributePool(
			new Map([
				['a', 333],
				['b', 333],
				['c', 334]
			]),
			98_100
		);
		expect([...amounts.values()].reduce((sum, v) => sum + v, 0)).toBe(98_100);
	});

	it('pays nobody when there are no chips left', () => {
		const amounts = distributePool(
			new Map([
				['a', 0],
				['b', 0]
			]),
			10_000
		);
		expect([...amounts.values()]).toEqual([0, 0]);
	});

	it('pays nothing from an empty pool', () => {
		const amounts = distributePool(new Map([['a', 1000]]), 0);
		expect(amounts.get('a')).toBe(0);
	});

	it('gives the whole pool to the only player with chips', () => {
		const amounts = distributePool(
			new Map([
				['a', 5000],
				['b', 0]
			]),
			123_100
		);
		expect(amounts.get('a')).toBe(123_100);
		expect(amounts.get('b')).toBe(0);
	});
});

describe('computeSettlement', () => {
	it('reports the fee as the gap between what went in and out once ended', () => {
		const paidIn = BUY_IN_ORE * 5;
		const pool = paidIn - boksFeeOre(paidIn);
		const rows = [
			...['a', 'b', 'c', 'd', 'e'].map(buyIn),
			cashOut('a', pool - 20_000),
			cashOut('b', 20_000)
		];

		const settlement = computeSettlement(rows, true);
		expect(settlement.paidInOre).toBe(paidIn);
		expect(settlement.payoutOre).toBe(pool);
		expect(settlement.feeOre).toBe(1900);
	});

	it('projects the fee from the rule while the session is still running', () => {
		const rows = [...['a', 'b', 'c', 'd', 'e'].map(buyIn)];
		const settlement = computeSettlement(rows, false);

		expect(settlement.feeOre).toBe(1900);
		expect(settlement.payoutOre).toBe(BUY_IN_ORE * 5 - 1900);
	});

	it('counts a rebuy as money into the boks', () => {
		const rows: LedgerRow[] = [
			buyIn('a'),
			{ userId: 'a', type: 'rebuy', chips: STARTING_STACK, amountOre: BUY_IN_ORE },
			buyIn('b')
		];

		const settlement = computeSettlement(rows, false);
		expect(settlement.paidInOre).toBe(BUY_IN_ORE * 3);
		expect(settlement.lines.find((l) => l.userId === 'a')?.paidInOre).toBe(BUY_IN_ORE * 2);
		// 750 kr in the boks is still only nought whole thousands past the first.
		expect(settlement.feeOre).toBe(0);
	});

	it('shows a losing night as a negative net', () => {
		const rows = [buyIn('a'), buyIn('b'), cashOut('a', 40_000), cashOut('b', 8100)];
		const { lines } = computeSettlement(rows, true);

		expect(lines.find((l) => l.userId === 'a')?.netOre).toBe(15_000);
		expect(lines.find((l) => l.userId === 'b')?.netOre).toBe(-16_900);
	});

	it('never reports a negative fee if more went out than in', () => {
		const rows = [buyIn('a'), cashOut('a', BUY_IN_ORE + 500)];
		expect(computeSettlement(rows, true).feeOre).toBe(0);
	});
});

describe('chips still in play', () => {
	/**
	 * Leaving and rejoining records a buy-in each time and a cash-out each time
	 * but the last, because that stack is still on the table. Counting only the
	 * ledger made the player look down a full buy-in.
	 */
	const rejoinedRepeatedly: LedgerRow[] = [
		buyIn('a'),
		cashOut('a', BUY_IN_ORE),
		buyIn('a'),
		cashOut('a', BUY_IN_ORE),
		buyIn('a') // sat back down and is still there
	];

	it('counts a seated player as even, not down a buy-in', () => {
		const onTable = new Map([['a', BUY_IN_ORE]]);
		const { lines } = computeSettlement(rejoinedRepeatedly, false, onTable);
		const line = lines.find((l) => l.userId === 'a')!;

		expect(line.paidInOre).toBe(BUY_IN_ORE * 3);
		expect(line.paidOutOre).toBe(BUY_IN_ORE * 2);
		expect(line.onTableOre).toBe(BUY_IN_ORE);
		expect(line.netOre).toBe(0);
	});

	it('shows a real loss when the stack is short of the buy-in', () => {
		const { lines } = computeSettlement([buyIn('a')], false, new Map([['a', 6000]]));
		expect(lines[0].netOre).toBe(6000 - BUY_IN_ORE);
	});

	it('shows a win when the stack is above the buy-in', () => {
		const { lines } = computeSettlement([buyIn('a')], false, new Map([['a', 40_000]]));
		expect(lines[0].netOre).toBe(40_000 - BUY_IN_ORE);
	});

	it('ignores chips once the session has ended', () => {
		// A stale stack must not be double-counted next to its own cash-out.
		const rows = [buyIn('a'), cashOut('a', BUY_IN_ORE)];
		const { lines } = computeSettlement(rows, true, new Map([['a', BUY_IN_ORE]]));

		expect(lines[0].onTableOre).toBe(0);
		expect(lines[0].netOre).toBe(0);
	});

	it('includes someone seated who has no ledger rows yet', () => {
		const { lines } = computeSettlement([], false, new Map([['newcomer', 5000]]));
		expect(lines).toHaveLength(1);
		expect(lines[0].netOre).toBe(5000);
	});

	it('leaves the table balanced across everyone still playing', () => {
		const rows = [buyIn('a'), buyIn('b')];
		const onTable = new Map([
			['a', 40_000],
			['b', 10_000]
		]);
		const { lines } = computeSettlement(rows, false, onTable);

		// Chips are conserved, so the nets cancel out.
		expect(lines.reduce((sum, line) => sum + line.netOre, 0)).toBe(0);
	});
});

describe('formatOre', () => {
	it.each([
		[25000, '250,00 kr'],
		[24950, '249,50 kr'],
		[1900, '19,00 kr'],
		[5, '0,05 kr'],
		[0, '0,00 kr'],
		[-15000, '-150,00 kr']
	])('formats %i as %s', (ore, expected) => {
		expect(formatOre(ore)).toBe(expected);
	});
});
