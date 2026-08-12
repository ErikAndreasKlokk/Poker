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

	const players = await db
		.select({
			id: schema.user.id,
			username: schema.user.username,
			phone: schema.user.phone
		})
		.from(schema.gamePlayer)
		.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
		.where(eq(schema.gamePlayer.gameId, game.id));

	const { lines, transfers } = computeSettlement(rows);

	const byId = new Map(players.map((p) => [p.id, p]));
	const name = (id: string) => byId.get(id)?.username ?? '?';

	return {
		code: game.code,
		name: game.name,
		realMoney: game.realMoney,
		status: game.status,
		vippsBoksCode: game.vippsBoksCode,
		lines: lines.map((line) => ({
			...line,
			username: name(line.userId),
			// Only the payee's number is shown, and only to people who played.
			phone: byId.get(line.userId)?.phone ?? null
		})),
		transfers: transfers.map((transfer) => ({
			...transfer,
			fromUsername: name(transfer.fromUserId),
			toUsername: name(transfer.toUserId),
			toPhone: byId.get(transfer.toUserId)?.phone ?? null
		}))
	};
};
