<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { TableConnection } from '$lib/client/table.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import ChipStack from '$lib/components/ChipStack.svelte';
	import PlayingCard from '$lib/components/PlayingCard.svelte';
	import SeatSpot from '$lib/components/SeatSpot.svelte';
	import { denominationsFor } from '$lib/chips';
	import { REACTIONS, type Action, type ClientMessage, type SeatView } from '$lib/protocol';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let connection = $state<TableConnection | null>(null);
	let chatDraft = $state('');

	/** Seat being sat down at, while the buy-in amount is chosen. */
	let pendingSeat = $state<number | null>(null);
	let buyIn = $state(0);

	/**
	 * Whether the leave button is showing its confirmation.
	 *
	 * Cashing out mid-hand folds the hand and cannot be undone, so it takes two
	 * clicks — the button sits next to the chat, well within misclick range.
	 */
	let confirmingLeave = $state(false);

	// Keyed on the code so navigating straight from one table to another tears
	// down the old socket instead of leaving it open.
	$effect(() => {
		const live = new TableConnection(data.code);
		live.open();
		connection = live;
		return () => live.close();
	});

	const table = $derived(connection?.table ?? null);
	const chat = $derived(connection?.chat ?? []);
	const connected = $derived(connection?.connected ?? false);
	const socketError = $derived(connection?.error ?? null);

	// Chip colours are sized to this game, so a full stack is about eight chips
	// of the top denomination however deep the table plays.
	const denominations = $derived(
		table ? denominationsFor(table.startingStack, table.smallBlind) : [1]
	);

	/**
	 * Everything at stake right now, including the current street's bets.
	 *
	 * The pot proper only counts completed streets, which means preflop it reads
	 * as zero while the blinds sit in front of the players — technically right,
	 * but useless if what you want to know is what you are playing for.
	 */
	const potAtStake = $derived(
		table ? table.potTotal + table.seats.reduce((sum, seat) => sum + seat.committed, 0) : 0
	);

	const mySeat = $derived(table?.you.seat ?? null);
	const isHost = $derived(!!table && table.you.userId === table.hostUserId);
	const legal = $derived(table?.legal ?? null);
	const me = $derived(table?.seats.find((s) => s.userId === table.you.userId) ?? null);
	/** Busted players can top up, but only between hands. */
	const canRebuy = $derived(
		!!table && table.status !== 'ended' && me !== null && me.stack === 0 && table.toAct === null
	);

	const errorMessages: Record<string, () => string> = {
		not_host: m.error_not_host,
		hand_in_progress: m.error_hand_in_progress,
		wait_for_next_hand: m.error_wait_for_next_hand,
		not_playing: m.error_not_playing,
		seat_taken: m.error_seat_taken,
		already_seated: m.error_already_seated,
		need_two_players: m.error_need_two_players,
		not_your_turn: m.error_not_your_turn,
		game_ended: m.error_game_ended,
		invalid_buy_in: m.error_invalid_buy_in,
		already_at_max: m.error_already_at_max
	};
	const errorText = $derived(socketError ? (errorMessages[socketError]?.() ?? socketError) : null);

	// Ticks only while a clock is running, so an idle table stays quiet.
	let now = $state(Date.now());
	$effect(() => {
		if (!table?.actionDeadline) return;
		const id = setInterval(() => (now = Date.now()), 250);
		return () => clearInterval(id);
	});

	const msLeft = $derived(table?.actionDeadline ? Math.max(0, table.actionDeadline - now) : null);
	const secondsLeft = $derived(msLeft === null ? null : Math.ceil(msLeft / 1000));

	function seatAt(index: number): SeatView | undefined {
		return table?.seats.find((seat) => seat.seat === index);
	}

	/** Measured width of the felt, which drives how big the middle is drawn. */
	let feltWidth = $state(0);

	/**
	 * Board and pot scale with the felt.
	 *
	 * The seat ring sits at a fixed 30% of the felt's height above and below the
	 * middle, and the felt keeps a fixed aspect ratio, so the space between them
	 * shrinks with the window while a fixed card size does not. At full size a
	 * river plus a pot label was taller than that gap and ran into the seats.
	 */
	const boardSize = $derived(feltWidth >= 880 ? 'lg' : feltWidth >= 620 ? 'md' : 'sm');
	const potChipSize = $derived(feltWidth >= 880 ? 'md' : 'sm');

	/**
	 * Rotates the table so the viewer always sits at the bottom, with the next
	 * seat to act running clockwise from there — the way it looks in person.
	 *
	 * The radii are percentages of a landscape felt, so seats spread out along
	 * the long axis rather than stacking up as they did in the old tall column.
	 */
	function positionFor(index: number, count: number) {
		const offset = mySeat ?? 0;
		const slot = (index - offset + count) % count;
		const angle = Math.PI / 2 + (slot / count) * Math.PI * 2;
		// Kept well inside the rim vertically: a seat is roughly 200px tall once
		// cards, plate and wager are stacked, so half of it hangs below its centre
		// point and a larger radius pushes the bottom seat off the felt.
		return {
			left: 50 + 40 * Math.cos(angle),
			top: 50 + 30 * Math.sin(angle)
		};
	}

	function send(message: ClientMessage) {
		connection?.send(message);
	}

	function act(action: Action) {
		send({ type: 'act', action });
	}

	function leaveTable() {
		confirmingLeave = false;
		send({ type: 'leave' });
	}

	/** Opens the buy-in chooser rather than sitting down straight away. */
	function chooseSeat(seat: number) {
		if (!table) return;
		pendingSeat = seat;
		buyIn = table.startingStack;
	}

	function confirmSeat() {
		if (pendingSeat === null) return;
		send({ type: 'sit', seat: pendingSeat, buyIn });
		pendingSeat = null;
	}

	function sendChat(event: SubmitEvent) {
		event.preventDefault();
		const body = chatDraft.trim();
		if (!body) return;
		send({ type: 'chat', body });
		chatDraft = '';
	}
