import { redirect } from '@sveltejs/kit';
import { playMoneyLeaderboard, realMoneyLeaderboard } from '$lib/server/leaderboard';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// The hooks guard already redirected anonymous visitors; this narrows the type.
	if (!locals.user) redirect(302, '/auth');

	// Real money is the default board: it is the one with something at stake.
	const mode = url.searchParams.get('mode') === 'play' ? 'play' : 'money';
	const page = url.searchParams.get('page');

	const board =
		mode === 'play' ? await playMoneyLeaderboard(page) : await realMoneyLeaderboard(page);

	return { mode, ...board };
};
