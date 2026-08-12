import type { Card, RandomInt } from './cards';
import { shuffledDeck } from './cards';
import { evaluate } from './evaluate';
import { awardPots, buildPots, seatOrderFrom, type Pot, type PotAward } from './pots';

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'complete';

export type Action =
	| { type: 'fold' }
	| { type: 'check' }
	| { type: 'call' }
	/** `to` is the total this seat will have committed on this street — raise-to semantics. */
	| { type: 'raise'; to: number };

export interface SeatConfig {
	seat: number;
	userId: string;
	stack: number;
}

export interface HandConfig {
	seats: SeatConfig[];
	button: number;
	smallBlind: number;
	bigBlind: number;
	/** Supply a fixed deck in tests; production leaves it undefined for a crypto shuffle. */
	deck?: Card[];
	rng?: RandomInt;
}

export interface Seat {
	seat: number;
	userId: string;
	stack: number;
	hole: Card[];
	/** Committed on the current street. */
	committed: number;
	/** Committed across the whole hand — this is what pots are built from. */
	totalCommitted: number;
	folded: boolean;
	allIn: boolean;
	/** Has acted at the current bet level; drives round completion. */
	hasActed: boolean;
	/**
	 * False when this seat is still entitled to re-raise. A short all-in that does
	 * not constitute a full raise deliberately leaves this true for seats that have
	 * already acted, so they may only call or fold.
	 */
	actedSinceFullRaise: boolean;
}

export type HandEvent =
	| { type: 'hand_start'; button: number }
	| { type: 'post_blind'; seat: number; amount: number; blind: 'small' | 'big' }
	| { type: 'deal_hole'; seat: number; cards: Card[] }
	| { type: 'action'; seat: number; action: string; amount: number }
	| { type: 'deal_board'; street: Street; cards: Card[] }
	| { type: 'showdown'; seat: number; rank: number; description: string; cards: Card[] }
	| { type: 'payout'; seat: number; amount: number }
	| { type: 'hand_end' };

export interface HandState {
	seats: Seat[];
	button: number;
	smallBlind: number;
	bigBlind: number;
	deck: Card[];
	deckIndex: number;
	board: Card[];
	street: Street;
	/** Seat that must act, or null when the hand needs no further action. */
	toAct: number | null;
	/** Highest total committed on this street. */
	currentBet: number;
	/** Size of the last full raise — the minimum legal raise increment. */
	minRaise: number;
	events: HandEvent[];
	pots: Pot[];
	awards: PotAward[];
	payouts: Map<number, number>;
}

export interface LegalActions {
	seat: number;
	canFold: boolean;
	canCheck: boolean;
	canCall: boolean;
	/** Chips needed to call, already capped at the seat's stack. */
	callAmount: number;
	canRaise: boolean;
	/** Smallest legal raise-to. Equals maxRaiseTo when the seat can only shove short. */
	minRaiseTo: number;
	maxRaiseTo: number;
}

// --- Starting a hand ------------------------------------------------------

export function startHand(config: HandConfig): HandState {
	const { button, smallBlind, bigBlind } = config;
	if (config.seats.length < 2) throw new Error('a hand needs at least two seats');

	const seats: Seat[] = config.seats
		.map((s) => ({
			seat: s.seat,
			userId: s.userId,
			stack: s.stack,
			hole: [] as Card[],
			committed: 0,
			totalCommitted: 0,
			folded: false,
			allIn: false,
			hasActed: false,
			actedSinceFullRaise: false
		}))
		.sort((a, b) => a.seat - b.seat);

	const state: HandState = {
		seats,
		button,
		smallBlind,
		bigBlind,
		deck: config.deck ?? shuffledDeck(config.rng),
		deckIndex: 0,
		board: [],
		street: 'preflop',
		toAct: null,
		currentBet: bigBlind,
		minRaise: bigBlind,
		events: [{ type: 'hand_start', button }],
		pots: [],
		awards: [],
		payouts: new Map()
	};

	const seatNumbers = seats.map((s) => s.seat);
	const order = seatOrderFrom(button, seatNumbers);
	const headsUp = seats.length === 2;

	// Heads-up inverts the blinds: the button posts the small blind and acts first preflop.
	const smallBlindSeat = headsUp ? button : order[0];
	const bigBlindSeat = headsUp ? order.find((s) => s !== button)! : order[1];

	postBlind(state, smallBlindSeat, smallBlind, 'small');
	postBlind(state, bigBlindSeat, bigBlind, 'big');

	dealHoleCards(state, order);

	const firstToAct = headsUp ? smallBlindSeat : order[2 % order.length];
	state.toAct = nextSeatToAct(state, firstToAct);

	// Everyone all-in from the blinds alone — nothing left to decide.
	if (state.toAct === null) runOut(state);

	return state;
}

