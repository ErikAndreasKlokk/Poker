// Relative imports throughout: this module is also pulled into the standalone
// WebSocket bundle, which cannot resolve SvelteKit's `$lib` alias.
import type { Card } from './poker/cards';
import type { Action, LegalActions, Street } from './poker/engine';

export type { Action, LegalActions, Street, Card };

// --- Client -> server -----------------------------------------------------

export type ClientMessage =
	| { type: 'sit'; seat: number }
	| { type: 'leave' }
	| { type: 'start' }
	| { type: 'act'; action: Action }
	| { type: 'chat'; body: string }
	| { type: 'ping' };

// --- Server -> client -----------------------------------------------------

export interface SeatView {
	seat: number;
	userId: string;
	username: string;
	stack: number;
	/** Chips committed on the current street, for rendering bet stacks. */
	committed: number;
	folded: boolean;
	allIn: boolean;
	sittingOut: boolean;
	/**
	 * Hole cards, present only when they belong to the recipient or have been
	 * revealed at showdown. Everyone else sees null and relies on `cardCount`.
	 */
	hole: Card[] | null;
	cardCount: number;
	/** Best-hand description, only after showdown. */
	handDescription: string | null;
	won: number;
}

export interface PotView {
	amount: number;
	eligibleSeats: number[];
}

export interface ChatView {
	id: number;
	userId: string | null;
	username: string;
	kind: 'chat' | 'reaction' | 'system';
	body: string;
	at: number;
}

export interface TableView {
	code: string;
	name: string;
	status: 'lobby' | 'running' | 'ended';
	hostUserId: string;
	realMoney: boolean;
	vippsBoksCode: string | null;
	voiceChatUrl: string | null;
	smallBlind: number;
	bigBlind: number;
	maxSeats: number;
	/** Length of the action clock, so the client can render it as a fraction. */
	turnSeconds: number;
	seats: SeatView[];
	board: Card[];
	/** Side-pot breakdown, only built once a hand is settled. */
	pots: PotView[];
	/**
	 * Chips in the middle from completed streets. Excludes the current street's
	 * bets, which are shown in front of each seat, so nothing is counted twice.
	 */
	potTotal: number;
	/** Highest amount committed on the current street. */
	currentBet: number;
	street: Street | null;
	button: number | null;
	toAct: number | null;
	/** Epoch ms when the acting player's clock runs out. */
	actionDeadline: number | null;
	handNumber: number | null;
	/** Legal actions, only ever sent to the player actually to act. */
	legal: LegalActions | null;
	you: { userId: string; username: string; seat: number | null };
}

export type ServerMessage =
	| { type: 'state'; table: TableView }
	| { type: 'chat'; message: ChatView }
	| { type: 'error'; message: string }
	| { type: 'pong' };
