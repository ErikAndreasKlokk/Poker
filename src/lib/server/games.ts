import { randomInt } from 'node:crypto';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { parseGameSettings, type GameSettings } from '$lib/server/validation';

/** No 0/O/1/I — these codes get read aloud and retyped on phones. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

function generateCode() {
	let code = '';
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
	}
	return code;
}

export async function createGame(hostUserId: string, raw: Record<string, string>) {
	const settings: GameSettings = parseGameSettings(raw);

	// 32^6 codes against a handful of live games; a couple of retries is plenty.
	for (let attempt = 0; attempt < 5; attempt++) {
		const code = generateCode();
		const existing = await db
			.select({ id: schema.game.id })
			.from(schema.game)
			.where(eq(schema.game.code, code));
		if (existing.length > 0) continue;

		const [created] = await db
			.insert(schema.game)
			.values({
				id: crypto.randomUUID(),
				code,
				name: settings.name,
				hostUserId,
				realMoney: settings.realMoney,
				vippsBoksCode: settings.vippsBoksCode,
				buyInOre: settings.buyInOre,
				smallBlind: settings.smallBlind,
				bigBlind: settings.bigBlind,
				startingStack: settings.startingStack,
				maxSeats: settings.maxSeats,
				turnSeconds: settings.turnSeconds,
				voiceChatUrl: settings.voiceChatUrl
			})
			.returning();

		return created;
	}

	throw new Error('could not allocate a unique game code');
}

export async function findGameByCode(code: string) {
	const [game] = await db
		.select()
		.from(schema.game)
		.where(eq(schema.game.code, code.toUpperCase()));
	return game ?? null;
}

/** Games the user hosts or is seated at, plus anything still open in the lobby. */
export async function listGames(userId: string) {
	const rows = await db
		.select({
			id: schema.game.id,
			code: schema.game.code,
			name: schema.game.name,
			status: schema.game.status,
			realMoney: schema.game.realMoney,
			smallBlind: schema.game.smallBlind,
			bigBlind: schema.game.bigBlind,
			maxSeats: schema.game.maxSeats,
			hostUserId: schema.game.hostUserId,
			createdAt: schema.game.createdAt,
			seated: sql<number>`(
				select count(*)::int from ${schema.gamePlayer}
				where ${schema.gamePlayer.gameId} = ${schema.game.id}
				  and ${schema.gamePlayer.leftAt} is null
			)`,
			youAreSeated: sql<boolean>`exists (
				select 1 from ${schema.gamePlayer}
				where ${schema.gamePlayer.gameId} = ${schema.game.id}
				  and ${schema.gamePlayer.userId} = ${userId}
				  and ${schema.gamePlayer.leftAt} is null
			)`
		})
		.from(schema.game)
		.where(sql`${schema.game.status} <> 'ended'`)
		.orderBy(desc(schema.game.createdAt))
		.limit(50);

	return rows;
}

export async function endGame(gameId: string, hostUserId: string) {
	await db
		.update(schema.game)
		.set({ status: 'ended', endedAt: new Date() })
		.where(and(eq(schema.game.id, gameId), eq(schema.game.hostUserId, hostUserId)));
}

export async function isSeated(gameId: string, userId: string) {
	const [row] = await db
		.select({ id: schema.gamePlayer.id })
		.from(schema.gamePlayer)
		.where(
			and(
				eq(schema.gamePlayer.gameId, gameId),
				eq(schema.gamePlayer.userId, userId),
				isNull(schema.gamePlayer.leftAt)
			)
		);
	return !!row;
}
