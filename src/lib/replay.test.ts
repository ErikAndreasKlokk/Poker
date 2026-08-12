import { describe, expect, it } from 'vitest';
import { buildFrames, frameTotal, type ReplayEvent } from './replay';

/** A three-handed hand: blinds, a raise, a call, a fold, flop, bet, fold. */
const events: ReplayEvent[] = [
	{ type: 'hand_start', button: 0 },
	{ type: 'post_blind', seat: 1, amount: 10, blind: 'small' },
	{ type: 'post_blind', seat: 2, amount: 20, blind: 'big' },
	{ type: 'deal_hole', seat: 0, cards: ['Ah', 'Kh'] },
	{ type: 'deal_hole', seat: 1, cards: ['7c', '2d'] },
	{ type: 'deal_hole', seat: 2, cards: ['Qs', 'Qd'] },
	{ type: 'action', seat: 0, action: 'raise', amount: 60 },
	{ type: 'action', seat: 1, action: 'fold', amount: 0 },
	{ type: 'action', seat: 2, action: 'call', amount: 40 },
	{ type: 'deal_board', street: 'flop', cards: ['2c', '7d', '9s'] },
	{ type: 'action', seat: 2, action: 'check', amount: 0 },
	{ type: 'action', seat: 0, action: 'raise', amount: 80 },
	{ type: 'action', seat: 2, action: 'fold', amount: 0 },
	{ type: 'payout', seat: 0, amount: 210 },
	{ type: 'hand_end' }
];

describe('buildFrames', () => {
	it('emits a frame per visible event, skipping deals and bookends', () => {
		const frames = buildFrames(events);
		// 2 blinds + 3 preflop actions + flop + 3 flop actions + payout
		expect(frames).toHaveLength(10);
		expect(frames.some((f) => f.kind === 'board')).toBe(true);
	});

	it('treats a raise as a street total and a call as chips paid', () => {
		const frames = buildFrames(events);

		const afterRaise = frames.find((f) => f.kind === 'action' && f.seat === 0)!;
		expect(afterRaise.committed[0]).toBe(60);

		// Seat 2 had 20 posted and calls 40 more, reaching the same 60.
		const afterCall = frames.find((f) => f.kind === 'action' && f.seat === 2)!;
		expect(afterCall.committed[2]).toBe(60);
	});

	it('sweeps bets into the pot when a street is dealt', () => {
		const frames = buildFrames(events);
		const flop = frames.find((f) => f.kind === 'board')!;

		// 60 + 60 + the small blind seat 1 abandoned.
		expect(flop.pot).toBe(130);
		expect(flop.committed).toEqual({});
		expect(flop.board).toEqual(['2c', '7d', '9s']);
	});

	it('tracks who has folded', () => {
		const frames = buildFrames(events);
		const last = frames[frames.length - 1];
		expect(last.folded).toEqual([1, 2]);
	});

	it('advances the street label with the board', () => {
		const frames = buildFrames(events);
		expect(frames[0].street).toBe('preflop');
		expect(frames[frames.length - 1].street).toBe('flop');
	});

	it('carries only the hole cards it was given', () => {
		const frames = buildFrames(events);
		expect(frames[frames.length - 1].hole).toEqual({
			0: ['Ah', 'Kh'],
			1: ['7c', '2d'],
			2: ['Qs', 'Qd']
		});
	});

	it('omits hole cards that were filtered out before replay', () => {
		const hidden = events.filter((e) => !(e.type === 'deal_hole' && e.seat !== 0));
		const frames = buildFrames(hidden);
		expect(Object.keys(frames[frames.length - 1].hole)).toEqual(['0']);
	});

	it('shows known hole cards from the opening frame', () => {
		// The engine posts blinds before dealing, but a replay should not withhold
		// cards the viewer is already entitled to see.
		const frames = buildFrames(events);
		expect(frames[0].hole[0]).toEqual(['Ah', 'Kh']);
	});

	it('keeps each frame independent of later mutations', () => {
		const frames = buildFrames(events);
		const first = frames[0];
		const last = frames[frames.length - 1];
		expect(first.board).toEqual([]);
		expect(last.board).toHaveLength(3);
		expect(first.folded).toEqual([]);
	});

	it('reaches the full pot by the payout frame', () => {
		const frames = buildFrames(events);
		const payout = frames.find((f) => f.kind === 'payout')!;
		// 130 from preflop plus seat 0's 80 bet on the flop.
		expect(frameTotal(payout)).toBe(210);
		expect(payout.amount).toBe(210);
	});

	it('handles a hand that reaches showdown', () => {
		const showdownHand: ReplayEvent[] = [
			{ type: 'hand_start', button: 0 },
			{ type: 'post_blind', seat: 0, amount: 10, blind: 'small' },
			{ type: 'post_blind', seat: 1, amount: 20, blind: 'big' },
			{ type: 'action', seat: 0, action: 'call', amount: 10 },
			{ type: 'action', seat: 1, action: 'check', amount: 0 },
			{ type: 'deal_board', street: 'flop', cards: ['2c', '7d', '9s'] },
			{ type: 'action', seat: 0, action: 'check', amount: 0 },
			{ type: 'action', seat: 1, action: 'check', amount: 0 },
			{ type: 'deal_board', street: 'turn', cards: ['Jc'] },
			{ type: 'action', seat: 0, action: 'check', amount: 0 },
			{ type: 'action', seat: 1, action: 'check', amount: 0 },
			{ type: 'deal_board', street: 'river', cards: ['3h'] },
			{ type: 'action', seat: 0, action: 'check', amount: 0 },
			{ type: 'action', seat: 1, action: 'check', amount: 0 },
			{ type: 'showdown', seat: 0, rank: 3382, description: 'One Pair', cards: ['Ah', 'Ad'] },
			{ type: 'showdown', seat: 1, rank: 5000, description: 'High Card', cards: ['Kh', 'Qd'] },
			{ type: 'payout', seat: 0, amount: 40 },
			{ type: 'hand_end' }
		];

		const frames = buildFrames(showdownHand);
		const showdowns = frames.filter((f) => f.kind === 'showdown');

		expect(showdowns).toHaveLength(2);
		expect(showdowns[0].description).toBe('One Pair');
		// Showdown reveals the cards even though no deal_hole was included.
		expect(showdowns[1].hole[1]).toEqual(['Kh', 'Qd']);
		expect(frames[frames.length - 1].board).toEqual(['2c', '7d', '9s', 'Jc', '3h']);
	});

	it('returns nothing for an empty log', () => {
		expect(buildFrames([])).toEqual([]);
	});
});
