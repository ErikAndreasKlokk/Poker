import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Postgres `bytea`; drizzle has no built-in for it. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
	dataType: () => 'bytea'
});

/**
 * Money is stored in øre (1 NOK = 100 øre) as integers — never floats.
 * Chips are a separate integer scale from money: a game defines how many chips
 * one buy-in is worth, so play-money games use chips with no øre attached.
 */

export const pokerVariant = pgEnum('poker_variant', ['nlhe']);
export const gameStatus = pgEnum('game_status', ['lobby', 'running', 'ended']);
export const seatStatus = pgEnum('seat_status', ['active', 'sitting_out', 'left']);
export const ledgerType = pgEnum('ledger_type', ['buy_in', 'rebuy', 'cash_out']);
export const chatKind = pgEnum('chat_kind', ['chat', 'reaction', 'system']);

/**
 * Hand lifecycle events. This table is the source of truth for a hand in
 * progress — the in-memory engine can be rebuilt from it after a crash or
 * redeploy — and it doubles as the hand-history/replay log.
 */
export const handEventType = pgEnum('hand_event_type', [
	'hand_start',
	'post_blind',
	'deal_hole',
	'action',
	'deal_board',
	'showdown',
	'payout',
	'hand_end'
]);

// --- Identity -------------------------------------------------------------

