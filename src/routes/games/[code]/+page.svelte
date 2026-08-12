<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { TableConnection } from '$lib/client/table.svelte';
	import ActionBar from '$lib/components/ActionBar.svelte';
	import PlayingCard from '$lib/components/PlayingCard.svelte';
	import SeatSpot from '$lib/components/SeatSpot.svelte';
	import type { Action, ClientMessage, SeatView } from '$lib/protocol';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let connection = $state<TableConnection | null>(null);
	let chatDraft = $state('');

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

	const mySeat = $derived(table?.you.seat ?? null);
	const isHost = $derived(!!table && table.you.userId === table.hostUserId);
	const legal = $derived(table?.legal ?? null);

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

	/**
	 * Rotates the table so the viewer always sits at the bottom, with the next
	 * seat to act running clockwise from there — the way it looks in person.
	 */
	function positionFor(index: number, count: number) {
		const offset = mySeat ?? 0;
		const slot = (index - offset + count) % count;
		const angle = Math.PI / 2 + (slot / count) * Math.PI * 2;
		return {
			left: 50 + 38 * Math.cos(angle),
			top: 50 + 36 * Math.sin(angle)
		};
	}

	function send(message: ClientMessage) {
		connection?.send(message);
	}

	function act(action: Action) {
		send({ type: 'act', action });
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

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-3 px-4 pt-3 pb-4">
	<header class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="truncate text-lg font-semibold tracking-tight">{data.name}</h1>
			<p class="text-xs text-neutral-500">{m.table_share({ code: data.code })}</p>
		</div>
		<a
			href={resolve('/games')}
			class="shrink-0 text-sm text-neutral-500 underline underline-offset-4"
		>
			{m.lobby_title()}
		</a>
	</header>

	{#if !connected}
		<p
			class="rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
		>
			{table ? m.table_disconnected() : m.table_connecting()}
		</p>
	{/if}

	{#if socketError}
		<p
			class="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{socketError}
		</p>
	{/if}

	{#if table}
		<!-- The felt: seats arranged around the rim, board and pot in the middle. -->
		<section
			class="relative aspect-5/6 w-full rounded-[2.5rem] bg-emerald-800 ring-1 ring-emerald-950/40 ring-inset"
			style="background-image: radial-gradient(ellipse at 50% 40%, rgb(6 120 90 / 0.9), transparent 70%)"
		>
			<div
				class="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2"
			>
				{#if table.handNumber}
					<span class="text-[0.6rem] tracking-widest text-emerald-200/70 uppercase">
						{m.table_hand_number({ number: table.handNumber })}
					</span>
				{/if}

				<div class="flex min-h-14 items-center gap-1">
					{#each table.board as card (card)}
						<PlayingCard {card} size="md" />
					{/each}
				</div>

				{#if table.potTotal > 0}
					<span
						class="rounded-full bg-black/40 px-3 py-1 text-sm font-semibold text-emerald-100 tabular-nums"
					>
						{m.table_pot()}
						{table.potTotal}
					</span>
				{/if}

				{#if table.pots.length > 1}
					<div class="flex flex-wrap justify-center gap-1">
						{#each table.pots.slice(1) as pot, i (i)}
							<span class="rounded-full bg-black/30 px-2 py-0.5 text-[0.6rem] text-emerald-100">
								{m.table_side_pot()}
								{pot.amount}
							</span>
						{/each}
					</div>
				{/if}
			</div>

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
						isButton={table.button === index}
						isActing={table.toAct === index}
						isYou={seat?.userId === table.you.userId}
						canSit={mySeat === null && table.status !== 'ended'}
						clock={table.toAct === index && msLeft !== null
							? Math.min(1, msLeft / (table.turnSeconds * 1000))
							: null}
						onsit={(seatIndex) => send({ type: 'sit', seat: seatIndex })}
					/>
				</div>
			{/each}
		</section>

		{#if table.realMoney && table.vippsBoksCode}
			<p class="rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-800">
				<span class="font-medium">{m.table_boks()}:</span>
				<span class="font-mono">{table.vippsBoksCode}</span>
			</p>
		{/if}

		{#if table.voiceChatUrl}
			<!-- Deliberately unresolved: this is an external link the host supplied. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={table.voiceChatUrl}
				rel="noreferrer noopener"
				target="_blank"
				class="text-sm underline underline-offset-4"
			>
				{m.table_voice()}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}

		{#if table.status === 'lobby'}
			{#if isHost}
				<button
					type="button"
					disabled={table.seats.length < 2}
					onclick={() => send({ type: 'start' })}
					class="rounded-xl bg-emerald-600 py-4 font-semibold text-white disabled:opacity-50"
				>
					{table.seats.length < 2 ? m.table_need_two() : m.table_start()}
				</button>
			{:else}
				<p class="py-2 text-center text-sm text-neutral-500">{m.table_waiting_for_host()}</p>
			{/if}
		{/if}

		<!-- Chat sits above the action bar so the bar stays pinned under the thumb. -->
		<section class="flex min-h-0 flex-1 flex-col gap-2">
			<ul class="flex max-h-32 flex-col gap-0.5 overflow-y-auto text-sm">
				{#each chat as message (message.id)}
					<li class="break-words">
						<span class="font-medium">{message.username}</span>
						<span class="text-neutral-600 dark:text-neutral-300">{message.body}</span>
					</li>
				{/each}
			</ul>
			<form onsubmit={sendChat} class="flex gap-2">
				<input
					bind:value={chatDraft}
					maxlength="500"
					placeholder={m.table_chat_placeholder()}
					class="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2.5 text-base dark:border-neutral-700 dark:bg-neutral-900"
				/>
				<button
					class="rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-medium text-white dark:bg-neutral-200 dark:text-neutral-900"
				>
					{m.table_chat_send()}
				</button>
			</form>
		</section>

		{#if legal}
			<ActionBar
				{legal}
				potTotal={table.potTotal}
				currentBet={table.currentBet}
				{secondsLeft}
				onact={act}
			/>
		{:else if mySeat !== null && table.status === 'lobby'}
			<button
				type="button"
				onclick={() => send({ type: 'leave' })}
				class="text-sm text-neutral-500 underline underline-offset-4"
			>
				{m.table_leave()}
			</button>
		{/if}
	{/if}
</main>
