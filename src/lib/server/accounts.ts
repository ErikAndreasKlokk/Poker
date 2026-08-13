import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, ne, or, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	AccountProblem,
	normalizePhone,
	validatePassword,
	validateUsername,
	type AvatarType
} from '$lib/server/validation';

export * from '$lib/server/validation';

/** Keep these identical between register and login, or verification silently fails. */
const ARGON2_OPTIONS = {
	memoryCost: 19456,
	timeCost: 2,
	outputLen: 32,
	parallelism: 1
} as const;

// --- Registration ---------------------------------------------------------

export interface RegisterInput {
	username: string;
	phone: string;
	password: string;
	inviteCode: string;
	avatar?: { bytes: Buffer; mimeType: AvatarType };
}

/**
 * Creates an account, consuming an invite in the same transaction.
 *
 * The very first account may instead use BOOTSTRAP_INVITE_CODE, which only works
 * while the user table is empty — otherwise the site could never be seeded.
 */
export async function registerUser(input: RegisterInput): Promise<string> {
	const username = validateUsername(input.username);
	const phone = normalizePhone(input.phone);
	const password = validatePassword(input.password);
	const inviteCode = input.inviteCode.trim();
	if (!inviteCode) throw new AccountProblem('invalid_invite');

	const passwordHash = await hash(password, ARGON2_OPTIONS);
	const userId = crypto.randomUUID();

	await db.transaction(async (tx) => {
		const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(table.user);
		const isBootstrap =
			count === 0 && !!env.BOOTSTRAP_INVITE_CODE && inviteCode === env.BOOTSTRAP_INVITE_CODE;

		const clashes = await tx
			.select({ username: table.user.username, phone: table.user.phone })
			.from(table.user)
			.where(or(eq(table.user.username, username), eq(table.user.phone, phone)));

		if (clashes.some((c) => c.username === username)) throw new AccountProblem('username_taken');
		if (clashes.some((c) => c.phone === phone)) throw new AccountProblem('phone_taken');

		await tx.insert(table.user).values({ id: userId, username, phone, passwordHash });

		if (!isBootstrap) {
			// Conditional update, so two people racing the same code cannot both win.
			const [claimed] = await tx
				.update(table.invite)
				.set({ usedByUserId: userId, usedAt: new Date() })
				.where(
					and(
						eq(table.invite.code, inviteCode),
						isNull(table.invite.usedByUserId),
						or(isNull(table.invite.expiresAt), gt(table.invite.expiresAt, new Date()))
					)
				)
				.returning();
			if (!claimed) throw new AccountProblem('invalid_invite');
		}

		if (input.avatar) {
			await tx.insert(table.userAvatar).values({
				userId,
				mimeType: input.avatar.mimeType,
				bytes: input.avatar.bytes
			});
		}
	});

	return userId;
}

// --- Login ----------------------------------------------------------------

export async function verifyCredentials(
	rawUsername: string,
	password: string
): Promise<{ id: string; locale: string }> {
	const username = rawUsername.trim();
	const [existing] = await db
		.select({
			id: table.user.id,
			passwordHash: table.user.passwordHash,
			locale: table.user.locale
		})
		.from(table.user)
		.where(eq(table.user.username, username));

	if (!existing) {
		// Hash anyway so a missing username costs the same time as a wrong password.
		await hash(password, ARGON2_OPTIONS);
		throw new AccountProblem('invalid_credentials');
	}

	const ok = await verify(existing.passwordHash, password, ARGON2_OPTIONS);
	if (!ok) throw new AccountProblem('invalid_credentials');

	return { id: existing.id, locale: existing.locale };
}

// --- Profile --------------------------------------------------------------

/**
 * Renames an account.
 *
 * Nothing stores a username as data — chat, hand history and the settlement all
 * join it live — so a rename shows up everywhere at once. The exception is a
 * table already in memory, which keeps the old name until the room is reloaded.
 */
export async function changeUsername(userId: string, raw: string): Promise<string> {
	const username = validateUsername(raw);

	// Excludes the account itself, so re-submitting an unchanged name is a no-op
	// rather than a collision with itself.
	const [taken] = await db
		.select({ id: table.user.id })
		.from(table.user)
		.where(and(eq(table.user.username, username), ne(table.user.id, userId)));

	if (taken) throw new AccountProblem('username_taken');

	await db.update(table.user).set({ username }).where(eq(table.user.id, userId));
	return username;
}

// --- Avatars --------------------------------------------------------------

export async function saveAvatar(userId: string, avatar: { bytes: Buffer; mimeType: AvatarType }) {
	await db
		.insert(table.userAvatar)
		.values({ userId, mimeType: avatar.mimeType, bytes: avatar.bytes })
		.onConflictDoUpdate({
			target: table.userAvatar.userId,
			set: { mimeType: avatar.mimeType, bytes: avatar.bytes, updatedAt: new Date() }
		});
}
