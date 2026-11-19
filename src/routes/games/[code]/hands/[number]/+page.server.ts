import { error, redirect } from '@sveltejs/kit';
import { findGameByCode } from '$lib/server/games';
import {
	findHand,
	hasPlayedIn,
	loadHandEvents,
	seatUsernames,
	viewerSeatForHand
} from '$lib/server/hands';
import { buildFrames } from '$lib/replay';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth');

	const game = await findGameByCode(params.code);
	if (!game) error(404, 'game_not_found');

	const handNumber = Number(params.number);
	if (!Number.isInteger(handNumber) || handNumber < 1) error(404, 'no_such_hand');

	const isHost = game.hostUserId === locals.user.id;
	if (!isHost && !(await hasPlayedIn(game.id, locals.user.id))) error(403, 'not_your_game');

	const hand = await findHand(game.id, handNumber);
	if (!hand) error(404, 'no_such_hand');
	// Never replay a hand still in play: its hole cards are already in the event log.
	if (!hand.endedAt) error(409, 'hand_in_progress');

	const viewerSeat = await viewerSeatForHand(game.id, locals.user.id, hand);
	const sessionEnded = game.status === 'ended';
	const events = await loadHandEvents(hand, viewerSeat, sessionEnded);
	const names = await seatUsernames(game.id, hand.startedAt);

	return {
		code: game.code,
		name: game.name,
		handNumber,
		sessionEnded,
		seatNames: Object.fromEntries(names),
		frames: buildFrames(events)
	};
};
