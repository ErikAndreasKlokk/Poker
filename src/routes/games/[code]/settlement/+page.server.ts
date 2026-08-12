import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { findGameByCode } from '$lib/server/games';
import { computeSettlement } from '$lib/server/settlement';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth');

	const game = await findGameByCode(params.code);
	if (!game) error(404, 'game_not_found');

	// Only people who sat at this table may see who owes whom.
	const [seat] = await db
		.select({ id: schema.gamePlayer.id })
		.from(schema.gamePlayer)
		.where(
			and(eq(schema.gamePlayer.gameId, game.id), eq(schema.gamePlayer.userId, locals.user.id))
		);
	if (!seat && game.hostUserId !== locals.user.id) error(403, 'not_your_game');

	const rows = await db
		.select({
			userId: schema.ledgerEntry.userId,
			type: schema.ledgerEntry.type,
			chips: schema.ledgerEntry.chips,
			amountOre: schema.ledgerEntry.amountOre
		})
		.from(schema.ledgerEntry)
		.where(eq(schema.ledgerEntry.gameId, game.id));

	// No phone numbers here: money moves through the Boks, so nobody needs
	// another player's number to settle up.
	const players = await db
		.select({ id: schema.user.id, username: schema.user.username })
		.from(schema.gamePlayer)
		.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
		.where(eq(schema.gamePlayer.gameId, game.id));

	const ended = game.status === 'ended';
	const { lines, paidInOre, feeOre, payoutOre } = computeSettlement(rows, ended);

	const byId = new Map(players.map((p) => [p.id, p]));

	return {
		code: game.code,
		name: game.name,
		realMoney: game.realMoney,
		ended,
		vippsBoksCode: game.vippsBoksCode,
		paidInOre,
		feeOre,
		payoutOre,
		lines: lines.map((line) => ({
			...line,
			username: byId.get(line.userId)?.username ?? '?'
		}))
	};
};
