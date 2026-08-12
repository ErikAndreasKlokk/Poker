<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { formatOre } from '$lib/money';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Everyone still holding chips has something to take out; the rest are done.
	const withdrawals = $derived(data.lines.filter((line) => line.paidOutOre > 0));
</script>

<svelte:head><title>{m.settle_title()} · {data.name}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-col gap-6 p-5 pb-16">
	<header class="flex items-start justify-between gap-3 pt-2">
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">{m.settle_title()}</h1>
			<p class="text-sm text-muted">{data.name}</p>
		</div>
		<a
			href={resolve('/games/[code]', { code: data.code })}
			class="shrink-0 text-sm text-muted underline underline-offset-4"
		>
			{m.settle_back()}
		</a>
	</header>

	{#if !data.realMoney}
		<p class="px-panel px-4 py-3 text-sm">
			{m.settle_play_money()}
		</p>
	{:else}
		{#if !data.ended}
			<p class="px-panel border-gold px-4 py-3 text-sm text-gold">
				{m.settle_not_ended()}
			</p>
		{/if}

		<!-- What the Boks holds, what Vipps keeps, what is left to take out. -->
		<section class="px-panel flex flex-col gap-1 p-4">
			<div class="flex items-baseline justify-between gap-3">
				<span class="text-sm text-muted">{m.settle_in_boks()}</span>
				<span class="font-medium tabular-nums">{formatOre(data.paidInOre)}</span>
			</div>
			<div class="flex items-baseline justify-between gap-3">
				<span class="text-sm text-muted">{m.settle_fee()}</span>
				<span class="font-medium text-danger tabular-nums">−{formatOre(data.feeOre)}</span>
			</div>
			<div class="mt-1 flex items-baseline justify-between gap-3 border-t-2 border-edge pt-2">
				<span class="text-sm font-medium">{m.settle_available()}</span>
				<span class="text-lg font-semibold tabular-nums">{formatOre(data.payoutOre)}</span>
			</div>
			<p class="mt-1 text-xs text-muted">{m.settle_fee_hint()}</p>
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="font-arcade text-[0.6rem] text-muted">{m.settle_withdrawals()}</h2>

			{#if !data.ended}
				<p class="text-sm text-muted">{m.settle_pending()}</p>
			{:else if withdrawals.length === 0}
				<p class="text-muted">{m.settle_nothing_to_withdraw()}</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each withdrawals as line (line.userId)}
						<li class="px-panel flex items-center justify-between gap-3 p-4">
							<span class="min-w-0 truncate font-medium">{line.username}</span>
							<span class="shrink-0 text-xl font-semibold tabular-nums">
								{formatOre(line.paidOutOre)}
							</span>
						</li>
					{/each}
				</ul>
				<p class="text-xs text-muted">{m.settle_withdraw_hint()}</p>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="font-arcade text-[0.6rem] text-muted">{m.settle_summary()}</h2>
			<ul class="flex flex-col divide-y-2 divide-edge">
				{#each data.lines as line (line.userId)}
					<li class="flex items-center justify-between gap-3 py-3">
						<span class="min-w-0">
							<span class="block truncate font-medium">{line.username}</span>
							<span class="block text-xs text-muted">
								{m.settle_paid_in({ amount: formatOre(line.paidInOre) })}
								· {m.settle_paid_out({ amount: formatOre(line.paidOutOre) })}
							</span>
						</span>
						<span
							class="shrink-0 font-semibold tabular-nums"
							class:text-success={line.netOre > 0}
							class:text-danger={line.netOre < 0}
						>
							{line.netOre > 0 ? '+' : ''}{formatOre(line.netOre)}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		{#if data.vippsBoksCode}
			<p class="px-panel px-4 py-3 text-sm">
				<span class="font-medium">{m.table_boks()}:</span>
				<span class="font-mono">{data.vippsBoksCode}</span>
			</p>
		{/if}
	{/if}
</main>