function postBlind(state: HandState, seat: number, amount: number, blind: 'small' | 'big') {
	const s = seatOf(state, seat);
	const posted = Math.min(amount, s.stack);
	s.stack -= posted;
	s.committed += posted;
	s.totalCommitted += posted;
	if (s.stack === 0) s.allIn = true;
	state.events.push({ type: 'post_blind', seat, amount: posted, blind });
}

function dealHoleCards(state: HandState, order: readonly number[]) {
	for (let round = 0; round < 2; round++) {
		for (const seat of order) {
			seatOf(state, seat).hole.push(state.deck[state.deckIndex++]);
		}
	}
	for (const seat of order) {
		const s = seatOf(state, seat);
		state.events.push({ type: 'deal_hole', seat, cards: [...s.hole] });
	}
}

// --- Legal actions --------------------------------------------------------

export function legalActions(state: HandState): LegalActions | null {
	if (state.toAct === null) return null;
	const s = seatOf(state, state.toAct);

	const toCall = Math.min(state.currentBet - s.committed, s.stack);
	const maxRaiseTo = s.committed + s.stack;
	// A seat may always shove, even when the shove is smaller than a full raise.
	const canRaise = maxRaiseTo > state.currentBet && !s.actedSinceFullRaise;
	const minRaiseTo = Math.min(state.currentBet + state.minRaise, maxRaiseTo);

	return {
		seat: s.seat,
		canFold: true,
		canCheck: toCall === 0,
		canCall: toCall > 0,
		callAmount: toCall,
		canRaise,
		minRaiseTo,
		maxRaiseTo
	};
}

// --- Applying an action ---------------------------------------------------

export function applyAction(state: HandState, seat: number, action: Action): HandState {
	if (state.toAct !== seat) throw new Error(`seat ${seat} is not to act`);
	const legal = legalActions(state)!;
	const s = seatOf(state, seat);

	switch (action.type) {
		case 'fold': {
			s.folded = true;
			s.hasActed = true;
			state.events.push({ type: 'action', seat, action: 'fold', amount: 0 });
			break;
		}
		case 'check': {
			if (!legal.canCheck) throw new Error('cannot check facing a bet');
			s.hasActed = true;
			s.actedSinceFullRaise = true;
			state.events.push({ type: 'action', seat, action: 'check', amount: 0 });
			break;
		}
		case 'call': {
			if (!legal.canCall) throw new Error('nothing to call');
			commit(s, legal.callAmount);
			s.hasActed = true;
			s.actedSinceFullRaise = true;
			state.events.push({ type: 'action', seat, action: 'call', amount: legal.callAmount });
			break;
		}
		case 'raise': {
			if (!legal.canRaise) throw new Error('cannot raise');
			if (action.to > legal.maxRaiseTo) throw new Error('raise exceeds stack');
			if (action.to < legal.minRaiseTo) throw new Error('raise below minimum');

			const increment = action.to - state.currentBet;
			const isFullRaise = increment >= state.minRaise;

			commit(s, action.to - s.committed);
			state.currentBet = action.to;
			s.hasActed = true;
			s.actedSinceFullRaise = true;

			for (const other of state.seats) {
				if (other.seat === seat || other.folded || other.allIn) continue;
				// A full raise reopens the betting; a short all-in only forces a call.
				other.hasActed = false;
				if (isFullRaise) other.actedSinceFullRaise = false;
			}
			if (isFullRaise) state.minRaise = increment;

			state.events.push({ type: 'action', seat, action: 'raise', amount: action.to });
			break;
		}
	}

	advance(state);
	return state;
}

function commit(s: Seat, amount: number) {
	const paid = Math.min(amount, s.stack);
	s.stack -= paid;
	s.committed += paid;
	s.totalCommitted += paid;
	if (s.stack === 0) s.allIn = true;
}

// --- Progression ----------------------------------------------------------

function advance(state: HandState) {
	const live = state.seats.filter((s) => !s.folded);

	// Everyone folded to one player — no showdown, they take it.
	if (live.length === 1) {
		state.toAct = null;
		settle(state, false);
		return;
	}

	if (!bettingRoundComplete(state)) {
		state.toAct = nextSeatToAct(state, nextSeatAfter(state, state.toAct!));
		if (state.toAct !== null) return;
	}

	// No one left who can act: deal any remaining streets and show down.
	if (canStillAct(state).length <= 1 && allMatched(state)) {
		runOut(state);
		return;
	}

	nextStreet(state);
}

