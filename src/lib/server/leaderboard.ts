import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { paginate, type Page } from './pagination';

export const PER_PAGE = 20;

export interface LeaderboardRow {
	userId: string;
	username: string;
	/** Øre for real-money games, chips for play money. */
	net: number;
	games: number;
}

export interface Leaderboard {
	rows: LeaderboardRow[];
	page: Page;
}

/**
 * Only settled sessions count.
 *
 * A buy-in is recorded the moment someone sits down, but the matching cash-out
 * is only written when the session ends. Counting a running game would show
 * everyone at the table as having lost their whole buy-in until the night is
 * over, which is both wrong and demoralising.
 */
const SETTLED = eq(schema.game.status, 'ended');

/**
 * Net kroner, in øre, per player across settled real-money sessions.
 *
 * Read straight from the ledger, so it accounts for what actually came back out
 * of the Boks — the Vipps fee included. Someone who broke exactly even at the
 * table is fractionally down here, which is the truth of it.
 *
 * `userId` goes through `sql` rather than being selected as a column so that
 * this subquery and the play-money one have the same type, and can share the
 * assembly below.
 */
function realMoneyTotals() {
	return db
		.select({
			userId: sql<string>`${schema.ledgerEntry.userId}`.as('user_id'),
			net: sql<number>`sum(
				case when ${schema.ledgerEntry.type} = 'cash_out'
					then ${schema.ledgerEntry.amountOre}
					else -${schema.ledgerEntry.amountOre}
				end
			)`.as('net'),
			games: sql<number>`count(distinct ${schema.ledgerEntry.gameId})`.as('games')
		})
		.from(schema.ledgerEntry)
		.innerJoin(schema.game, eq(schema.game.id, schema.ledgerEntry.gameId))
		.where(and(SETTLED, eq(schema.game.realMoney, true)))
		.groupBy(schema.ledgerEntry.userId)
		.as('totals');
}

/**
 * Net chips per player across settled play-money sessions.
 *
 * Play money writes no ledger, so the result comes from the seat: what the
 * player finished with, less everything they put on the table. A player who
 * left and sat back down has a row per stint, and the sum covers all of them.
 */
function playMoneyTotals() {
	return db
		.select({
			userId: sql<string>`${schema.gamePlayer.userId}`.as('user_id'),
			net: sql<number>`sum(${schema.gamePlayer.stack} - ${schema.gamePlayer.buyInChips})`.as('net'),
			games: sql<number>`count(distinct ${schema.gamePlayer.gameId})`.as('games')
		})
		.from(schema.gamePlayer)
		.innerJoin(schema.game, eq(schema.game.id, schema.gamePlayer.gameId))
		.where(and(SETTLED, eq(schema.game.realMoney, false)))
		.groupBy(schema.gamePlayer.userId)
		.as('totals');
}

type Totals = ReturnType<typeof realMoneyTotals>;

/**
 * Hangs per-player totals off the full user list.
 *
 * Left-joined from `user` rather than selected from the totals, because the
 * board lists everyone: someone who has never played belongs on it at zero
 * rather than missing from it.
 */
async function assemble(rawPage: unknown, totals: Totals): Promise<Leaderboard> {
	const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.user);
	const page = paginate(rawPage, total, PER_PAGE);

	const net = sql<number>`coalesce(${totals.net}, 0)::int`;

	const rows = await db
		.select({
			userId: schema.user.id,
			username: schema.user.username,
			net,
			games: sql<number>`coalesce(${totals.games}, 0)::int`
		})
		.from(schema.user)
		.leftJoin(totals, eq(totals.userId, schema.user.id))
		// Username breaks ties so the order is stable across pages. Without it two
		// players on zero could swap places between requests, and someone could
		// appear on both pages or on neither.
		.orderBy(desc(net), asc(schema.user.username))
		.limit(page.limit)
		.offset(page.offset);

	return { rows, page };
}

export function realMoneyLeaderboard(rawPage: unknown) {
	return assemble(rawPage, realMoneyTotals());
}

export function playMoneyLeaderboard(rawPage: unknown) {
	return assemble(rawPage, playMoneyTotals());
}
