import { describe, expect, it } from 'vitest';
import { formatOre } from '../money';
import {
	cashOutAmounts,
	chipsToOre,
	computeSettlement,
	minimizeTransfers,
	type LedgerRow,
	type SettlementLine
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

describe('chipsToOre', () => {
	it('values a full starting stack at exactly one buy-in', () => {
		expect(chipsToOre(STARTING_STACK, BUY_IN_ORE, STARTING_STACK)).toBe(BUY_IN_ORE);
	});

	it('scales linearly', () => {
		expect(chipsToOre(2000, BUY_IN_ORE, STARTING_STACK)).toBe(50000);
		expect(chipsToOre(500, BUY_IN_ORE, STARTING_STACK)).toBe(12500);
		expect(chipsToOre(0, BUY_IN_ORE, STARTING_STACK)).toBe(0);
	});

	it('rounds to whole øre', () => {
		expect(chipsToOre(1, 25000, 999)).toBe(25);
	});
});

describe('cashOutAmounts', () => {
	it('pays out exactly what was paid in', () => {
		const stacks = new Map([
			['a', 1500],
			['b', 900],
			['c', 600]
		]);
		const amounts = cashOutAmounts(stacks, BUY_IN_ORE, STARTING_STACK, BUY_IN_ORE * 3);

		const total = [...amounts.values()].reduce((sum, v) => sum + v, 0);
		expect(total).toBe(BUY_IN_ORE * 3);
	});

	it('absorbs rounding drift into the biggest stack rather than losing øre', () => {
		// A rate that does not divide evenly, so per-stack rounding drifts.
		const stacks = new Map([
			['a', 333],
			['b', 333],
			['c', 334]
		]);
		const amounts = cashOutAmounts(stacks, 10000, 1000, 10000);

		const total = [...amounts.values()].reduce((sum, v) => sum + v, 0);
		expect(total).toBe(10000);
	});

	it('handles a player who busted', () => {
		const stacks = new Map([
			['a', 2000],
			['b', 0]
		]);
		const amounts = cashOutAmounts(stacks, BUY_IN_ORE, STARTING_STACK, BUY_IN_ORE * 2);

		expect(amounts.get('b')).toBe(0);
		expect(amounts.get('a')).toBe(BUY_IN_ORE * 2);
	});
});

describe('computeSettlement', () => {
	it('nets a simple two-player session', () => {
		const rows = [buyIn('a'), buyIn('b'), cashOut('a', 40000), cashOut('b', 10000)];

		const { lines, transfers } = computeSettlement(rows);

		expect(lines.find((l) => l.userId === 'a')?.netOre).toBe(15000);
		expect(lines.find((l) => l.userId === 'b')?.netOre).toBe(-15000);
		expect(transfers).toEqual([{ fromUserId: 'b', toUserId: 'a', amountOre: 15000 }]);
	});

	it('counts a rebuy as money in', () => {
		const rows: LedgerRow[] = [
			buyIn('a'),
			{ userId: 'a', type: 'rebuy', chips: STARTING_STACK, amountOre: BUY_IN_ORE },
			buyIn('b'),
			cashOut('a', 0),
			cashOut('b', 75000)
		];

		const { lines } = computeSettlement(rows);
		expect(lines.find((l) => l.userId === 'a')?.paidInOre).toBe(50000);
		expect(lines.find((l) => l.userId === 'a')?.netOre).toBe(-50000);
		expect(lines.find((l) => l.userId === 'b')?.netOre).toBe(50000);
	});

	it('produces no transfers when everyone broke even', () => {
		const rows = [buyIn('a'), buyIn('b'), cashOut('a', BUY_IN_ORE), cashOut('b', BUY_IN_ORE)];
		expect(computeSettlement(rows).transfers).toEqual([]);
	});
});

describe('minimizeTransfers', () => {
	function lines(nets: Record<string, number>): SettlementLine[] {
		return Object.entries(nets).map(([userId, netOre]) => ({
			userId,
			paidInOre: 0,
			paidOutOre: 0,
			netOre
		}));
	}

	it('settles five players in fewer payments than pairs', () => {
		const transfers = minimizeTransfers(
			lines({ a: 30000, b: 10000, c: -5000, d: -15000, e: -20000 })
		);

		// Four players owe or are owed; at most n-1 payments, never all ten pairs.
		expect(transfers.length).toBeLessThanOrEqual(4);
		expect(transfers.length).toBeGreaterThan(0);
	});

	it('conserves money: every debt paid, every credit received', () => {
		const nets = { a: 30000, b: 10000, c: -5000, d: -15000, e: -20000 };
		const transfers = minimizeTransfers(lines(nets));

		const settled: Record<string, number> = { a: 0, b: 0, c: 0, d: 0, e: 0 };
		for (const t of transfers) {
			settled[t.fromUserId] -= t.amountOre;
			settled[t.toUserId] += t.amountOre;
		}
		expect(settled).toEqual(nets);
	});

	it('never asks anyone to pay more than they owe', () => {
		const transfers = minimizeTransfers(lines({ a: 25000, b: -5000, c: -20000 }));
		const paid = new Map<string, number>();
		for (const t of transfers) {
			paid.set(t.fromUserId, (paid.get(t.fromUserId) ?? 0) + t.amountOre);
		}
		expect(paid.get('b')).toBe(5000);
		expect(paid.get('c')).toBe(20000);
	});

	it('returns nothing when all nets are zero', () => {
		expect(minimizeTransfers(lines({ a: 0, b: 0 }))).toEqual([]);
	});

	it('handles one big winner against many small losers', () => {
		const transfers = minimizeTransfers(
			lines({ winner: 40000, l1: -10000, l2: -10000, l3: -10000, l4: -10000 })
		);
		expect(transfers).toHaveLength(4);
		expect(transfers.every((t) => t.toUserId === 'winner')).toBe(true);
	});
});

describe('formatOre', () => {
	it.each([
		[25000, '250,00 kr'],
		[24950, '249,50 kr'],
		[5, '0,05 kr'],
		[0, '0,00 kr'],
		[-15000, '-150,00 kr']
	])('formats %i as %s', (ore, expected) => {
		expect(formatOre(ore)).toBe(expected);
	});
});
