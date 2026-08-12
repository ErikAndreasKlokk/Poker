import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import * as schema from './db/schema';

export const sessionCookieName = 'auth-session';

/** The cookie holds the raw token; only its hash is ever stored. */
export function hashSessionToken(token: string) {
	return encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
}

/**
 * Resolves a session cookie to a user, without the sliding-expiry write that
 * the HTTP path does. Used by the WebSocket upgrade, which must authenticate
 * before a socket is accepted and has no cookie jar to write back to.
 */
export async function findSessionUser(db: Db, token: string) {
	const [row] = await db
		.select({
			id: schema.user.id,
			username: schema.user.username,
			expiresAt: schema.session.expiresAt
		})
		.from(schema.session)
		.innerJoin(schema.user, eq(schema.user.id, schema.session.userId))
		.where(eq(schema.session.id, hashSessionToken(token)));

	if (!row || Date.now() >= row.expiresAt.getTime()) return null;
	return { id: row.id, username: row.username };
}

/** Minimal cookie-header parser — enough to pull one named cookie out. */
export function readCookie(header: string | undefined, name: string): string | null {
	if (!header) return null;
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
	}
	return null;
}
