import { fail, redirect, type Actions } from '@sveltejs/kit';
import { AccountProblem, changeUsername, readAvatarUpload, saveAvatar } from '$lib/server/accounts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// The hooks guard already redirected anonymous visitors; this narrows the type.
	if (!locals.user) redirect(302, '/auth');
	return { userId: locals.user.id, username: locals.user.username };
};

export const actions: Actions = {
	username: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth');

		const data = await request.formData();
		try {
			const username = await changeUsername(locals.user.id, String(data.get('username') ?? ''));
			return { username, saved: 'username' as const };
		} catch (error) {
			if (error instanceof AccountProblem) return fail(400, { code: error.code });
			throw error;
		}
	},

	avatar: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/auth');

		const data = await request.formData();
		const file = data.get('avatar');
		if (!(file instanceof File)) return fail(400, { code: 'invalid_avatar' });

		try {
			await saveAvatar(locals.user.id, await readAvatarUpload(file));
			return { saved: 'avatar' as const };
		} catch (error) {
			if (error instanceof AccountProblem) return fail(400, { code: error.code });
			throw error;
		}
	}
};
