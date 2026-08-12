import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { findGameByCode } from '$lib/server/games';
import { loadHandEvents, seatUsernames } from '$lib/server/hands';
import { buildFrames } from '$lib/replay';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth');

	const game = await findGameByCode(params.code);
	if (!game) error(404, 'game_not_found');

	const handNumber = Number(params.number);
	if (!Number.isInteger(handNumber) || handNumber < 1) error(404, 'no_such_hand');

	const [seat] = await db
		.select({ seat: schema.gamePlayer.seat })
		.from(schema.gamePlayer)
		.where(
			and(eq(schema.gamePlayer.gameId, game.id), eq(schema.gamePlayer.userId, locals.user.id))
		);
	if (!seat && game.hostUserId !== locals.user.id) error(403, 'not_your_game');

	const { events, found } = await loadHandEvents(
		game.id,
		handNumber,
		seat?.seat ?? null,
		game.status === 'ended'
	);
	if (!found) error(404, 'no_such_hand');

	const names = await seatUsernames(game.id);

	return {
		code: game.code,
		name: game.name,
		handNumber,
		sessionEnded: game.status === 'ended',
		seatNames: Object.fromEntries(names),
		frames: buildFrames(events)
	};
};
