import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the two message catalogues against drifting apart.
 *
 * Paraglide falls back to the base locale for a missing key, so an untranslated
 * string shows up as stray Norwegian in the English UI rather than as an error.
 * That is exactly the kind of thing nobody notices until a friend switches
 * language mid-game.
 */

function load(locale: string): Record<string, string> {
	const path = fileURLToPath(new URL(`../../messages/${locale}.json`, import.meta.url));
	return JSON.parse(readFileSync(path, 'utf8'));
}

const nb = load('nb');
const en = load('en');

/** `$schema` is metadata, not a message. */
const keysOf = (catalogue: Record<string, string>) =>
	Object.keys(catalogue)
		.filter((key) => !key.startsWith('$'))
		.sort();

describe('message catalogues', () => {
	it('has messages in both locales', () => {
		expect(keysOf(nb).length).toBeGreaterThan(50);
	});

	it('translates every Norwegian key into English', () => {
		const missing = keysOf(nb).filter((key) => !(key in en));
		expect(missing).toEqual([]);
	});

	it('has no English keys the Norwegian catalogue lacks', () => {
		const extra = keysOf(en).filter((key) => !(key in nb));
		expect(extra).toEqual([]);
	});

	it('leaves no message empty', () => {
		const blank = [...keysOf(nb), ...keysOf(en)].filter(
			(key) => !nb[key]?.trim() || !en[key]?.trim()
		);
		expect(blank).toEqual([]);
	});

	it('uses the same placeholders in both languages', () => {
		const placeholders = (text: string) => (text.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort();

		const mismatched = keysOf(nb).filter((key) => {
			const a = placeholders(nb[key]);
			const b = placeholders(en[key] ?? '');
			return a.join(',') !== b.join(',');
		});

		expect(mismatched).toEqual([]);
	});

	it('does not leave obviously untranslated copies behind', () => {
		// Identical strings are fine for proper nouns and poker terms, but a long
		// identical sentence usually means someone forgot to translate it.
		const suspicious = keysOf(nb).filter(
			(key) => nb[key] === en[key] && nb[key].split(' ').length > 4
		);
		expect(suspicious).toEqual([]);
	});
});
