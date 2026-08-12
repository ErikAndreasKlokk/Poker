import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

/** Deterministic hue per user so the fallback avatar is stable and distinguishable. */
function hueFor(seed: string) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
	return h;
}

function initialsAvatar(username: string) {
	const initials = username.slice(0, 2).toUpperCase();
	const hue = hueFor(username);
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" role="img" aria-label="${initials}">
	<rect width="256" height="256" fill="hsl(${hue} 45% 32%)"/>
	<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="112" font-weight="600" fill="hsl(${hue} 60% 88%)">${initials}</text>
</svg>`;
}

export const GET: RequestHandler = async ({ params, setHeaders, request }) => {
	const [row] = await db
		.select({
			username: table.user.username,
			mimeType: table.userAvatar.mimeType,
			bytes: table.userAvatar.bytes,
			updatedAt: table.userAvatar.updatedAt
		})
		.from(table.user)
		.leftJoin(table.userAvatar, eq(table.userAvatar.userId, table.user.id))
		.where(eq(table.user.id, params.userId));

	if (!row) error(404, 'no such user');

	if (!row.bytes || !row.mimeType) {
		setHeaders({ 'cache-control': 'public, max-age=300' });
		return new Response(initialsAvatar(row.username), {
			headers: { 'content-type': 'image/svg+xml' }
		});
	}

	// Avatars are immutable for a given updatedAt, so revalidation is cheap.
	const etag = `"${row.updatedAt!.getTime()}"`;
	if (request.headers.get('if-none-match') === etag) {
		return new Response(null, { status: 304, headers: { etag } });
	}

	return new Response(new Uint8Array(row.bytes), {
		headers: {
			'content-type': row.mimeType,
			'cache-control': 'public, max-age=60, must-revalidate',
			etag
		}
	});
};
