import { describe, expect, it } from 'vitest';
import { freshDeck, type Card } from './cards';
import { applyAction, legalActions, startHand, type HandState } from './engine';

/**
 * Hole cards are dealt round-robin starting left of the button, two passes, then
 * the board. For a 3-handed table with the button on seat 0 the deal order is
 * seats 1, 2, 0 — so deck[0] is seat 1's first card and deck[6..10] is the board.
 */
function riggedDeck(cards: Card[]): Card[] {
	const rest = freshDeck().filter((c) => !cards.includes(c));
	return [...cards, ...rest];
}

function threeHanded(stacks = [1000, 1000, 1000], deck?: Card[]) {
	return startHand({
		seats: [
			{ seat: 0, userId: 'a', stack: stacks[0] },
			{ seat: 1, userId: 'b', stack: stacks[1] },
			{ seat: 2, userId: 'c', stack: stacks[2] }
		],
		button: 0,
		smallBlind: 10,
		bigBlind: 20,
		deck: deck ?? freshDeck()
	});
}

function totalChips(state: HandState): number {
	return state.seats.reduce((sum, s) => sum + s.stack + s.totalCommitted, 0);
}

describe('blinds and position', () => {
	it('posts blinds left of the button and gives UTG the first decision', () => {
		const state = threeHanded();

		expect(state.seats[1].committed).toBe(10);
		expect(state.seats[2].committed).toBe(20);
		expect(state.currentBet).toBe(20);
		expect(state.toAct).toBe(0);
	});

	it('inverts the blinds heads-up so the button posts the small blind and acts first', () => {
		const state = startHand({
			seats: [
				{ seat: 0, userId: 'a', stack: 1000 },
				{ seat: 1, userId: 'b', stack: 1000 }
			],
			button: 0,
			smallBlind: 10,
			bigBlind: 20,
			deck: freshDeck()
		});

		expect(state.seats[0].committed).toBe(10);
		expect(state.seats[1].committed).toBe(20);
		expect(state.toAct).toBe(0);
	});

	it('deals two hole cards to every seat', () => {
		const state = threeHanded();
		for (const seat of state.seats) expect(seat.hole).toHaveLength(2);
		// Six distinct cards off the top of the deck.
		const dealt = state.seats.flatMap((s) => s.hole);
		expect(new Set(dealt).size).toBe(6);
	});
});

describe('betting round mechanics', () => {
	it('gives the big blind an option to raise after everyone limps', () => {
		let state = threeHanded();
		state = applyAction(state, 0, { type: 'call' });
		state = applyAction(state, 1, { type: 'call' });

		expect(state.toAct).toBe(2);
		const legal = legalActions(state)!;
		expect(legal.canCheck).toBe(true);
		expect(legal.canRaise).toBe(true);
		expect(legal.minRaiseTo).toBe(40);
	});

	it('moves to the flop once the big blind checks the option', () => {
		let state = threeHanded();
		state = applyAction(state, 0, { type: 'call' });
		state = applyAction(state, 1, { type: 'call' });
		state = applyAction(state, 2, { type: 'check' });

		expect(state.street).toBe('flop');
		expect(state.board).toHaveLength(3);
		// First active seat left of the button acts first after the flop.
		expect(state.toAct).toBe(1);
		expect(state.currentBet).toBe(0);
	});

	it('raises the minimum raise to the size of the last full raise', () => {
		let state = threeHanded();
		state = applyAction(state, 0, { type: 'raise', to: 60 });

		expect(state.currentBet).toBe(60);
		expect(state.toAct).toBe(1);
		// Last raise was 40 over the big blind, so the next raise must be to 100.
		expect(legalActions(state)!.minRaiseTo).toBe(100);
	});

	it('rejects a raise below the minimum', () => {
		const state = threeHanded();
		expect(() => applyAction(state, 0, { type: 'raise', to: 30 })).toThrow(/below minimum/);
	});

	it('rejects a check when facing a bet', () => {
		const state = threeHanded();
		expect(() => applyAction(state, 0, { type: 'check' })).toThrow(/cannot check/);
	});

	it('rejects an action from a seat that is not to act', () => {
		const state = threeHanded();
		expect(() => applyAction(state, 1, { type: 'call' })).toThrow(/not to act/);
	});
});