export const user = pgTable('user', {
	id: text('id').primaryKey(),
	username: text('username').notNull().unique(),
	/**
	 * E.164, e.g. +4790000000. Collected at signup and never verified: Vipps Login
	 * would have verified it for free, but its API requires a business org number.
	 * Used to identify who to send money to when settling up after a session.
	 */
	phone: text('phone').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	locale: text('locale').notNull().default('nb'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

/**
 * Avatars live in their own table so ordinary user queries never drag the image
 * bytes along. At friend-group scale (a handful of 256px WebPs) this is far less
 * machinery than a PVC or an object store, and it rides along with DB backups.
 */
export const userAvatar = pgTable('user_avatar', {
	userId: text('user_id')
		.primaryKey()
		.references(() => user.id, { onDelete: 'cascade' }),
	mimeType: text('mime_type').notNull(),
	bytes: bytea('bytes').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
});

export const session = pgTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
});

/** Registration is invite-only: no valid unused code, no account. */
export const invite = pgTable('invite', {
	code: text('code').primaryKey(),
	createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
	usedByUserId: text('used_by_user_id').references(() => user.id, { onDelete: 'set null' }),
	usedAt: timestamp('used_at', { withTimezone: true }),
	expiresAt: timestamp('expires_at', { withTimezone: true }),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// --- Games ----------------------------------------------------------------

export const game = pgTable('game', {
	id: text('id').primaryKey(),
	/** Short human-shareable join code, also embedded in the invite link. */
	code: text('code').notNull().unique(),
	name: text('name').notNull(),
	variant: pokerVariant('variant').notNull().default('nlhe'),
	hostUserId: text('host_user_id')
		.notNull()
		.references(() => user.id),
	status: gameStatus('status').notNull().default('lobby'),

	/** When false this is a play-money game: no Boks, no ledger, no settlement. */
	realMoney: boolean('real_money').notNull().default(false),
	/**
	 * Vipps Boks code/link that players pay into. Vipps has no Boks API, so this
	 * is stored purely to render a link + QR — the app never sees the balance
	 * and cannot verify that anyone actually paid.
	 */
	vippsBoksCode: text('vipps_boks_code'),
	/** What one buy-in costs in øre. Null for play-money games. */
	buyInOre: integer('buy_in_ore'),

	smallBlind: integer('small_blind').notNull(),
	bigBlind: integer('big_blind').notNull(),
	startingStack: integer('starting_stack').notNull(),
	maxSeats: integer('max_seats').notNull().default(9),
	/** Seconds a player gets to act before the server auto-checks or auto-folds. */
	turnSeconds: integer('turn_seconds').notNull().default(30),
	/** Optional Discord/Meet link shown in the lobby — we don't host voice ourselves. */
	voiceChatUrl: text('voice_chat_url'),

	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	endedAt: timestamp('ended_at', { withTimezone: true })
});

export const gamePlayer = pgTable(
	'game_player',
	{
		id: text('id').primaryKey(),
		gameId: text('game_id')
			.notNull()
			.references(() => game.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		seat: integer('seat').notNull(),
		/** Current chip stack. Authoritative copy lives in memory during a hand. */
		stack: integer('stack').notNull().default(0),
		status: seatStatus('status').notNull().default('active'),
		joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
		leftAt: timestamp('left_at', { withTimezone: true })
	},
	(t) => [
		// Partial, so a departed row blocks nothing. Unconditional uniques made
		// leaving a one-way door: the player could never sit again, and the seat
		// itself was retired for the rest of the game.
		uniqueIndex('game_player_seat_unique')
			.on(t.gameId, t.seat)
			.where(sql`${t.leftAt} is null`),
		uniqueIndex('game_player_user_unique')
			.on(t.gameId, t.userId)
			.where(sql`${t.leftAt} is null`)
	]
);

// --- Hands ----------------------------------------------------------------

export const hand = pgTable(
	'hand',
	{
		id: text('id').primaryKey(),
		gameId: text('game_id')
			.notNull()
			.references(() => game.id, { onDelete: 'cascade' }),
		handNumber: integer('hand_number').notNull(),
		buttonSeat: integer('button_seat').notNull(),
		/** Community cards as e.g. ['Ah','Kd','7c','2s','Ts']. Grows as streets deal. */
		board: text('board').array().notNull().default([]),
		potTotal: integer('pot_total').notNull().default(0),
		startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
		endedAt: timestamp('ended_at', { withTimezone: true })
	},
	(t) => [unique('hand_number_unique').on(t.gameId, t.handNumber)]
);

export const handEvent = pgTable(
	'hand_event',
	{
		id: serial('id').primaryKey(),
		handId: text('hand_id')
			.notNull()
			.references(() => hand.id, { onDelete: 'cascade' }),
		seq: integer('seq').notNull(),
		type: handEventType('type').notNull(),
		/** Seat the event belongs to, when it belongs to one. */
		seat: integer('seat'),
		/**
		 * Event-specific detail. `deal_hole` payloads contain hole cards and must
		 * never be broadcast — they are filtered per-recipient and only revealed
		 * at showdown, or after the session ends for folded hands.
		 */
		payload: jsonb('payload').notNull().default({}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [
		unique('hand_event_seq_unique').on(t.handId, t.seq),
		index('hand_event_hand_idx').on(t.handId)
	]
);

// --- Chat -----------------------------------------------------------------

export const chatMessage = pgTable(
	'chat_message',
	{
		id: serial('id').primaryKey(),
		gameId: text('game_id')
			.notNull()
			.references(() => game.id, { onDelete: 'cascade' }),
		userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
		kind: chatKind('kind').notNull().default('chat'),
		body: text('body').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('chat_message_game_idx').on(t.gameId, t.createdAt)]
);

// --- Money ledger ---------------------------------------------------------

/**
 * Every real-money movement in or out of a game. Settlement ("who Vippser whom")
 * is derived from these rows at session end rather than stored, so a late
 * correction to a buy-in automatically reflows the whole settlement.
 */
export const ledgerEntry = pgTable(
	'ledger_entry',
	{
		id: serial('id').primaryKey(),
		gameId: text('game_id')
			.notNull()
			.references(() => game.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id),
		type: ledgerType('type').notNull(),
		/** Chips added to (buy_in/rebuy) or removed from (cash_out) the player's stack. */
		chips: integer('chips').notNull(),
		/** Matching real-money value in øre. */
		amountOre: integer('amount_ore').notNull(),
		/** Host or whoever recorded it — cash-outs are usually entered by the host. */
		recordedByUserId: text('recorded_by_user_id').references(() => user.id, {
			onDelete: 'set null'
		}),
		createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
	},
	(t) => [index('ledger_entry_game_idx').on(t.gameId)]
);

// --- Inferred types -------------------------------------------------------

export type User = typeof user.$inferSelect;
export type UserAvatar = typeof userAvatar.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Invite = typeof invite.$inferSelect;
export type Game = typeof game.$inferSelect;
export type GamePlayer = typeof gamePlayer.$inferSelect;
export type Hand = typeof hand.$inferSelect;
export type HandEvent = typeof handEvent.$inferSelect;
export type ChatMessage = typeof chatMessage.$inferSelect;
export type LedgerEntry = typeof ledgerEntry.$inferSelect;
