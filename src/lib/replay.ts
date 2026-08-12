import type { Card } from './poker/cards';
import type { Street } from './poker/engine';

/**
 * Rebuilds a playable timeline from the stored hand_event rows.
 *
 * The event log is written for crash recovery, and replay falls out of it for
 * free. Kept pure and client-safe so it can be unit-tested and also run in the
 * browser while scrubbing through a hand.
 */

export type ReplayEvent =
	| { type: 'hand_start'; button: number }
	| { type: 'post_blind'; seat: number; amount: number; blind: 'small' | 'big' }
	| { type: 'deal_hole'; seat: number; cards: Card[] }
	| { type: 'action'; seat: number; action: string; amount: number }
	| { type: 'deal_board'; street: Street; cards: Card[] }
	| { type: 'showdown'; seat: number; rank: number; description: string; cards: Card[] }
	| { type: 'payout'; seat: number; amount: number }
	| { type: 'hand_end' };

export interface ReplayFrame {
	/** What just happened, as message-key parts the UI translates. */
	kind: 'blind' | 'action' | 'board' | 'showdown' | 'payout';
	seat: number | null;
	action?: string;
	amount?: number;
	street: Street;
	board: Card[];
	/** Chips committed on the current street, by seat. */
	committed: Record<number, number>;
	/** Everything already in the middle from completed streets. */
	pot: number;
	folded: number[];
	/** Only the cards the viewer is allowed to see. */
	hole: Record<number, Card[]>;
	description?: string;
}

/**
 * @param events ordered hand events, already filtered for what the viewer may see
 */
export function buildFrames(events: readonly ReplayEvent[]): ReplayFrame[] {
	const frames: ReplayFrame[] = [];

	let street: Street = 'preflop';
	let board: Card[] = [];
	let pot = 0;
	let committed: Record<number, number> = {};
	const folded = new Set<number>();

	// Seeded before the walk rather than when the deal event is reached: the
	// engine posts blinds first, and a replay of a hand you already know should
	// show the cards from the opening frame instead of revealing them a beat late.
	const hole: Record<number, Card[]> = {};
	for (const event of events) {
		if (event.type === 'deal_hole') hole[event.seat] = [...event.cards];
	}

	/** Sweeps the street's bets into the pot, as happens between streets. */
	const collect = () => {
		pot += Object.values(committed).reduce((sum, value) => sum + value, 0);
		committed = {};
	};

	const snapshot = (
		partial: Pick<ReplayFrame, 'kind' | 'seat'> & Partial<ReplayFrame>
	): ReplayFrame => ({
		street,
		board: [...board],
		committed: { ...committed },
		pot,
		folded: [...folded].sort((a, b) => a - b),
		hole: structuredCloneish(hole),
		...partial
	});

	for (const event of events) {
		switch (event.type) {
			case 'deal_hole':
				// Already seeded above.
				break;

			case 'post_blind':
				committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
				frames.push(
					snapshot({ kind: 'blind', seat: event.seat, amount: event.amount, action: event.blind })
				);
				break;

			case 'action': {
				if (event.action === 'fold') folded.add(event.seat);
				// Calls record the chips actually paid, raises record the new street
				// total — the engine emits raise-to, so this must not accumulate.
				if (event.action === 'raise') committed[event.seat] = event.amount;
				else if (event.amount > 0) {
					committed[event.seat] = (committed[event.seat] ?? 0) + event.amount;
				}
				frames.push(
					snapshot({
						kind: 'action',
						seat: event.seat,
						action: event.action,
						amount: event.amount
					})
				);
				break;
			}

			case 'deal_board':
				collect();
				street = event.street;
				board = [...board, ...event.cards];
				frames.push(snapshot({ kind: 'board', seat: null }));
				break;

			case 'showdown':
				collect();
				hole[event.seat] = [...event.cards];
				frames.push(
					snapshot({ kind: 'showdown', seat: event.seat, description: event.description })
				);
				break;

			case 'payout':
				collect();
				frames.push(snapshot({ kind: 'payout', seat: event.seat, amount: event.amount }));
				break;

			case 'hand_start':
			case 'hand_end':
				break;
		}
	}

	return frames;
}

/** Shallow copy of the hole-card map, enough since the arrays are never mutated. */
function structuredCloneish(hole: Record<number, Card[]>): Record<number, Card[]> {
	const copy: Record<number, Card[]> = {};
	for (const [seat, cards] of Object.entries(hole)) copy[Number(seat)] = cards;
	return copy;
}

/** Total chips in the middle at a given frame, including the live street. */
export function frameTotal(frame: ReplayFrame): number {
	return frame.pot + Object.values(frame.committed).reduce((sum, value) => sum + value, 0);
}