describe('all-in rules', () => {
	it('does not reopen betting for a seat that already acted when an all-in is a short raise', () => {
		// Seat 1 can only reach 50 — a 10 raise over seat 0's 40, short of the 20 minimum.
		let state = threeHanded([1000, 50, 1000]);

		state = applyAction(state, 0, { type: 'raise', to: 40 });
		expect(state.toAct).toBe(1);

		const shortShove = legalActions(state)!;
		expect(shortShove.maxRaiseTo).toBe(50);
		expect(shortShove.canRaise).toBe(true);

		state = applyAction(state, 1, { type: 'raise', to: 50 });
		expect(state.seats[1].allIn).toBe(true);
		expect(state.currentBet).toBe(50);

		// Seat 2 has not acted yet, so the betting is still open to them.
		expect(state.toAct).toBe(2);
		expect(legalActions(state)!.canRaise).toBe(true);
		state = applyAction(state, 2, { type: 'fold' });

		// Seat 0 already acted and faced only a short raise: call or fold, no re-raise.
		expect(state.toAct).toBe(0);
		const reopened = legalActions(state)!;
		expect(reopened.canRaise).toBe(false);
		expect(reopened.callAmount).toBe(10);
	});

	it('runs the board out when no one can act any more', () => {
		let state = threeHanded([1000, 50, 1000]);
		state = applyAction(state, 0, { type: 'raise', to: 40 });
		state = applyAction(state, 1, { type: 'raise', to: 50 });
		state = applyAction(state, 2, { type: 'fold' });
		state = applyAction(state, 0, { type: 'call' });

		expect(state.street).toBe('complete');
		expect(state.board).toHaveLength(5);
		expect(state.toAct).toBeNull();
	});

	it('builds a side pot the short stack cannot win', () => {
		let state = threeHanded([300, 100, 200]);
		// Everyone gets it in preflop.
		state = applyAction(state, 0, { type: 'raise', to: 300 });
		state = applyAction(state, 1, { type: 'call' });
		state = applyAction(state, 2, { type: 'call' });

		expect(state.street).toBe('complete');
		// Main pot 300 (all three), then 200 between seats 0 and 2, then 100 back to seat 0.
		expect(state.pots.map((p) => p.eligibleSeats)).toEqual([[0, 1, 2], [0, 2], [0]]);
		expect(state.pots.reduce((sum, p) => sum + p.amount, 0)).toBe(600);
	});
});

describe('settlement', () => {
	it('awards the pot without a showdown when everyone folds', () => {
		let state = threeHanded();
		state = applyAction(state, 0, { type: 'fold' });
		state = applyAction(state, 1, { type: 'fold' });

		expect(state.street).toBe('complete');
		expect(state.payouts.get(2)).toBe(30);
		expect(state.seats[2].stack).toBe(1010);
		// No hole cards revealed when the hand ends before showdown.
		expect(state.events.some((e) => e.type === 'showdown')).toBe(false);
	});

	it('awards the pot to the best hand at showdown', () => {
		// Deal order for button 0 is seats 1, 2, 0 — twice — then the board.
		const deck = riggedDeck([
			'Kh',
			'Qh',
			'Ah', // first cards to seats 1, 2, 0
			'Kd',
			'Qd',
			'As', // second cards to seats 1, 2, 0
			'2c',
			'7d',
			'9s', // flop
			'Jc', // turn
			'3h' // river
		]);

		let state = threeHanded([1000, 1000, 1000], deck);
		state = applyAction(state, 0, { type: 'call' });
		state = applyAction(state, 1, { type: 'call' });
		state = applyAction(state, 2, { type: 'check' });
		for (const street of ['flop', 'turn', 'river']) {
			void street;
			state = applyAction(state, 1, { type: 'check' });
			state = applyAction(state, 2, { type: 'check' });
			state = applyAction(state, 0, { type: 'check' });
		}

		expect(state.street).toBe('complete');
		// Seat 0 holds aces against kings and queens.
		expect(state.payouts.get(0)).toBe(60);
		expect(state.seats[0].stack).toBe(1040);
	});

	it('conserves chips through a raised hand that reaches showdown', () => {
		let state = threeHanded();
		const before = totalChips(state);

		state = applyAction(state, 0, { type: 'call' });
		state = applyAction(state, 1, { type: 'call' });
		state = applyAction(state, 2, { type: 'raise', to: 80 });
		state = applyAction(state, 0, { type: 'call' });
		state = applyAction(state, 1, { type: 'fold' });

		// Seat 1 folded, so seat 2 is the first live seat left of the button.
		expect(state.street).toBe('flop');
		for (let street = 0; street < 3; street++) {
			state = applyAction(state, 2, { type: 'check' });
			state = applyAction(state, 0, { type: 'check' });
		}

		expect(state.street).toBe('complete');
		expect(state.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(before);
	});

	it('returns every chip to the players once the hand completes', () => {
		let state = threeHanded([300, 100, 200]);
		state = applyAction(state, 0, { type: 'raise', to: 300 });
		state = applyAction(state, 1, { type: 'call' });
		state = applyAction(state, 2, { type: 'call' });

		expect(state.street).toBe('complete');
		expect(state.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(600);
	});
});
