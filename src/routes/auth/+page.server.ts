import { fail, redirect, type Actions } from '@sveltejs/kit';
import * as auth from '$lib/server/auth';
import {
	AccountProblem,
	readAvatarUpload,
	registerUser,
	verifyCredentials
} from '$lib/server/accounts';
import { cookieName as localeCookieName } from '$lib/paraglide/runtime';
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

		let account: { id: string; locale: string };
		try {
			account = await verifyCredentials(username, password);
		} catch (error) {
			return problem(error, 'login');
		}

		// Apply the saved language on a device that has no preference yet, so
		// signing in elsewhere lands in the right one. If this browser already has
		// a locale set, that was a deliberate choice — possibly made on the login
		// page a moment ago — and it wins.
		if (!event.cookies.get(localeCookieName)) {
			event.cookies.set(localeCookieName, account.locale, {
				path: '/',
				httpOnly: false,
				sameSite: 'lax',
				maxAge: 60 * 60 * 24 * 365
			});
		}

		// 303 so the browser follows up with a GET rather than re-posting.
		await startSession(event, account.id);
		redirect(303, '/');
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
		redirect(303, '/');
	}
};
