<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { formatOre } from '$lib/money';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let copied = $state<string | null>(null);

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = null), 2000);
		} catch {
			// Clipboard can be blocked; the number is on screen to type manually.
		}
	}
</script>

<svelte:head><title>{m.settle_title()} · {data.name}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-col gap-6 p-5 pb-16">
	<header class="flex items-start justify-between gap-3 pt-2">
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">{m.settle_title()}</h1>
			<p class="text-sm text-neutral-500">{data.name}</p>
		</div>
		<a
			href={resolve('/games/[code]', { code: data.code })}
			class="shrink-0 text-sm text-neutral-500 underline underline-offset-4"
		>
			{m.settle_back()}
		</a>
	</header>

	{#if !data.realMoney}
		<p class="rounded-lg bg-neutral-100 px-4 py-3 text-sm dark:bg-neutral-900">
			{m.settle_play_money()}
		</p>
	{:else if data.status !== 'ended'}
		<p
			class="rounded-lg bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200"
		>
			{m.settle_not_ended()}
		</p>
	{/if}

	{#if data.realMoney}
		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold text-neutral-500 uppercase">{m.settle_payments()}</h2>

			{#if data.transfers.length === 0}
				<p class="text-neutral-500">{m.settle_all_square()}</p>
			{:else}
				<ul class="flex flex-col gap-2">
					{#each data.transfers as transfer (transfer.fromUserId + transfer.toUserId)}
						<li
							class="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
						>
							<p class="text-sm">
								<strong>{transfer.fromUsername}</strong>
								{m.settle_pays()}
								<strong>{transfer.toUsername}</strong>
							</p>
							<p class="text-2xl font-semibold tabular-nums">
								{formatOre(transfer.amountOre)}
							</p>
							{#if transfer.toPhone}
								<button
									type="button"
									onclick={() => copy(transfer.toPhone!, transfer.toUserId)}
									class="self-start rounded-lg bg-neutral-100 px-3 py-2 font-mono text-sm dark:bg-neutral-800"
								>
									{copied === transfer.toUserId ? m.settle_copied() : transfer.toPhone}
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				<p class="text-xs text-neutral-500">{m.settle_vipps_hint()}</p>
			{/if}
		</section>

		<section class="flex flex-col gap-3">
			<h2 class="text-sm font-semibold text-neutral-500 uppercase">{m.settle_summary()}</h2>
			<ul class="flex flex-col divide-y divide-neutral-200 dark:divide-neutral-800">
				{#each data.lines as line (line.userId)}
					<li class="flex items-center justify-between gap-3 py-3">
						<span class="min-w-0">
							<span class="block truncate font-medium">{line.username}</span>
							<span class="block text-xs text-neutral-500">
								{m.settle_paid_in({ amount: formatOre(line.paidInOre) })}
								· {m.settle_paid_out({ amount: formatOre(line.paidOutOre) })}
							</span>
						</span>
						<span
							class="shrink-0 font-semibold tabular-nums"
							class:text-emerald-600={line.netOre > 0}
							class:text-rose-600={line.netOre < 0}
						>
							{line.netOre > 0 ? '+' : ''}{formatOre(line.netOre)}
						</span>
					</li>
				{/each}
			</ul>
		</section>

		{#if data.vippsBoksCode}
			<p class="rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
				<span class="font-medium">{m.table_boks()}:</span>
				<span class="font-mono">{data.vippsBoksCode}</span>
			</p>
		{/if}
	{/if}
</main>