</script>

<svelte:head><title>{data.name} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 pt-4 pb-4 lg:px-6">
	<header class="flex items-center justify-between gap-4">
		<div class="min-w-0">
			<h1 class="truncate font-arcade text-base text-gold lg:text-xl">{data.name}</h1>
			<p class="mt-1 text-sm text-muted">{m.table_share({ code: data.code })}</p>
		</div>
		<a href={resolve('/games')} class="px-btn shrink-0 px-4 py-2 text-sm font-bold">
			{m.lobby_title()}
		</a>
	</header>

	{#if !connected}
		<p class="px-panel border-gold px-3 py-2 text-sm text-gold">
			{table ? m.table_disconnected() : m.table_connecting()}
		</p>
	{/if}

	{#if errorText}
		<p class="px-panel border-danger px-3 py-2 text-sm text-danger" role="alert">
			{errorText}
		</p>
	{/if}

	{#if table}
		<!--
			Two columns on a desktop screen: the table itself gets the space, and
			everything you read rather than play sits alongside it. Stacks back into
			one column on a narrow window.
		-->
		<div class="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
			<div class="flex min-w-0 flex-col gap-4">
				<!-- The felt: seats arranged around the rim, board and pot in the middle. -->
				<section
					bind:clientWidth={feltWidth}
					class="px-felt relative aspect-4/5 w-full sm:aspect-7/5"
				>
					<!-- Held to 60% of the felt so a full board and a side-pot row still
					     leave the seat ring its own space. -->
					<div
						class="absolute top-1/2 left-1/2 flex max-h-[60%] w-full -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1.5 px-2"
					>
						{#if table.handNumber}
							<span class="font-arcade text-[0.65rem] tracking-widest text-emerald-200/80">
								{m.table_hand_number({ number: table.handNumber })}
							</span>
						{/if}

						<!--
							Only rendered once there are cards. Reserving the space preflop
							pushed the pot down into the bottom seat's hole cards.
						-->
						{#if table.board.length > 0}
							<div class="flex items-center gap-1.5 sm:gap-2">
								{#each table.board as card (card)}
									<PlayingCard {card} size={boardSize} />
								{/each}
							</div>
						{/if}

						{#if potAtStake > 0}
							<!-- The pot as a real pile, so its size is visible at a glance. -->
							<div class="flex flex-col items-center gap-1">
								<ChipStack
									amount={potAtStake}
									{denominations}
									size={potChipSize}
									maxPerColumn={4}
									showTotal={false}
								/>
								<span
									class="border-2 border-felt-dark bg-ink/70 px-3 py-1.5 font-arcade text-xs text-gold tabular-nums"
								>
									{m.table_pot()}
									{potAtStake}
								</span>
							</div>
						{/if}

						{#if table.pots.length > 1}
							<div class="flex flex-wrap justify-center gap-1">
								{#each table.pots.slice(1) as pot, i (i)}
									<span class="border-2 border-felt-dark bg-ink/60 px-2 py-1 text-xs">
										{m.table_side_pot()}
										{pot.amount}
									</span>
								{/each}
							</div>
						{/if}
					</div>

					{#if pendingSeat !== null}
						{@const min = Math.min(table.bigBlind, table.startingStack)}
						<!-- Sits on top of the felt so the table stays visible behind it. -->
						<div
							class="px-panel absolute top-1/2 left-1/2 z-30 flex w-64 -translate-x-1/2 -translate-y-1/2 flex-col gap-3 p-4"
						>
							<span class="font-arcade text-xs text-gold">{m.table_buy_in_title()}</span>

							<input
								type="number"
								bind:value={buyIn}
								{min}
								max={table.startingStack}
								step="1"
								class="px-field px-num w-full px-3 py-2 text-lg"
							/>
							<input
								type="range"
								bind:value={buyIn}
								{min}
								max={table.startingStack}
								step="1"
								class="h-8 w-full accent-gold"
								aria-label={m.table_buy_in_title()}
							/>

							<span class="text-xs text-muted">
								{m.table_buy_in_range({ min, max: table.startingStack })}
							</span>

							<div class="grid grid-cols-2 gap-2">
								<button
									type="button"
									onclick={() => (pendingSeat = null)}
									class="px-btn py-2 text-sm font-bold"
								>
									{m.table_cancel()}
								</button>
								<button
									type="button"
									disabled={buyIn < min || buyIn > table.startingStack}
									onclick={confirmSeat}
									class="px-btn px-btn-primary py-2 text-sm font-bold"
								>
									{m.table_buy_in_confirm()}
								</button>
							</div>
						</div>
					{/if}

					{#each Array.from({ length: table.maxSeats }, (_, i) => i) as index (index)}
						{@const seat = seatAt(index)}
						{@const position = positionFor(index, table.maxSeats)}
						<div
							class="absolute -translate-x-1/2 -translate-y-1/2"
							style="left: {position.left}%; top: {position.top}%"
						>
							<SeatSpot
								{seat}
								{index}
								{denominations}
								isButton={table.button === index}
								isActing={table.toAct === index}
								isYou={seat?.userId === table.you.userId}
								canSit={mySeat === null && table.status !== 'ended'}
								betsAbove={position.top > 50}
								reaction={seat
									? (connection?.reactions.find((r) => r.userId === seat.userId) ?? null)
									: null}
								clock={table.toAct === index && msLeft !== null
									? Math.min(1, msLeft / (table.turnSeconds * 1000))
									: null}
								onsit={chooseSeat}
							/>
						</div>
					{/each}
				</section>

				{#if table.status === 'lobby'}
					{#if isHost}
						<button
							type="button"
							disabled={table.seats.length < 2}
							onclick={() => send({ type: 'start' })}
							class="px-btn px-btn-primary py-4 font-bold"
						>
							{table.seats.length < 2 ? m.table_need_two() : m.table_start()}
						</button>
					{:else}
						<p class="py-2 text-center text-sm text-muted">{m.table_waiting_for_host()}</p>
					{/if}
				{:else if table.status === 'ended'}
					<p class="py-2 text-center text-sm text-muted">{m.table_ended()}</p>
				{/if}

				{#if canRebuy}
					<button
						type="button"
						onclick={() => send({ type: 'rebuy' })}
						class="px-btn py-3 font-bold text-success"
					>
						{m.table_rebuy()}
					</button>
				{/if}

				{#if legal}
					<ActionBar
						{legal}
						potTotal={table.potTotal}
						currentBet={table.currentBet}
						{secondsLeft}
						onact={act}
					/>
				{/if}
			</div>

			<!-- Everything you read rather than play: table info, links, conversation. -->
			<aside class="flex min-w-0 flex-col gap-3">
				{#if table.realMoney && table.vippsBoksCode}
					<p class="px-panel px-3 py-2 text-sm">
						<span class="font-bold">{m.table_boks()}:</span>
						<span class="font-mono">{table.vippsBoksCode}</span>
					</p>
				{/if}

				<div class="flex flex-col gap-2">
					{#if table.voiceChatUrl}
						<!-- Deliberately unresolved: this is an external link the host supplied. -->
						<!-- eslint-disable svelte/no-navigation-without-resolve -->
						<a
							href={table.voiceChatUrl}
							rel="noreferrer noopener"
							target="_blank"
							class="px-btn px-3 py-2 text-sm font-bold"
						>
							{m.table_voice()}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{/if}

					<a
						href={resolve('/games/[code]/hands', { code: data.code })}
						class="px-btn px-3 py-2 text-sm font-bold"
					>
						{m.hands_link()}
					</a>

					{#if table.realMoney || table.status === 'ended'}
						<a
							href={resolve('/games/[code]/settlement', { code: data.code })}
							class="px-btn px-3 py-2 text-sm font-bold"
						>
							{m.table_settlement_link()}
						</a>
					{/if}

					<!-- Cashing out lives here rather than beside the action bar, which is
					     replaced by the betting controls on your turn — that left a running
					     game with no way out at all. -->
					{#if mySeat !== null && table.status !== 'ended'}
						{#if table.you.leaving}
							<p class="px-panel px-3 py-2 text-center text-sm text-muted">
								{m.table_cash_out_pending()}
							</p>
						{:else if confirmingLeave}
							<button
								type="button"
								onclick={leaveTable}
								class="px-btn px-3 py-2 text-sm font-bold text-danger"
							>
								{table.realMoney ? m.table_cash_out_confirm() : m.table_leave_confirm()}
							</button>
						{:else}
							<button
								type="button"
								onclick={() => (confirmingLeave = true)}
								class="px-btn px-3 py-2 text-sm font-bold"
							>
								{table.realMoney ? m.table_cash_out() : m.table_leave()}
							</button>
						{/if}
					{/if}

					<!-- Also offered before the first hand: a game that never started still
					     needs a way to be closed, or it sits in the lobby forever. -->
					{#if isHost && table.status !== 'ended'}
						<button
							type="button"
							onclick={() => send({ type: 'end_session' })}
							class="px-btn px-3 py-2 text-sm font-bold text-danger"
						>
							{m.table_end_session()}
						</button>
					{/if}
				</div>

				<section class="px-panel flex min-h-0 flex-col gap-2 p-3">
					<ul class="flex h-40 flex-col gap-1 overflow-y-auto text-sm lg:h-64" aria-live="polite">
						{#each chat as message (message.id)}
							<!-- Reactions never reach this list: they float over a seat and are gone. -->
							<li class="break-words">
								<span class="font-bold text-gold">{message.username}:</span>
								<span class="text-parchment">{message.body}</span>
							</li>
						{/each}
					</ul>

					<div class="flex flex-wrap gap-1">
						{#each REACTIONS as emoji (emoji)}
							<button
								type="button"
								onclick={() => send({ type: 'reaction', emoji })}
								class="px-btn px-2 py-1.5 text-lg leading-none"
								aria-label={emoji}
							>
								{emoji}
							</button>
						{/each}
					</div>

					<form onsubmit={sendChat} class="flex gap-2">
						<input
							bind:value={chatDraft}
							maxlength="500"
							placeholder={m.table_chat_placeholder()}
							class="px-field min-w-0 flex-1 px-3 py-2.5 text-sm"
						/>
						<button class="px-btn px-3 py-2.5 text-sm font-bold">
							{m.table_chat_send()}
						</button>
					</form>
				</section>
			</aside>
		</div>
	{/if}
</main>
