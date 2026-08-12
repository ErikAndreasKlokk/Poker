import { fail, redirect, type Actions } from '@sveltejs/kit';
import { createGame, findGameByCode, listGames } from '$lib/server/games';
import { GameProblem } from '$lib/server/validation';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The hooks guard already redirected anonymous visitors; this narrows the type.
	if (!locals.user) redirect(302, '/auth');
	return { games: await listGames(locals.user.id) };
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth');

		const data = await request.formData();
		const raw = Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));

		let code: string;
		try {
			const game = await createGame(locals.user.id, raw);
			code = game.code;
		} catch (error) {
			if (error instanceof GameProblem) return fail(400, { code: error.code });
			throw error;
		}

		redirect(303, `/games/${code}`);
	},

	join: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth');

		const data = await request.formData();
		const code = String(data.get('code') ?? '')
			.trim()
			.toUpperCase();

		const game = await findGameByCode(code);
		if (!game || game.status === 'ended') return fail(400, { code: 'game_not_found' });

		redirect(303, `/games/${game.code}`);
	}
};
