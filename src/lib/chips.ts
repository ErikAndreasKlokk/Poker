/**
 * Turning an amount of chips into a pile you can actually look at.
 *
 * Denominations are derived from the game rather than fixed, so a full starting
 * stack is always roughly eight chips of the top colour. Without that, a table
 * with 10/20 blinds and a 1000 stack would render every stack as a single chip,
 * and a table with tiny blinds would render hundreds.
 */

export interface ChipColumn {
	value: number;
	count: number;
	/** 0 is the lowest denomination in play; higher is worth more. */
	tier: number;
}

/** 1, 2, 5 at every magnitude — the denominations real chip sets use. */
function ladder(): number[] {
	const values: number[] = [];
	for (let exponent = 0; exponent <= 9; exponent++) {
		for (const multiple of [1, 2, 5]) values.push(multiple * 10 ** exponent);
	}
	return values;
}

function largestAtMost(limit: number): number {
	const candidates = ladder().filter((value) => value <= limit);
	return candidates.length > 0 ? candidates[candidates.length - 1] : 1;
}

function smallestAtLeast(limit: number): number {
	return ladder().find((value) => value >= limit) ?? limit;
}

/**
 * Picks up to four denominations for a game, highest first.
 *
 * @param startingStack a full buy-in, used to size the top chip
 * @param smallBlind the smallest amount anyone can wager, so no chip is smaller
 */
export function denominationsFor(startingStack: number, smallBlind: number): number[] {
	// Round the floor *up* to the blind: the ladder has no 25, so rounding down
	// from a 25 blind would mint a 20 chip nobody could ever bet.
	const bottom = Math.max(1, smallestAtLeast(Math.max(1, smallBlind)));
	const top = Math.max(largestAtMost(Math.max(1, Math.floor(startingStack / 8))), bottom);

	const inRange = ladder().filter((value) => value >= bottom && value <= top);
	if (inRange.length === 0) return [Math.max(1, smallBlind)];

	// Highest first, at most four colours to keep a pile readable.
	return inRange.slice(-4).reverse();
}

/**
 * Greedy decomposition into whole chips, highest denomination first.
 *
 * Any remainder below the smallest denomination is folded into one extra chip
 * of that denomination, so a pot is never drawn as empty when it holds money.
 */
export function breakdown(amount: number, denominations: readonly number[]): ChipColumn[] {
	if (amount <= 0 || denominations.length === 0) return [];

	const columns: ChipColumn[] = [];
	let left = amount;

	denominations.forEach((value, index) => {
		const tier = denominations.length - 1 - index;
		const count = Math.floor(left / value);
		if (count > 0) {
			columns.push({ value, count, tier });
			left -= count * value;
		}
	});

	if (columns.length === 0) {
		const smallest = denominations[denominations.length - 1];
		columns.push({ value: smallest, count: 1, tier: 0 });
	}

	return columns;
}

export interface DrawnColumn extends ChipColumn {
	/** Chips actually drawn, once the column is capped for space. */
	drawn: number;
}

/**
 * Caps how tall each column is drawn without dropping any of them.
 *
 * Capping the pile as a whole instead would spend the entire budget on the top
 * denomination, so a 990 stack would render as four identical chips and lose
 * the colour mix that makes one pile readably bigger than another.
 *
 * @param maxColumns how many colours may be drawn at all, highest value first.
 *   A seat plate is only so wide, and four columns plus the total overflow it.
 *   The dropped colours are always the cheapest ones, so what is left still
 *   accounts for nearly all of the pile — and the exact amount is printed
 *   beside it either way.
 */
export function drawablePile(
	columns: readonly ChipColumn[],
	maxPerColumn: number,
	maxColumns = Number.POSITIVE_INFINITY
): DrawnColumn[] {
	return columns.slice(0, Math.max(1, maxColumns)).map((column) => ({
		...column,
		drawn: Math.max(1, Math.min(column.count, maxPerColumn))
	}));
}
