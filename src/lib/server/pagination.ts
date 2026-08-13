/**
 * Page arithmetic, kept apart from any query so it can be tested directly.
 *
 * All of the awkwardness here is about a page number that came from a URL, so
 * every value is hostile until proven otherwise: missing, zero, negative,
 * fractional, past the end, or not a number at all.
 */

export interface Page {
	/** 1-based, clamped into range. */
	number: number;
	pageCount: number;
	offset: number;
	limit: number;
	hasPrevious: boolean;
	hasNext: boolean;
}

export function paginate(rawPage: unknown, total: number, perPage: number): Page {
	const size = Math.max(1, Math.floor(perPage));
	// One page even when empty: "page 1 of 0" reads like a bug to the person
	// looking at an empty leaderboard.
	const pageCount = Math.max(1, Math.ceil(Math.max(0, total) / size));

	const asked = Number(rawPage);
	const number = Number.isFinite(asked) ? Math.min(pageCount, Math.max(1, Math.floor(asked))) : 1;

	return {
		number,
		pageCount,
		offset: (number - 1) * size,
		limit: size,
		hasPrevious: number > 1,
		hasNext: number < pageCount
	};
}
