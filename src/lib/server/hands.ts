import { and, asc, desc, eq, inArray } from 'drizzle-orm';
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
			endedAt: schema.hand.endedAt
		})
		.from(schema.hand)
		.where(eq(schema.hand.gameId, gameId))
		.orderBy(desc(schema.hand.handNumber))
		.limit(limit);

	if (hands.length === 0) return [];

	const seatNames = await seatUsernames(gameId);

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
			username: seatNames.get(seat) ?? null
		});
		byHand.set(row.handId, winners);
	}

	return hands.map((hand) => ({ ...hand, winners: byHand.get(hand.id) ?? [] }));
}

export async function seatUsernames(gameId: string): Promise<Map<number, string>> {
	const rows = await db
		.select({ seat: schema.gamePlayer.seat, username: schema.user.username })
		.from(schema.gamePlayer)
		.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
		.where(eq(schema.gamePlayer.gameId, gameId));

	return new Map(rows.map((row) => [row.seat, row.username]));
}

/**
 * Loads one hand's events, filtered to what this viewer is allowed to see.
 *
 * Cards shown at showdown are public — everyone saw them at the table. A folded
 * player's cards stay hidden from everyone but their owner until the session
 * ends, so replay can never be used to spy on a hand still in play.
 */
export async function loadHandEvents(
	gameId: string,
	handNumber: number,
	viewerSeat: number | null,
	sessionEnded: boolean
): Promise<{ events: ReplayEvent[]; found: boolean }> {
	const [target] = await db
		.select({ id: schema.hand.id })
		.from(schema.hand)
		.where(and(eq(schema.hand.gameId, gameId), eq(schema.hand.handNumber, handNumber)));

	if (!target) return { events: [], found: false };

	const rows = await db
		.select({ payload: schema.handEvent.payload, seat: schema.handEvent.seat })
		.from(schema.handEvent)
		.where(eq(schema.handEvent.handId, target.id))
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

	return { events, found: true };
}
