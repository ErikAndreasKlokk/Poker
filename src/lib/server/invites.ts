import { desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import * as schema from '$lib/server/db/schema';
import { generateInviteCode } from './invite-code';

// Two joins onto the same table: whoever made the code, and whoever spent it.
const creator = alias(schema.user, 'creator');
const claimer = alias(schema.user, 'claimer');

/**
 * Every code, newest first.
 *
 * Not filtered by creator: anyone signed in can make an invite, so the list is
 * shared and says who made each one. That is the whole accountability model —
 * there is no admin role, just a record.
 */
export async function listInvites() {
	return db
		.select({
			code: schema.invite.code,
			createdAt: schema.invite.createdAt,
			// Null for codes inserted by hand in SQL, which is how they were made
			// before this page existed.
			createdBy: creator.username,
			usedBy: claimer.username,
			usedAt: schema.invite.usedAt,
			expiresAt: schema.invite.expiresAt
		})
		.from(schema.invite)
		.leftJoin(creator, eq(creator.id, schema.invite.createdByUserId))
		.leftJoin(claimer, eq(claimer.id, schema.invite.usedByUserId))
		.orderBy(desc(schema.invite.createdAt));
}

export async function createInvite(userId: string) {
	// 31^6 codes against a handful of friends, so a collision is a curiosity
	// rather than a risk — but the code is a primary key, so handle it anyway.
	for (let attempt = 0; attempt < 5; attempt++) {
		const [created] = await db
			.insert(schema.invite)
			.values({ code: generateInviteCode(), createdByUserId: userId })
			.onConflictDoNothing()
			.returning();

		if (created) return created;
	}

	throw new Error('could not allocate a unique invite code');
}
