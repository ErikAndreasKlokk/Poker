<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { TableConnection } from '$lib/client/table.svelte';
	import type { ClientMessage, SeatView } from '$lib/protocol';
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

	// At most nine seats, so a scan beats keeping a reactive Map in sync.
	function seatAt(index: number): SeatView | undefined {
		return table?.seats.find((seat) => seat.seat === index);
	}
	const isHost = $derived(!!table && table.you.userId === table.hostUserId);
	const seated = $derived(table != null && table.you.seat !== null);
	const legal = $derived(table?.legal ?? null);

	let raiseTo = $state(0);
	$effect(() => {
		if (legal) raiseTo = legal.minRaiseTo;
	});

	function send(message: ClientMessage) {
		connection?.send(message);
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

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4 pb-8">
	<header class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<h1 class="truncate text-xl font-semibold tracking-tight">{data.name}</h1>
			<p class="text-sm text-neutral-500">{m.table_share({ code: data.code })}</p>
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
			class="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
		>
			{table ? m.table_disconnected() : m.table_connecting()}
		</p>
	{/if}

	{#if socketError}
		<p
			class="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{socketError}
		</p>
	{/if}

	{#if table}
		{#if table.realMoney && table.vippsBoksCode}
			<p class="rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
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

		<!-- Board and pot -->
		<section
			class="flex flex-col items-center gap-3 rounded-2xl bg-emerald-900/90 px-4 py-6 text-emerald-50"
		>
			{#if table.handNumber}
				<span class="text-xs tracking-wide text-emerald-200/80 uppercase">
					{m.table_hand_number({ number: table.handNumber })}
				</span>
			{/if}

			<div class="flex min-h-14 items-center gap-1.5">
				{#each table.board as card (card)}
					<span
						class="rounded-md bg-white px-2 py-2.5 font-mono text-lg font-semibold text-neutral-900"
					>
						{card}
					</span>
				{/each}
			</div>

			{#each table.pots as pot, i (i)}
				<span class="text-sm">
					{i === 0 ? m.table_pot() : m.table_side_pot()}: <strong>{pot.amount}</strong>
				</span>
			{/each}
		</section>

		<!-- Seats -->
		<ul class="grid grid-cols-2 gap-2">
			{#each Array.from({ length: table.maxSeats }, (_, i) => i) as index (index)}
				{@const seat = seatAt(index)}
				<li
					class="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
					class:ring-2={table.toAct === index}
					class:ring-emerald-500={table.toAct === index}
				>
					{#if seat}
						<div class="flex items-center gap-2">
							<img
								src="/avatar/{seat.userId}"
								alt=""
								class="size-8 shrink-0 rounded-full object-cover"
							/>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-sm font-medium">{seat.username}</span>
								<span class="block text-xs text-neutral-500">{seat.stack}</span>
							</span>
						</div>

						<div class="mt-2 flex min-h-7 items-center gap-1">
							{#if seat.hole}
								{#each seat.hole as card (card)}
									<span
										class="rounded bg-neutral-900 px-1.5 py-1 font-mono text-xs text-white dark:bg-neutral-200 dark:text-neutral-900"
									>
										{card}
									</span>
								{/each}
							{:else}
								{#each Array.from({ length: seat.cardCount }, (_, i) => i) as back (back)}
									<span class="h-6 w-4 rounded bg-neutral-400 dark:bg-neutral-600"></span>
								{/each}
							{/if}
						</div>

						<div class="mt-1 flex flex-wrap gap-1 text-xs text-neutral-500">
							{#if seat.committed > 0}<span>+{seat.committed}</span>{/if}
							{#if seat.allIn}<span class="text-amber-600">{m.table_all_in_label()}</span>{/if}
							{#if seat.folded}<span>{m.table_fold()}</span>{/if}
							{#if seat.sittingOut}<span>{m.table_sitting_out()}</span>{/if}
							{#if seat.won > 0}<span class="text-emerald-600"
									>{m.table_won({ amount: seat.won })}</span
								>{/if}
							{#if seat.handDescription}<span>{seat.handDescription}</span>{/if}
						</div>
					{:else}
						<button
							type="button"
							disabled={seated || table.status !== 'lobby'}
							onclick={() => send({ type: 'sit', seat: index })}
							class="w-full rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-500 disabled:opacity-40 dark:border-neutral-700"
						>
							{seated || table.status !== 'lobby' ? m.table_empty_seat() : m.table_sit_here()}
						</button>
					{/if}
				</li>
			{/each}
		</ul>

		<!-- Controls -->
		{#if table.status === 'lobby'}
			{#if isHost}
				<button
					type="button"
					disabled={table.seats.length < 2}
					onclick={() => send({ type: 'start' })}
					class="rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60"
				>
					{table.seats.length < 2 ? m.table_need_two() : m.table_start()}
				</button>
			{:else}
				<p class="text-center text-sm text-neutral-500">{m.table_waiting_for_host()}</p>
			{/if}
		{/if}

		{#if legal}
			<section
				class="sticky bottom-2 flex flex-col gap-2 rounded-xl border border-emerald-500 bg-white p-3 shadow-lg dark:bg-neutral-900"
			>
				<span class="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
					{m.table_your_turn()}
				</span>
				<div class="grid grid-cols-3 gap-2">
					<button
						type="button"
						onclick={() => send({ type: 'act', action: { type: 'fold' } })}
						class="rounded-lg bg-neutral-200 px-3 py-3 text-sm font-medium dark:bg-neutral-800"
					>
						{m.table_fold()}
					</button>

					{#if legal.canCheck}
						<button
							type="button"
							onclick={() => send({ type: 'act', action: { type: 'check' } })}
							class="rounded-lg bg-neutral-200 px-3 py-3 text-sm font-medium dark:bg-neutral-800"
						>
							{m.table_check()}
						</button>
					{:else}
						<button
							type="button"
							onclick={() => send({ type: 'act', action: { type: 'call' } })}
							class="rounded-lg bg-neutral-200 px-3 py-3 text-sm font-medium dark:bg-neutral-800"
						>
							{m.table_call({ amount: legal.callAmount })}
						</button>
					{/if}

					<button
						type="button"
						disabled={!legal.canRaise}
						onclick={() => send({ type: 'act', action: { type: 'raise', to: raiseTo } })}
						class="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-medium text-white disabled:opacity-40"
					>
						{m.table_raise({ amount: raiseTo })}
					</button>
				</div>

				{#if legal.canRaise}
					<input
						type="range"
						min={legal.minRaiseTo}
						max={legal.maxRaiseTo}
						step="1"
						bind:value={raiseTo}
						class="w-full"
					/>
				{/if}
			</section>
		{/if}

		<!-- Chat -->
		<section class="flex flex-col gap-2">
			<ul class="flex max-h-48 flex-col gap-1 overflow-y-auto text-sm">
				{#each chat as message (message.id)}
					<li><span class="font-medium">{message.username}</span>: {message.body}</li>
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

		{#if seated}
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
