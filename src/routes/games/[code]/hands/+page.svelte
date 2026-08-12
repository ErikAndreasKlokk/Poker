<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import PlayingCard from '$lib/components/PlayingCard.svelte';
	import type { Card } from '$lib/protocol';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.hands_title()} · {data.name}</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5 pb-16">
	<header class="flex items-start justify-between gap-3 pt-2">
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">{m.hands_title()}</h1>
			<p class="text-sm text-muted">{data.name}</p>
		</div>
		<a
			href={resolve('/games/[code]', { code: data.code })}
			class="shrink-0 text-sm text-muted underline underline-offset-4"
		>
			{m.settle_back()}
		</a>
	</header>

	{#if data.hands.length === 0}
		<p class="text-muted">{m.hands_empty()}</p>
	{:else}
		<ul class="flex flex-col gap-2">
			{#each data.hands as hand (hand.handNumber)}
				<li>
					<a
						href={resolve('/games/[code]/hands/[number]', {
							code: data.code,
							number: String(hand.handNumber)
						})}
						class="px-panel flex flex-col gap-2 p-4"
					>
						<div class="flex items-baseline justify-between gap-3">
							<span class="font-medium">{m.hands_hand({ number: hand.handNumber })}</span>
							<span class="text-sm text-muted tabular-nums">
								{m.hands_pot({ amount: hand.potTotal })}
							</span>
						</div>

						{#if hand.board.length > 0}
							<div class="flex gap-1">
								{#each hand.board as card (card)}
									<PlayingCard card={card as Card} size="sm" />
								{/each}
							</div>
						{/if}

						{#each hand.winners as winner (winner.seat)}
							<span class="text-sm text-success">
								{m.hands_won({
									username: winner.username ?? m.replay_seat({ seat: winner.seat }),
									amount: winner.amount
								})}
							</span>
						{/each}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
