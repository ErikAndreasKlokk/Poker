import { randomInt } from 'node:crypto';
import { and, desc, eq, isNull, ne, sql } from 'drizzle-orm';
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

/**
 * Every game still open, with how many are seated.
 *
 * Counted with a grouped join rather than correlated subqueries: the raw-SQL
 * version silently returned zero for tables that clearly had players.
 */
export async function listGames(userId: string) {
	return db
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
			seated: sql<number>`count(${schema.gamePlayer.id})::int`,
			youAreSeated: sql<boolean>`coalesce(bool_or(${schema.gamePlayer.userId} = ${userId}), false)`
		})
		.from(schema.game)
		.leftJoin(
			schema.gamePlayer,
			and(eq(schema.gamePlayer.gameId, schema.game.id), isNull(schema.gamePlayer.leftAt))
		)
		.where(ne(schema.game.status, 'ended'))
		.groupBy(schema.game.id)
		.orderBy(desc(schema.game.createdAt))
		.limit(50);
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
