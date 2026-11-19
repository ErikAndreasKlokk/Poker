import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import type { ReplayEvent } from '$lib/replay';

export interface HandSummary {
	handNumber: number;
	board: string[];
	potTotal: number;
	endedAt: Date | null;
	winners: { seat: number; amount: number; username: string | null }[];
}

/** Most recent hands first, with who won what. */
export async function listHands(gameId: string, limit = 50): Promise<HandSummary[]> {
	const hands = await db
		.select({
			id: schema.hand.id,
			handNumber: schema.hand.handNumber,
			board: schema.hand.board,
			potTotal: schema.hand.potTotal,
			startedAt: schema.hand.startedAt,
			endedAt: schema.hand.endedAt
		})
		.from(schema.hand)
		// Finished hands only: the one in play can't be replayed, and a voided
		// hand (interrupted by a restart) never gets an end time.
		.where(and(eq(schema.hand.gameId, gameId), isNotNull(schema.hand.endedAt)))
		.orderBy(desc(schema.hand.handNumber))
		.limit(limit);

	if (hands.length === 0) return [];

	// Every stint in the game, so each hand's winners get the name of whoever
	// held that seat at the time rather than whoever holds it now.
	const stints = await db
		.select({
			seat: schema.gamePlayer.seat,
			joinedAt: schema.gamePlayer.joinedAt,
			leftAt: schema.gamePlayer.leftAt,
			username: schema.user.username
		})
		.from(schema.gamePlayer)
		.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
		.where(eq(schema.gamePlayer.gameId, gameId));
	const nameAt = (seat: number, at: Date) =>
		stints.find((s) => s.seat === seat && s.joinedAt <= at && (s.leftAt === null || s.leftAt >= at))
			?.username ?? null;
	const startedAtById = new Map(hands.map((hand) => [hand.id, hand.startedAt]));

	// One query for every hand's payouts rather than one per hand.
	const payouts = await db
		.select({
			handId: schema.handEvent.handId,
			seat: schema.handEvent.seat,
			payload: schema.handEvent.payload
		})
		.from(schema.handEvent)
		.where(
			and(
				inArray(
					schema.handEvent.handId,
					hands.map((hand) => hand.id)
				),
				eq(schema.handEvent.type, 'payout')
			)
		);

	const byHand = new Map<string, HandSummary['winners']>();
	for (const row of payouts) {
		const seat = row.seat ?? -1;
		const winners = byHand.get(row.handId) ?? [];
		winners.push({
			seat,
			amount: (row.payload as { amount?: number }).amount ?? 0,
			username: nameAt(seat, startedAtById.get(row.handId)!)
		});
		byHand.set(row.handId, winners);
	}

	return hands.map((hand) => ({
		handNumber: hand.handNumber,
		board: hand.board,
		potTotal: hand.potTotal,
		endedAt: hand.endedAt,
		winners: byHand.get(hand.id) ?? []
	}));
}

/**
 * game_player rows that were sitting when a hand was dealt.
 *
 * A user can hold several rows in one game (leave, then sit again), and a seat
 * can pass between users, so "who was in seat N" only has an answer for a
 * given moment.
 */
function seatedAt(gameId: string, at: Date) {
	return and(
		eq(schema.gamePlayer.gameId, gameId),
		lte(schema.gamePlayer.joinedAt, at),
		or(isNull(schema.gamePlayer.leftAt), gte(schema.gamePlayer.leftAt, at))
	);
}

/** Seat → username, optionally as it stood when one particular hand was dealt. */
export async function seatUsernames(gameId: string, at?: Date): Promise<Map<number, string>> {
	const rows = await db
		.select({ seat: schema.gamePlayer.seat, username: schema.user.username })
		.from(schema.gamePlayer)
		.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
		.where(at ? seatedAt(gameId, at) : eq(schema.gamePlayer.gameId, gameId));

	return new Map(rows.map((row) => [row.seat, row.username]));
}

export interface HandRef {
	id: string;
	startedAt: Date;
	endedAt: Date | null;
}

export async function findHand(gameId: string, handNumber: number): Promise<HandRef | null> {
	const [target] = await db
		.select({ id: schema.hand.id, startedAt: schema.hand.startedAt, endedAt: schema.hand.endedAt })
		.from(schema.hand)
		.where(and(eq(schema.hand.gameId, gameId), eq(schema.hand.handNumber, handNumber)));
	return target ?? null;
}

/**
 * The seat this user held in that hand, or null if they weren't dealt in.
 *
 * Must be resolved per hand: matching on the user's current (or any) seat let
 * someone who moved seats see whoever took their old one.
 */
export async function viewerSeatForHand(
	gameId: string,
	userId: string,
	hand: HandRef
): Promise<number | null> {
	const [row] = await db
		.select({ seat: schema.gamePlayer.seat })
		.from(schema.gamePlayer)
		.where(and(eq(schema.gamePlayer.userId, userId), seatedAt(gameId, hand.startedAt)));
	return row?.seat ?? null;
}

/** Whether this user has ever sat in this game. */
export async function hasPlayedIn(gameId: string, userId: string): Promise<boolean> {
	const [row] = await db
		.select({ id: schema.gamePlayer.id })
		.from(schema.gamePlayer)
		.where(and(eq(schema.gamePlayer.gameId, gameId), eq(schema.gamePlayer.userId, userId)))
		.limit(1);
	return Boolean(row);
}

/**
 * Loads one finished hand's events, filtered to what this viewer is allowed to see.
 *
 * Callers must not pass a hand that is still in play (`endedAt` null): the hand
 * row and its `deal_hole` events are written at deal time, so replay would
 * otherwise be a live view of the table.
 *
 * Cards shown at showdown are public — everyone saw them at the table. A folded
 * player's cards stay hidden from everyone but their owner until the session
 * ends.
 */
export async function loadHandEvents(
	hand: HandRef,
	viewerSeat: number | null,
	sessionEnded: boolean
): Promise<ReplayEvent[]> {
	const rows = await db
		.select({ payload: schema.handEvent.payload, seat: schema.handEvent.seat })
		.from(schema.handEvent)
		.where(eq(schema.handEvent.handId, hand.id))
		.orderBy(asc(schema.handEvent.seq));

	const all = rows.map((row) => row.payload as ReplayEvent);
	const shown = new Set(
		all.filter((event) => event.type === 'showdown').map((event) => event.seat)
	);

	const events = all.filter((event) => {
		if (event.type !== 'deal_hole') return true;
		if (event.seat === viewerSeat) return true;
		if (shown.has(event.seat)) return true;
		return sessionEnded;
	});

	return events;
}
