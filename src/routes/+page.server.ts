import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Signed-in players have no reason to stop here — the lobby is the app.
	if (locals.user) redirect(303, '/games');
	return {};
};
