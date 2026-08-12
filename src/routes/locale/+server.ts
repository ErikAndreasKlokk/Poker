import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { locales } from '$lib/paraglide/runtime';
import type { RequestHandler } from './$types';

/**
 * Persists a language choice against the account.
 *
 * Paraglide already stores the locale in a cookie, which is per-device. Saving
 * it on the user as well means switching language on your phone carries over to
 * the laptop, where the cookie is applied again at login.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const { locale } = await request.json();

	if (typeof locale !== 'string' || !locales.includes(locale as (typeof locales)[number])) {
		error(400, 'unsupported_locale');
	}

	// Anonymous visitors still get the cookie; there is just nothing to save.
	if (locals.user) {
		await db.update(schema.user).set({ locale }).where(eq(schema.user.id, locals.user.id));
	}

	return json({ ok: true });
};
