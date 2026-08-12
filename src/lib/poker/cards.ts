import { randomInt } from 'node:crypto';

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
export const SUITS = ['c', 'd', 'h', 's'] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
/** A card in `phe` notation, e.g. 'Ah', 'Td', '2c'. */
export type Card = `${Rank}${Suit}`;

/** Draws an integer in [0, maxExclusive). Injectable so tests can be deterministic. */
export type RandomInt = (maxExclusive: number) => number;

export function freshDeck(): Card[] {
	const deck: Card[] = [];
	for (const rank of RANKS) {
		for (const suit of SUITS) {
			deck.push(`${rank}${suit}`);
		}
	}
	return deck;
}

/**
 * Fisher–Yates using a cryptographically secure RNG.
 *
 * `crypto.randomInt` is rejection-sampled and therefore unbiased; `Math.random`
 * is neither secure nor uniform enough to deal cards with, so it is never used
 * here — a predictable shuffle is the one bug that would quietly ruin every game.
 */
export function shuffle<T>(items: readonly T[], rng: RandomInt = randomInt): T[] {
	const out = [...items];
	for (let i = out.length - 1; i > 0; i--) {
		const j = rng(i + 1);
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

export function shuffledDeck(rng: RandomInt = randomInt): Card[] {
	return shuffle(freshDeck(), rng);
}
