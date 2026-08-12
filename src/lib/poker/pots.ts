export interface Pot {
	amount: number;
	/** Seats that can still win this pot, sorted ascending. Folded seats are excluded. */
	eligibleSeats: number[];
}

export interface PotAward {
	potIndex: number;
	amount: number;
	winners: number[];
	/** Chips each winner receives from this pot, including any odd chip. */
	perSeat: Map<number, number>;
}

/**
 * Splits the money committed during a hand into a main pot plus side pots.
 *
 * Each distinct all-in level creates a layer: every seat that reached that level
 * contributes the layer's height to it. Chips from folded seats stay in the pot
 * they were committed to, but those seats are not eligible to win it.
 *
 * An uncalled bet naturally becomes a final pot with a single eligible seat, so
 * it returns to the bettor at award time — chip-equivalent to returning it up front.
 *
 * @param contributions total committed across the whole hand, by seat
 * @param foldedSeats seats that folded at any point
 */
export function buildPots(
	contributions: ReadonlyMap<number, number>,
	foldedSeats: ReadonlySet<number>
): Pot[] {
	const levels = [...new Set([...contributions.values()].filter((v) => v > 0))].sort(
		(a, b) => a - b
	);

	const pots: Pot[] = [];
	let previousLevel = 0;
	/** Chips from layers nobody is eligible to win, rolled into the next real pot. */
	let carry = 0;

	for (const level of levels) {
		const height = level - previousLevel;
		previousLevel = level;

		const contributors: number[] = [];
		for (const [seat, amount] of contributions) {
			if (amount >= level) contributors.push(seat);
		}

		const amount = height * contributors.length + carry;
		const eligibleSeats = contributors
			.filter((seat) => !foldedSeats.has(seat))
			.sort((a, b) => a - b);

		if (eligibleSeats.length === 0) {
			carry = amount;
			continue;
		}

		carry = 0;
		pots.push({ amount, eligibleSeats });
	}

	// Only reachable if every contributor folded, which cannot happen at showdown.
	if (carry > 0 && pots.length > 0) {
		pots[pots.length - 1].amount += carry;
	}

	return mergeAdjacentPots(pots);
}

/** Adjacent layers with the same eligible seats are indistinguishable — show them as one pot. */
function mergeAdjacentPots(pots: Pot[]): Pot[] {
	const merged: Pot[] = [];
	for (const pot of pots) {
		const previous = merged[merged.length - 1];
		if (previous && sameSeats(previous.eligibleSeats, pot.eligibleSeats)) {
			previous.amount += pot.amount;
		} else {
			merged.push({ amount: pot.amount, eligibleSeats: [...pot.eligibleSeats] });
		}
	}
	return merged;
}

function sameSeats(a: number[], b: number[]): boolean {
	return a.length === b.length && a.every((seat, i) => seat === b[i]);
}

/**
 * Awards every pot to the best hand among its eligible seats.
 *
 * @param handRanks evaluated rank per seat — lower is better, per `evaluate()`
 * @param oddChipOrder seats in award order starting left of the button; odd chips
 *   that cannot be split evenly go to the earliest seat in this order
 */
export function awardPots(
	pots: readonly Pot[],
	handRanks: ReadonlyMap<number, number>,
	oddChipOrder: readonly number[]
): { payouts: Map<number, number>; awards: PotAward[] } {
	const payouts = new Map<number, number>();
	const awards: PotAward[] = [];

	pots.forEach((pot, potIndex) => {
		const contenders = pot.eligibleSeats.filter((seat) => handRanks.has(seat));
		if (contenders.length === 0) return;

		const bestRank = Math.min(...contenders.map((seat) => handRanks.get(seat)!));
		const winners = contenders.filter((seat) => handRanks.get(seat) === bestRank);

		const share = Math.floor(pot.amount / winners.length);
		let remainder = pot.amount - share * winners.length;

		const perSeat = new Map<number, number>();
		for (const seat of winners) perSeat.set(seat, share);

		// Odd chips go one at a time, starting with the winner closest to the button's left.
		const byPosition = [...winners].sort(
			(a, b) => oddChipOrder.indexOf(a) - oddChipOrder.indexOf(b)
		);
		for (let i = 0; remainder > 0; i = (i + 1) % byPosition.length) {
			const seat = byPosition[i];
			perSeat.set(seat, perSeat.get(seat)! + 1);
			remainder--;
		}

		for (const [seat, amount] of perSeat) {
			payouts.set(seat, (payouts.get(seat) ?? 0) + amount);
		}

		awards.push({ potIndex, amount: pot.amount, winners, perSeat });
	});

	return { payouts, awards };
}

/** Seats ordered for acting/awarding, starting with the first seat left of the button. */
export function seatOrderFrom(button: number, seats: readonly number[]): number[] {
	const sorted = [...seats].sort((a, b) => a - b);
	const startIndex = sorted.findIndex((seat) => seat > button);
	const pivot = startIndex === -1 ? 0 : startIndex;
	return [...sorted.slice(pivot), ...sorted.slice(0, pivot)];
}
