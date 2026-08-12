import { fail, redirect, type Actions } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';
import {
	AccountProblem,
	readAvatarUpload,
	registerUser,
	verifyCredentials
} from '$lib/server/accounts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	if (event.locals.user) redirect(302, '/');
	return {};
};

/** Turns an AccountProblem into a form error; anything else is a real bug. */
function problem(error: unknown, form: 'login' | 'register') {
	if (error instanceof AccountProblem) return fail(400, { form, code: error.code });
	throw error;
}

async function startSession(event: Parameters<Actions[string]>[0], userId: string) {
	const token = auth.generateSessionToken();
	const session = await auth.createSession(token, userId);
	auth.setSessionTokenCookie(event, token, session.expiresAt);
}

export const actions: Actions = {
	login: async (event) => {
		const data = await event.request.formData();
		const username = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');

		let userId: string;
		try {
			userId = await verifyCredentials(username, password);
		} catch (error) {
			return problem(error, 'login');
		}

		await startSession(event, userId);
		redirect(302, '/');
	},

	register: async (event) => {
		const data = await event.request.formData();
		const avatarFile = data.get('avatar');

		let userId: string;
		try {
			const avatar =
				avatarFile instanceof File && avatarFile.size > 0
					? await readAvatarUpload(avatarFile)
					: undefined;

			userId = await registerUser({
				username: String(data.get('username') ?? ''),
				phone: String(data.get('phone') ?? ''),
				password: String(data.get('password') ?? ''),
				inviteCode: String(data.get('invite') ?? ''),
				avatar
			});
		} catch (error) {
			return problem(error, 'register');
		}

		await startSession(event, userId);
		redirect(302, '/');
	}
};
