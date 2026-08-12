import { evaluateCards, handRank, rankDescription } from 'phe';
import type { Card } from './cards';

export interface HandValue {
	/** 1 is the best possible hand, 7462 the worst. Lower wins. */
	rank: number;
	/** Category index 0–8, where 0 is a straight flush. */
	category: number;
	/** Category name in English, e.g. 'Full House'. UI translates via i18n keys. */
	description: string;
}

/**
 * Evaluates the best 5-card hand out of the given cards (typically 2 hole + 5 board).
 * Works for 5, 6 or 7 cards.
 */
export function evaluate(cards: Card[]): HandValue {
	if (cards.length < 5) {
		throw new Error(`need at least 5 cards to evaluate, got ${cards.length}`);
	}
	const rank = evaluateCards(cards);
	const category = handRank(rank);
	return { rank, category, description: rankDescription[category] };
}

/** i18n message keys for the nine hand categories, in phe's category order. */
export const CATEGORY_KEYS = [
	'hand_straight_flush',
	'hand_four_of_a_kind',
	'hand_full_house',
	'hand_flush',
	'hand_straight',
	'hand_three_of_a_kind',
	'hand_two_pair',
	'hand_one_pair',
	'hand_high_card'
] as const;
