import { error, redirect } from '@sveltejs/kit';
import { findGameByCode } from '$lib/server/games';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user) redirect(302, '/auth');

	const game = await findGameByCode(params.code);
	if (!game) error(404, 'game_not_found');

	// Everything else about the table arrives over the socket; this load exists
	// only to 404 early and to give the page its join code.
	return { code: game.code, name: game.name };
};