function bettingRoundComplete(state: HandState): boolean {
	return canStillAct(state).every((s) => s.hasActed && s.committed === state.currentBet);
}

function allMatched(state: HandState): boolean {
	return state.seats
		.filter((s) => !s.folded && !s.allIn)
		.every((s) => s.committed === state.currentBet && s.hasActed);
}

/** Seats that could still make a decision this street. */
function canStillAct(state: HandState): Seat[] {
	return state.seats.filter((s) => !s.folded && !s.allIn);
}

function nextStreet(state: HandState) {
	for (const s of state.seats) {
		s.committed = 0;
		s.hasActed = false;
		s.actedSinceFullRaise = false;
	}
	state.currentBet = 0;
	state.minRaise = state.bigBlind;

	dealStreet(state);
	if (state.street === 'complete') return;

	const order = seatOrderFrom(
		state.button,
		state.seats.map((s) => s.seat)
	);
	state.toAct = nextSeatToAct(state, order[0]);

	if (state.toAct === null) runOut(state);
}

function dealStreet(state: HandState) {
	switch (state.street) {
		case 'preflop':
			state.street = 'flop';
			state.board.push(...take(state, 3));
			break;
		case 'flop':
			state.street = 'turn';
			state.board.push(...take(state, 1));
			break;
		case 'turn':
			state.street = 'river';
			state.board.push(...take(state, 1));
			break;
		case 'river':
			settle(state, true);
			return;
	}
	state.events.push({
		type: 'deal_board',
		street: state.street,
		cards: state.board.slice(-(state.street === 'flop' ? 3 : 1))
	});
}

/** Deals out every remaining board card at once when no betting can follow. */
function runOut(state: HandState) {
	state.toAct = null;
	while (state.street !== 'river' && state.street !== 'complete') {
		dealStreet(state);
	}
	if (state.street === 'river') settle(state, true);
}

function take(state: HandState, count: number): Card[] {
	const cards = state.deck.slice(state.deckIndex, state.deckIndex + count);
	state.deckIndex += count;
	return cards;
}

// --- Settlement -----------------------------------------------------------

function settle(state: HandState, showdown: boolean) {
	const contributions = new Map(state.seats.map((s) => [s.seat, s.totalCommitted]));
	const folded = new Set(state.seats.filter((s) => s.folded).map((s) => s.seat));
	state.pots = buildPots(contributions, folded);

	const ranks = new Map<number, number>();
	for (const s of state.seats) {
		if (s.folded) continue;
		if (showdown) {
			const value = evaluate([...s.hole, ...state.board]);
			ranks.set(s.seat, value.rank);
			state.events.push({
				type: 'showdown',
				seat: s.seat,
				rank: value.rank,
				description: value.description,
				cards: [...s.hole]
			});
		} else {
			// Uncontested: the lone survivor wins without revealing.
			ranks.set(s.seat, 0);
		}
	}

	const order = seatOrderFrom(
		state.button,
		state.seats.map((s) => s.seat)
	);
	const { payouts, awards } = awardPots(state.pots, ranks, order);
	state.payouts = payouts;
	state.awards = awards;

	for (const [seat, amount] of payouts) {
		seatOf(state, seat).stack += amount;
		state.events.push({ type: 'payout', seat, amount });
	}

	state.street = 'complete';
	state.toAct = null;
	state.events.push({ type: 'hand_end' });
}

// --- Seat helpers ---------------------------------------------------------

function seatOf(state: HandState, seat: number): Seat {
	const s = state.seats.find((x) => x.seat === seat);
	if (!s) throw new Error(`no seat ${seat}`);
	return s;
}

function nextSeatAfter(state: HandState, seat: number): number {
	const index = state.seats.findIndex((s) => s.seat === seat);
	return state.seats[(index + 1) % state.seats.length].seat;
}

/**
 * Walks forward from `from` (inclusive) to the next seat that still owes an action.
 * Returns null when the betting round is over.
 */
function nextSeatToAct(state: HandState, from: number): number | null {
	let seat = from;
	for (let i = 0; i < state.seats.length; i++) {
		const s = seatOf(state, seat);
		if (!s.folded && !s.allIn && !(s.hasActed && s.committed === state.currentBet)) {
			return seat;
		}
		seat = nextSeatAfter(state, seat);
	}
	return null;
}
