<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { formatOre } from '$lib/money';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The path comes from `resolve`, but the board and the page live in the query
	 * string, which `resolve` has no way to express — hence the lint exemptions
	 * on the links below.
	 */
	function href(mode: string, page: number) {
		return `${resolve('/leaderboard')}?mode=${mode}&page=${page}`;
	}

	/** Real money is kroner; play money is chips, which have no unit. */
	function amount(net: number) {
		if (data.mode === 'money') return formatOre(net);
		return net > 0 ? `+${net}` : String(net);
	}
</script>

<svelte:head><title>{m.leaderboard_title()} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-5 pb-16 lg:p-6">
	<header class="flex items-center justify-between gap-4 pt-2">
		<h1 class="font-arcade text-xl text-gold lg:text-2xl">{m.leaderboard_title()}</h1>
		<a href={resolve('/games')} class="px-btn shrink-0 px-4 py-2 text-sm font-bold">
			{m.lobby_title()}
		</a>
	</header>

	<!-- Two boards, because a krone and a play chip are not the same thing and
	     adding them together would be meaningless. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<div class="grid grid-cols-2 gap-0 border-2 border-edge">
		<a
			href={href('money', 1)}
			class="py-2.5 text-center text-sm font-bold transition
				{data.mode === 'money' ? 'bg-surface-hi text-gold' : 'text-muted hover:text-parchment'}"
		>
			{m.leaderboard_real_money()}
		</a>
		<a
			href={href('play', 1)}
			class="py-2.5 text-center text-sm font-bold transition
				{data.mode === 'play' ? 'bg-surface-hi text-gold' : 'text-muted hover:text-parchment'}"
		>
			{m.leaderboard_play_money()}
		</a>
	</div>

	<p class="text-sm text-muted">
		{data.mode === 'money' ? m.leaderboard_money_hint() : m.leaderboard_play_hint()}
	</p>

	<ul class="flex flex-col divide-y-2 divide-edge">
		{#each data.rows as row, index (row.userId)}
			{@const rank = data.page.offset + index + 1}
			<li class="flex items-center gap-3 py-3">
				<span class="px-num w-8 shrink-0 text-right text-sm text-muted">{rank}</span>

				<img
					src="/avatar/{row.userId}"
					alt=""
					class="size-9 shrink-0 border-2 border-edge-hi object-cover"
				/>

				<span class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-bold">{row.username}</span>
					<span class="text-xs text-muted">
						<!-- Norwegian has no "1 kvelder", so one session gets its own string. -->
						{#if row.games === 0}
							{m.leaderboard_no_games()}
						{:else if row.games === 1}
							{m.leaderboard_games_one()}
						{:else}
							{m.leaderboard_games({ count: row.games })}
						{/if}
					</span>
				</span>

				<span
					class="px-num shrink-0 text-base font-bold"
					class:text-success={row.net > 0}
					class:text-danger={row.net < 0}
					class:text-muted={row.net === 0}
				>
					{amount(row.net)}
				</span>
			</li>
		{/each}
	</ul>

	{#if data.page.pageCount > 1}
		<nav class="flex items-center justify-between gap-3">
			{#if data.page.hasPrevious}
				<a href={href(data.mode, data.page.number - 1)} class="px-btn px-4 py-2 text-sm font-bold">
					{m.pagination_previous()}
				</a>
			{:else}
				<span></span>
			{/if}

			<span class="px-num text-xs text-muted">
				{m.pagination_position({ page: data.page.number, pages: data.page.pageCount })}
			</span>

			{#if data.page.hasNext}
				<a href={href(data.mode, data.page.number + 1)} class="px-btn px-4 py-2 text-sm font-bold">
					{m.pagination_next()}
				</a>
			{:else}
				<span></span>
			{/if}
		</nav>
	{/if}
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
</main>
