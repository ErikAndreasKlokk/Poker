import { and, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as schema from '../db/schema';
import type { Action } from '../../poker/engine';
import { applyAction, legalActions, startHand, type HandState } from '../../poker/engine';
import { evaluate } from '../../poker/evaluate';
import type { ChatView, SeatView, TableView } from '../../protocol';
import { cashOutAmounts } from '../settlement';

/** Delay between a hand finishing and the next one being dealt. */
const NEXT_HAND_DELAY_MS = 6000;

export interface RoomPlayer {
	userId: string;
	username: string;
	seat: number;
	stack: number;
	sittingOut: boolean;
	connections: number;
}

export class RoomError extends Error {}

/**
 * One live poker table.
 *
 * The room is the sole authority on hand state: it holds the cards, runs the
 * action clock, and only ever emits per-player views. Nothing here trusts a
 * client, and hole cards never leave the server except to their owner or at
 * showdown.
 */
export class GameRoom {
	readonly players = new Map<string, RoomPlayer>();
	private hand: HandState | null = null;
	private handId: string | null = null;
	private handNumber = 0;
	private button = -1;
	private persistedEvents = 0;
	private revealedSeats = new Set<number>();
	private actionDeadline: number | null = null;
	private actionTimer: NodeJS.Timeout | null = null;
	private nextHandTimer: NodeJS.Timeout | null = null;

	private constructor(
		private readonly db: Db,
		private game: schema.Game,
		/** Called whenever the table changed and views should be re-sent. */
		private readonly onChange: () => void
	) {}

	static async load(db: Db, code: string, onChange: () => void): Promise<GameRoom | null> {
		const [game] = await db.select().from(schema.game).where(eq(schema.game.code, code));
		if (!game) return null;

		const room = new GameRoom(db, game, onChange);

		const seated = await db
			.select({
				userId: schema.gamePlayer.userId,
				seat: schema.gamePlayer.seat,
				stack: schema.gamePlayer.stack,
				status: schema.gamePlayer.status,
				username: schema.user.username
			})
			.from(schema.gamePlayer)
			.innerJoin(schema.user, eq(schema.user.id, schema.gamePlayer.userId))
			.where(and(eq(schema.gamePlayer.gameId, game.id), isNull(schema.gamePlayer.leftAt)));

		for (const row of seated) {
			room.players.set(row.userId, {
				userId: row.userId,
				username: row.username,
				seat: row.seat,
				stack: row.stack,
				sittingOut: row.status === 'sitting_out',
				connections: 0
			});
		}

		// Hand numbering and the button live in memory during play, so they have to
		// be picked back up from the last recorded hand. Restarting the count would
		// collide with the unique (game_id, hand_number) index and reset the button.
		const [last] = await db
			.select({ handNumber: schema.hand.handNumber, buttonSeat: schema.hand.buttonSeat })
			.from(schema.hand)
			.where(eq(schema.hand.gameId, game.id))
			.orderBy(desc(schema.hand.handNumber))
			.limit(1);

		room.handNumber = last?.handNumber ?? 0;
		room.button = last?.buttonSeat ?? -1;

		return room;
	}

	/**
	 * Runs timer-driven work without letting a rejection reach the process.
	 * These callbacks have no caller to catch them, and an unhandled rejection
	 * here would take down every other table on the server too.
	 */
	private detach(label: string, work: () => Promise<unknown>) {
		work().catch((error) => console.error(`[room ${this.game.code}] ${label} failed`, error));
	}

	get code() {
		return this.game.code;
	}

	get isIdle() {
		return [...this.players.values()].every((p) => p.connections === 0);
	}

	// --- Presence ---------------------------------------------------------

	connect(userId: string) {
		const player = this.players.get(userId);
		if (player) {
			player.connections++;
			// Coming back cancels the sit-out that dropping out applied.
			player.sittingOut = false;
		}
		this.maybeResume();
	}

	/**
	 * Deals again when a running game has no hand in progress.
	 *
	 * Live hand state only exists in memory, so a restart or redeploy leaves a
	 * running game with none. Without this the table would look permanently
	 * frozen to everyone who reconnects. The same path covers a table that ran
	 * out of players and later got one back.
	 */
	private maybeResume() {
		if (this.game.status !== 'running' || this.hand || this.nextHandTimer) return;
		if (this.readyPlayers().length < 2) return;
		this.nextHandTimer = setTimeout(() => this.detach('resume', () => this.dealNextHand()), 1500);
	}

	/** A disconnected player sits out rather than blocking the table. */
	disconnect(userId: string) {
		const player = this.players.get(userId);
		if (!player) return;
		player.connections = Math.max(0, player.connections - 1);
		if (player.connections === 0 && this.hand) {
			player.sittingOut = true;
		}
		this.onChange();
	}

	// --- Seating ----------------------------------------------------------

	async sit(userId: string, username: string, seat: number) {
		if (this.game.status === 'ended') throw new RoomError('game_ended');
		if (this.players.has(userId)) throw new RoomError('already_seated');
		if (seat < 0 || seat >= this.game.maxSeats) throw new RoomError('bad_seat');
		if ([...this.players.values()].some((p) => p.seat === seat)) throw new RoomError('seat_taken');

		const stack = this.game.startingStack;

		await this.db.transaction(async (tx) => {
			await tx.insert(schema.gamePlayer).values({
				id: crypto.randomUUID(),
				gameId: this.game.id,
				userId,
				seat,
				stack
			});

			// A buy-in is real money leaving someone's pocket — record it immediately
			// so the settle-up is right even if the session ends abruptly.
			if (this.game.realMoney) {
				await tx.insert(schema.ledgerEntry).values({
					gameId: this.game.id,
					userId,
					type: 'buy_in',
					chips: stack,
					amountOre: this.game.buyInOre ?? 0,
					recordedByUserId: userId
				});
			}
		});

		this.players.set(userId, { userId, username, seat, stack, sittingOut: false, connections: 1 });
		this.onChange();
		// Someone joining a running table may be the second player it needed.
		this.maybeResume();
	}

	/**
	 * Tops a player's stack back up to a full buy-in's worth of chips.
	 *
	 * Only allowed while the player is not in the current hand: settlement writes
	 * the engine's final stacks back over the room's, so chips added mid-hand
	 * would simply be overwritten.
	 */
	async rebuy(userId: string) {
		const player = this.players.get(userId);
		if (!player) throw new RoomError('not_playing');
		if (this.game.status === 'ended') throw new RoomError('game_ended');
		if (this.hand?.seats.some((s) => s.seat === player.seat)) {
			throw new RoomError('wait_for_next_hand');
		}

		player.stack += this.game.startingStack;
		player.sittingOut = false;

		await this.db.transaction(async (tx) => {
			await tx
				.update(schema.gamePlayer)
				.set({ stack: player.stack, status: 'active' })
				.where(
					and(eq(schema.gamePlayer.gameId, this.game.id), eq(schema.gamePlayer.userId, userId))
				);

			if (this.game.realMoney) {
				await tx.insert(schema.ledgerEntry).values({
					gameId: this.game.id,
					userId,
					type: 'rebuy',
					chips: this.game.startingStack,
					amountOre: this.game.buyInOre ?? 0,
					recordedByUserId: userId
				});
			}
		});

		this.onChange();
		this.maybeResume();
	}

	/**
	 * Closes the session and records what everyone is cashing out.
	 *
	 * Converting chips to money happens exactly once, here, so the settlement is
	 * computed from a fixed set of ledger rows rather than from live stacks that
	 * could still move.
	 */
	async endSession(userId: string) {
		if (userId !== this.game.hostUserId) throw new RoomError('not_host');
		if (this.game.status === 'ended') throw new RoomError('game_ended');
		if (this.hand && this.hand.street !== 'complete') throw new RoomError('hand_in_progress');

		this.clearTimers();
		this.hand = null;

		if (this.game.realMoney) {
			const rows = await this.db
				.select({ type: schema.ledgerEntry.type, amountOre: schema.ledgerEntry.amountOre })
				.from(schema.ledgerEntry)
				.where(eq(schema.ledgerEntry.gameId, this.game.id));

			const paidInOre = rows
				.filter((row) => row.type !== 'cash_out')
				.reduce((sum, row) => sum + row.amountOre, 0);

			const stacks = new Map([...this.players.values()].map((p) => [p.userId, p.stack]));
			const amounts = cashOutAmounts(
				stacks,
				this.game.buyInOre ?? 0,
				this.game.startingStack,
				paidInOre
			);

			await this.db.insert(schema.ledgerEntry).values(
				[...amounts].map(([cashOutUserId, amountOre]) => ({
					gameId: this.game.id,
					userId: cashOutUserId,
					type: 'cash_out' as const,
					chips: this.players.get(cashOutUserId)?.stack ?? 0,
					amountOre,
					recordedByUserId: userId
				}))
			);
		}

		await this.db
			.update(schema.game)
			.set({ status: 'ended', endedAt: new Date() })
			.where(eq(schema.game.id, this.game.id));
		this.game = { ...this.game, status: 'ended' };

		this.onChange();
	}

	async leave(userId: string) {
		const player = this.players.get(userId);
		if (!player) return;
		if (this.hand && this.seatIsLive(player.seat)) {
			// Mid-hand: fold them rather than yanking chips out of a live pot.
			if (this.hand.toAct === player.seat) await this.act(userId, { type: 'fold' });
			player.sittingOut = true;
			this.onChange();
			return;
		}

		this.players.delete(userId);
		await this.db
			.update(schema.gamePlayer)
			.set({ leftAt: new Date(), status: 'left' })
			.where(and(eq(schema.gamePlayer.gameId, this.game.id), eq(schema.gamePlayer.userId, userId)));
		this.onChange();
	}

	// --- Hand lifecycle ---------------------------------------------------

	async start(userId: string) {
		if (userId !== this.game.hostUserId) throw new RoomError('not_host');
		if (this.game.status === 'running') throw new RoomError('already_running');
		if (this.readyPlayers().length < 2) throw new RoomError('need_two_players');

		await this.db
			.update(schema.game)
			.set({ status: 'running' })
			.where(eq(schema.game.id, this.game.id));
		this.game = { ...this.game, status: 'running' };

		await this.dealNextHand();
	}

	private readyPlayers() {
		return [...this.players.values()]
			.filter((p) => !p.sittingOut && p.stack > 0)
			.sort((a, b) => a.seat - b.seat);
	}

	private async dealNextHand() {
		this.clearTimers();
		const ready = this.readyPlayers();
		if (ready.length < 2) {
			this.hand = null;
			this.onChange();
			return;
		}

		// Move the button to the next occupied seat.
		const seats = ready.map((p) => p.seat);
		this.button = seats.find((s) => s > this.button) ?? seats[0];
		this.handNumber++;
		this.revealedSeats.clear();
		this.persistedEvents = 0;

		this.hand = startHand({
			seats: ready.map((p) => ({ seat: p.seat, userId: p.userId, stack: p.stack })),
			button: this.button,
			smallBlind: this.game.smallBlind,
			bigBlind: this.game.bigBlind
		});

		this.handId = crypto.randomUUID();
		await this.db.insert(schema.hand).values({
			id: this.handId,
			gameId: this.game.id,
			handNumber: this.handNumber,
			buttonSeat: this.button
		});

		await this.persistNewEvents();
		this.afterMutation();
	}

	async act(userId: string, action: Action) {
		const player = this.players.get(userId);
		if (!player || !this.hand) throw new RoomError('not_playing');
		if (this.hand.toAct !== player.seat) throw new RoomError('not_your_turn');

		applyAction(this.hand, player.seat, action);
		await this.persistNewEvents();
		this.afterMutation();
	}

	/** Fires when a player's clock runs out: check if it's free, otherwise fold. */
	private async actOnTimeout() {
		if (!this.hand || this.hand.toAct === null) return;
		const seat = this.hand.toAct;
		const legal = legalActions(this.hand);
		const player = [...this.players.values()].find((p) => p.seat === seat);
		if (!legal || !player) return;

		try {
			applyAction(this.hand, seat, legal.canCheck ? { type: 'check' } : { type: 'fold' });
			player.sittingOut = true;
			await this.persistNewEvents();
			this.afterMutation();
		} catch {
			// Engine rejected it — leave the table untouched rather than corrupting state.
		}
	}

	/** Shared tail of every state change: settle, re-arm the clock, broadcast. */
	private afterMutation() {
		this.clearTimers();

		if (this.hand && this.hand.street === 'complete') {
			this.detach('settle', () => this.settleHand());
			return;
		}

		if (this.hand && this.hand.toAct !== null) {
			this.actionDeadline = Date.now() + this.game.turnSeconds * 1000;
			this.actionTimer = setTimeout(
				() => this.detach('action timeout', () => this.actOnTimeout()),
				this.game.turnSeconds * 1000
			);
		} else {
			this.actionDeadline = null;
		}

		this.onChange();
	}

	private async settleHand() {
		const hand = this.hand;
		if (!hand || !this.handId) return;

		this.actionDeadline = null;
		for (const event of hand.events) {
			if (event.type === 'showdown') this.revealedSeats.add(event.seat);
		}

		// Push final stacks back to the players and the database.
		for (const player of this.players.values()) {
			const seat = hand.seats.find((s) => s.seat === player.seat);
			if (seat) player.stack = seat.stack;
		}

		await this.db.transaction(async (tx) => {
			for (const player of this.players.values()) {
				await tx
					.update(schema.gamePlayer)
					.set({ stack: player.stack })
					.where(
						and(
							eq(schema.gamePlayer.gameId, this.game.id),
							eq(schema.gamePlayer.userId, player.userId)
						)
					);
			}
			await tx
				.update(schema.hand)
				.set({
					board: hand.board,
					potTotal: hand.pots.reduce((sum, p) => sum + p.amount, 0),
					endedAt: new Date()
				})
				.where(eq(schema.hand.id, this.handId!));
		});

		this.onChange();

		this.nextHandTimer = setTimeout(
			() => this.detach('next hand', () => this.dealNextHand()),
			NEXT_HAND_DELAY_MS
		);
	}

	private async persistNewEvents() {
		const hand = this.hand;
		if (!hand || !this.handId) return;

		const pending = hand.events.slice(this.persistedEvents);
		if (pending.length === 0) return;

		const rows = pending.map((event, i) => ({
			handId: this.handId!,
			seq: this.persistedEvents + i,
			type: event.type,
			seat: 'seat' in event ? event.seat : null,
			payload: event as unknown as Record<string, unknown>
		}));

		this.persistedEvents += pending.length;
		await this.db.insert(schema.handEvent).values(rows);
	}

	private seatIsLive(seat: number) {
		const s = this.hand?.seats.find((x) => x.seat === seat);
		return !!s && !s.folded;
	}

	private clearTimers() {
		if (this.actionTimer) clearTimeout(this.actionTimer);
		if (this.nextHandTimer) clearTimeout(this.nextHandTimer);
		this.actionTimer = null;
		this.nextHandTimer = null;
	}

	dispose() {
		this.clearTimers();
	}

	// --- Chat -------------------------------------------------------------

	async chat(userId: string, body: string): Promise<ChatView> {
		const player = this.players.get(userId);
		const trimmed = body.trim().slice(0, 500);
		if (!trimmed) throw new RoomError('empty_message');

		const [row] = await this.db
			.insert(schema.chatMessage)
			.values({ gameId: this.game.id, userId, kind: 'chat', body: trimmed })
			.returning();

		return {
			id: row.id,
			userId,
			username: player?.username ?? '',
			kind: 'chat',
			body: trimmed,
			at: row.createdAt.getTime()
		};
	}

	// --- Views ------------------------------------------------------------

	/**
	 * Projects the table for one recipient. This is the only path by which state
	 * reaches a client, so it is the single place hole cards can leak — every
	 * other seat's cards are replaced by a count.
	 */
	viewFor(userId: string, username: string): TableView {
		const hand = this.hand;
		const me = this.players.get(userId);

		const seats: SeatView[] = [...this.players.values()]
			.sort((a, b) => a.seat - b.seat)
			.map((player) => {
				const handSeat = hand?.seats.find((s) => s.seat === player.seat);
				const isMine = player.userId === userId;
				const revealed = this.revealedSeats.has(player.seat);
				const hole = handSeat?.hole ?? [];
				const showCards = isMine || revealed;

				return {
					seat: player.seat,
					userId: player.userId,
					username: player.username,
					stack: handSeat?.stack ?? player.stack,
					committed: handSeat?.committed ?? 0,
					folded: handSeat?.folded ?? false,
					allIn: handSeat?.allIn ?? false,
					sittingOut: player.sittingOut,
					hole: showCards && hole.length ? hole : null,
					cardCount: hole.length,
					handDescription:
						revealed && hole.length && hand?.board.length === 5
							? evaluate([...hole, ...hand.board]).description
							: null,
					won: hand?.payouts.get(player.seat) ?? 0
				};
			});

		const myTurn = !!hand && me != null && hand.toAct === me.seat;

		// Settled pots are authoritative once they exist; mid-hand we derive the
		// pot from committed chips, minus the current street shown at each seat.
		const potTotal = hand
			? hand.pots.length > 0
				? hand.pots.reduce((sum, p) => sum + p.amount, 0)
				: hand.seats.reduce((sum, s) => sum + s.totalCommitted - s.committed, 0)
			: 0;

		return {
			code: this.game.code,
			name: this.game.name,
			status: this.game.status,
			hostUserId: this.game.hostUserId,
			realMoney: this.game.realMoney,
			vippsBoksCode: this.game.vippsBoksCode,
			voiceChatUrl: this.game.voiceChatUrl,
			smallBlind: this.game.smallBlind,
			bigBlind: this.game.bigBlind,
			maxSeats: this.game.maxSeats,
			turnSeconds: this.game.turnSeconds,
			seats,
			board: hand?.board ?? [],
			pots: hand?.pots.map((p) => ({ amount: p.amount, eligibleSeats: p.eligibleSeats })) ?? [],
			potTotal,
			currentBet: hand?.currentBet ?? 0,
			street: hand?.street ?? null,
			button: hand ? hand.button : null,
			toAct: hand?.toAct ?? null,
			actionDeadline: this.actionDeadline,
			handNumber: hand ? this.handNumber : null,
			legal: myTurn ? legalActions(hand) : null,
			you: { userId, username, seat: me?.seat ?? null }
		};
	}
}
