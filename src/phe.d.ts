declare module 'phe' {
	/** Rank of the best 5-card hand within the given cards. 1 is best, 7462 is worst. */
	export function evaluateCards(cards: string[]): number;
	/** Maps a rank from {@link evaluateCards} to a category index 0–8. */
	export function handRank(rank: number): number;
	/** Category index 0–8 for the given cards, equivalent to handRank(evaluateCards(cards)). */
	export function rankCards(cards: string[]): number;
	/** Human-readable category names, indexed by the 0–8 category. */
	export const rankDescription: string[];
}
