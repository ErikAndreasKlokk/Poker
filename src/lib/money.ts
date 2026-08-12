/**
 * Money formatting, shared by server and client.
 *
 * Kept out of `$lib/server` so components can import it — anything under
 * `$lib/server` is server-only and cannot be pulled into a page component.
 */

/** Formats øre as Norwegian kroner, e.g. 24950 -> "249,50 kr". */
export function formatOre(ore: number): string {
	const sign = ore < 0 ? '-' : '';
	const abs = Math.abs(ore);
	return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')} kr`;
}
