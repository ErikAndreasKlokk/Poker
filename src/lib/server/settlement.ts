/**
 * Turning a session into "who Vippser whom".
 *
 * Pure and free of database imports so it can be unit-tested: this is the part
 * of the app where a bug costs someone real money, and the Vipps Boks gives us
 * no way to verify anything after the fact.
 *
 * Every amount is integer øre. Chips are converted once, at cash-out.
 */

export type LedgerType = 'buy_in' | 'rebuy' | 'cash_out';

export interface LedgerRow {
	userId: string;
	type: LedgerType;
	chips: number;
	amountOre: number;
}

export interface SettlementLine {
	userId: string;
	/** Everything this player put in, in øre. */
	paidInOre: number;
	/** Everything they took back out, in øre. */
	paidOutOre: number;
	/** Positive means they are owed money, negative means they owe it. */
	netOre: number;
}

export interface Transfer {
	fromUserId: string;
	toUserId: string;
	amountOre: number;
}

export interface Settlement {
	lines: SettlementLine[];
	transfers: Transfer[];
}

/**
 * Converts a chip stack to øre at the game's buy-in rate.
 * A stack equal to `startingStack` is worth exactly one buy-in.
 */
export function chipsToOre(chips: number, buyInOre: number, startingStack: number): number {
	if (startingStack <= 0) throw new Error('startingStack must be positive');
	return Math.round((chips * buyInOre) / startingStack);
}

/**
 * Works out what each player is cashing out, in øre.
 *
 * Rounding each stack independently can drift a few øre away from the money
 * actually paid in, which would leave the settlement unable to balance. The
 * drift is absorbed by the biggest stack, so the totals always match.
 *
 * @param stacks final chip stack per player
 * @param paidInOre total put in across the whole session
 */
export function cashOutAmounts(
	stacks: ReadonlyMap<string, number>,
	buyInOre: number,
	startingStack: number,
	paidInOre: number
): Map<string, number> {
	const amounts = new Map<string, number>();
	for (const [userId, chips] of stacks) {
		amounts.set(userId, chipsToOre(chips, buyInOre, startingStack));
	}

	const total = [...amounts.values()].reduce((sum, value) => sum + value, 0);
	const drift = paidInOre - total;
	if (drift !== 0 && amounts.size > 0) {
		const [biggest] = [...amounts.entries()].sort((a, b) => b[1] - a[1]);
		amounts.set(biggest[0], biggest[1] + drift);
	}

	return amounts;
}

export function computeLines(rows: readonly LedgerRow[]): SettlementLine[] {
	const byUser = new Map<string, SettlementLine>();

	for (const row of rows) {
		const line = byUser.get(row.userId) ?? {
			userId: row.userId,
			paidInOre: 0,
			paidOutOre: 0,
			netOre: 0
		};

		if (row.type === 'cash_out') line.paidOutOre += row.amountOre;
		else line.paidInOre += row.amountOre;

		line.netOre = line.paidOutOre - line.paidInOre;
		byUser.set(row.userId, line);
	}

	return [...byUser.values()].sort((a, b) => b.netOre - a.netOre);
}

/**
 * Reduces the nets to a short list of payments.
 *
 * Repeatedly settles the biggest debt against the biggest credit, which needs
 * at most one payment fewer than there are players — the point being that five
 * people settle in three Vipps payments instead of ten.
 *
 * (Finding the provably shortest list is NP-hard; this greedy pairing is the
 * standard practical answer and is optimal for the sizes a home game reaches.)
 */
export function minimizeTransfers(lines: readonly SettlementLine[]): Transfer[] {
	const debtors = lines
		.filter((line) => line.netOre < 0)
		.map((line) => ({ userId: line.userId, amount: -line.netOre }))
		.sort((a, b) => b.amount - a.amount);

	const creditors = lines
		.filter((line) => line.netOre > 0)
		.map((line) => ({ userId: line.userId, amount: line.netOre }))
		.sort((a, b) => b.amount - a.amount);

	const transfers: Transfer[] = [];
	let d = 0;
	let c = 0;

	while (d < debtors.length && c < creditors.length) {
		const amount = Math.min(debtors[d].amount, creditors[c].amount);
		if (amount > 0) {
			transfers.push({
				fromUserId: debtors[d].userId,
				toUserId: creditors[c].userId,
				amountOre: amount
			});
		}
		debtors[d].amount -= amount;
		creditors[c].amount -= amount;
		if (debtors[d].amount === 0) d++;
		if (creditors[c].amount === 0) c++;
	}

	return transfers;
}

export function computeSettlement(rows: readonly LedgerRow[]): Settlement {
	const lines = computeLines(rows);
	return { lines, transfers: minimizeTransfers(lines) };
}
