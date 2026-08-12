/**
 * Turning a session into what each player takes out of the Vipps Boks.
 *
 * The Boks is the pot: buy-ins are paid in, and at the end everyone withdraws
 * what their chips are worth. Nobody can owe anyone, because nobody can lose
 * more than they bought in — so there are no player-to-player payments, only
 * withdrawals.
 *
 * Pure and free of database imports so it can be unit-tested: this is the part
 * of the app where a bug costs someone real money, and the Boks gives us no way
 * to verify anything after the fact.
 *
 * Every amount is integer øre.
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
	/** Everything this player put into the Boks, in øre. */
	paidInOre: number;
	/** What they have taken back out, in øre. */
	paidOutOre: number;
	/**
	 * What their chips are worth while the session is still running.
	 *
	 * Without this a player who has bought in but not yet cashed out looks like
	 * they are simply down that much, when the money is sitting in front of them.
	 * Always zero once the session has ended and the chips became a payout.
	 */
	onTableOre: number;
	/** Positive means they are up, counting chips still in play. */
	netOre: number;
}

export interface Settlement {
	lines: SettlementLine[];
	/** Total paid into the Boks across the session. */
	paidInOre: number;
	/** Vipps' cut, derived from what actually went out. */
	feeOre: number;
	/** What is left for players to withdraw. */
	payoutOre: number;
}

/** 19 kr, in øre. */
export const BOKS_FEE_PER_THOUSAND_ORE = 1900;
const THOUSAND_KRONER_IN_ORE = 100_000;

/**
 * Vipps takes 19 kr for each whole 1000 kr held in a Boks.
 *
 * Whole thousands only: 1250 kr is charged the same 19 kr as 1000 kr, and
 * nothing at all is charged below 1000 kr.
 */
export function boksFeeOre(totalOre: number): number {
	if (totalOre <= 0) return 0;
	return Math.floor(totalOre / THOUSAND_KRONER_IN_ORE) * BOKS_FEE_PER_THOUSAND_ORE;
}

/**
 * Converts a chip stack to øre at the game's buy-in rate, ignoring the fee.
 * Used when a player cashes out mid-session by leaving the table.
 */
export function chipsToOre(chips: number, buyInOre: number, startingStack: number): number {
	if (startingStack <= 0) throw new Error('startingStack must be positive');
	return Math.round((chips * buyInOre) / startingStack);
}

/**
 * Splits the payout pool across final stacks, proportional to chips.
 *
 * Because the pool is already short by the fee, everyone's share shrinks by the
 * same percentage — which is exactly what happens physically, since the Boks
 * simply holds less than went into it. A player who busted holds no chips and
 * so carries none of the fee.
 *
 * Rounding each share independently can drift a few øre from the pool, which
 * would leave money stranded in the Boks; the drift goes to the biggest stack.
 */
export function distributePool(
	stacks: ReadonlyMap<string, number>,
	poolOre: number
): Map<string, number> {
	const amounts = new Map<string, number>();
	const totalChips = [...stacks.values()].reduce((sum, chips) => sum + chips, 0);

	if (totalChips <= 0 || poolOre <= 0) {
		for (const userId of stacks.keys()) amounts.set(userId, 0);
		return amounts;
	}

	for (const [userId, chips] of stacks) {
		amounts.set(userId, Math.round((chips * poolOre) / totalChips));
	}

	const total = [...amounts.values()].reduce((sum, value) => sum + value, 0);
	const drift = poolOre - total;
	if (drift !== 0) {
		const [biggest] = [...amounts.entries()].sort((a, b) => b[1] - a[1]);
		amounts.set(biggest[0], biggest[1] + drift);
	}

	return amounts;
}

/**
 * @param onTableOre what each seated player's chips are currently worth
 */
export function computeLines(
	rows: readonly LedgerRow[],
	onTableOre: ReadonlyMap<string, number> = new Map()
): SettlementLine[] {
	const blank = (userId: string): SettlementLine => ({
		userId,
		paidInOre: 0,
		paidOutOre: 0,
		onTableOre: 0,
		netOre: 0
	});

	const byUser = new Map<string, SettlementLine>();

	for (const row of rows) {
		const line = byUser.get(row.userId) ?? blank(row.userId);
		if (row.type === 'cash_out') line.paidOutOre += row.amountOre;
		else line.paidInOre += row.amountOre;
		byUser.set(row.userId, line);
	}

	for (const [userId, amount] of onTableOre) {
		const line = byUser.get(userId) ?? blank(userId);
		line.onTableOre = amount;
		byUser.set(userId, line);
	}

	for (const line of byUser.values()) {
		line.netOre = line.paidOutOre + line.onTableOre - line.paidInOre;
	}

	return [...byUser.values()].sort((a, b) => b.netOre - a.netOre);
}

/**
 * @param rows every ledger entry for the game
 * @param ended once the session is closed the fee is whatever the Boks actually
 *   kept; while it is still running we can only project it from the rule
 */
export function computeSettlement(
	rows: readonly LedgerRow[],
	ended: boolean,
	onTableOre: ReadonlyMap<string, number> = new Map()
): Settlement {
	// Once ended there are no chips left in play; everything became a payout.
	const lines = computeLines(rows, ended ? new Map() : onTableOre);
	const paidInOre = lines.reduce((sum, line) => sum + line.paidInOre, 0);
	const payoutOre = lines.reduce((sum, line) => sum + line.paidOutOre, 0);

	// After the fact the gap between in and out is the fee that was applied, so
	// a later change to the fee rule cannot rewrite a settled night's history.
	const feeOre = ended ? Math.max(0, paidInOre - payoutOre) : boksFeeOre(paidInOre);

	return { lines, paidInOre, feeOre, payoutOre: ended ? payoutOre : paidInOre - feeOre };
}
