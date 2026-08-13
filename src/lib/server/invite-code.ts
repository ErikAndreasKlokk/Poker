import { randomInt } from 'node:crypto';

/**
 * Generating invite codes.
 *
 * Kept apart from the database module so it can be tested without one, the same
 * way the settlement maths is.
 */

/**
 * No i, l, o, 0 or 1 — a code gets read aloud, written down and retyped on a
 * phone, and those are the characters people get wrong.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const LENGTH = 6;

/**
 * Prefixed so an invite is visibly not a game code. Both are short strings
 * typed into a box on the same site, and pasting one into the other's field is
 * the obvious mistake to design out.
 */
export const INVITE_PREFIX = 'venn-';

/**
 * @param random injectable so a test can pin the output; defaults to the
 *   crypto-backed generator, because a guessable invite is an open front door.
 */
export function generateInviteCode(random: (max: number) => number = randomInt): string {
	let code = '';
	for (let i = 0; i < LENGTH; i++) code += ALPHABET[random(ALPHABET.length)];
	return INVITE_PREFIX + code;
}
