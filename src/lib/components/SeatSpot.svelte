<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SeatView } from '$lib/protocol';
	import PlayingCard from './PlayingCard.svelte';

	let {
		seat = null,
		index,
		isButton = false,
		isActing = false,
		isYou = false,
		canSit = false,
		/** 0–1 of the action clock remaining; null when this seat isn't on the clock. */
		clock = null,
		onsit
	}: {
		seat?: SeatView | null;
		index: number;
		isButton?: boolean;
		isActing?: boolean;
		isYou?: boolean;
		canSit?: boolean;
		clock?: number | null;
		onsit?: (seat: number) => void;
	} = $props();
</script>

<div class="flex w-24 flex-col items-center gap-1">
	{#if seat}
		<!-- Cards sit above the plate so they read at a glance on a small screen. -->
		<div class="flex h-9 items-end gap-0.5">
			{#if seat.hole}
				{#each seat.hole as card (card)}
					<PlayingCard {card} size="sm" />
				{/each}
			{:else}
				{#each Array.from({ length: seat.cardCount }, (_, i) => i) as back (back)}
					<PlayingCard size="sm" />
				{/each}
			{/if}
		</div>

		<div
			class="relative flex w-full flex-col items-center rounded-xl px-1.5 py-1.5 ring-1 transition
				{isActing ? 'bg-emerald-950/95 ring-emerald-400' : 'bg-neutral-900/85 ring-white/10'}
				{seat.folded ? 'opacity-45' : ''}"
		>
			{#if isButton}
				<span
					class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-white text-[0.6rem] font-bold text-neutral-900 shadow"
					title={m.a11y_dealer_button()}
				>
					D
				</span>
			{/if}

			<img
				src="/avatar/{seat.userId}"
				alt=""
				class="size-7 rounded-full object-cover ring-2 {isYou
					? 'ring-emerald-400'
					: 'ring-white/20'}"
			/>
			<span class="mt-0.5 w-full truncate text-center text-[0.65rem] font-medium text-white">
				{seat.username}
			</span>
			<span class="text-[0.7rem] font-semibold text-emerald-300">{seat.stack}</span>

			{#if clock !== null}
				<span class="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-white/20">
					<span
						class="block h-full rounded-full transition-[width] duration-200 ease-linear
							{clock < 0.25 ? 'bg-rose-400' : 'bg-emerald-400'}"
						style="width: {Math.round(clock * 100)}%"
					></span>
				</span>
			{/if}
		</div>

		<div class="flex min-h-4 flex-col items-center gap-0.5 text-[0.6rem] leading-tight">
			{#if seat.committed > 0}
				<span class="rounded-full bg-amber-400/90 px-1.5 font-semibold text-amber-950">
					{seat.committed}
				</span>
			{/if}
			{#if seat.allIn}
				<span class="font-semibold text-amber-300">{m.table_all_in_label()}</span>
			{:else if seat.sittingOut}
				<span class="text-neutral-400">{m.table_sitting_out()}</span>
			{/if}
			{#if seat.won > 0}
				<span class="font-semibold text-emerald-300">{m.table_won({ amount: seat.won })}</span>
			{/if}
			{#if seat.handDescription}
				<span class="text-center text-white/80">{seat.handDescription}</span>
			{/if}
		</div>
	{:else}
		<div class="h-9"></div>
		<button
			type="button"
			disabled={!canSit}
			onclick={() => onsit?.(index)}
			class="w-full rounded-xl border border-dashed border-white/25 px-1.5 py-3 text-[0.65rem] text-white/50 transition enabled:hover:border-emerald-400 enabled:hover:text-emerald-300 disabled:opacity-40"
		>
			{canSit ? m.table_sit_here() : m.table_empty_seat()}
		</button>
		<div class="min-h-4"></div>
	{/if}
</div>
