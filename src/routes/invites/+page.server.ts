import { redirect, type Actions } from '@sveltejs/kit';
import { createInvite, listInvites } from '$lib/server/invites';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The hooks guard already redirected anonymous visitors; this narrows the type.
	if (!locals.user) redirect(302, '/auth');
	return { invites: await listInvites() };
};

export const actions: Actions = {
	create: async ({ locals }) => {
		if (!locals.user) redirect(302, '/auth');

		const invite = await createInvite(locals.user.id);
		// Returned so the page can point at the code that was just made, rather
		// than leaving it to be found in a list that is about to get long.
		return { created: invite.code };
	}
};
