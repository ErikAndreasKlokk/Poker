import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { findGameByCode } from '$lib/server/games';
import { listHands } from '$lib/server/hands';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth');

	const game = await findGameByCode(params.code);
	if (!game) error(404, 'game_not_found');

	const [seat] = await db
		.select({ id: schema.gamePlayer.id })
		.from(schema.gamePlayer)
		.where(
			and(eq(schema.gamePlayer.gameId, game.id), eq(schema.gamePlayer.userId, locals.user.id))
		);
	if (!seat && game.hostUserId !== locals.user.id) error(403, 'not_your_game');

	return {
		code: game.code,
		name: game.name,
		hands: await listHands(game.id)
	};
};
