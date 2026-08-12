<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { SeatView } from '$lib/protocol';
	import ChipStack from './ChipStack.svelte';
	import PlayingCard from './PlayingCard.svelte';

	let {
		seat = null,
		index,
		denominations,
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
		denominations: number[];
		isButton?: boolean;
		isActing?: boolean;
		isYou?: boolean;
		canSit?: boolean;
		clock?: number | null;
		onsit?: (seat: number) => void;
	} = $props();
</script>

<div class="flex w-24 flex-col items-center gap-0.5">
	{#if seat}
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
			class="relative flex w-full flex-col items-center border-2 px-1 py-1 transition
				{isActing ? 'border-gold bg-surface-hi shadow-[0_0_0_2px_#ffc94a55]' : 'border-edge bg-surface'}
				{seat.folded ? 'opacity-40' : ''}"
		>
			{#if isButton}
				<span
					class="absolute -top-2 -right-2 grid size-5 place-items-center border-2 border-neutral-900 bg-parchment font-arcade text-[0.5rem] text-ink"
					title={m.a11y_dealer_button()}
				>
					D
				</span>
			{/if}

			<img
				src="/avatar/{seat.userId}"
				alt=""
				class="size-7 border-2 object-cover {isYou ? 'border-gold' : 'border-edge-hi'}"
			/>
			<span class="mt-0.5 w-full truncate text-center text-[0.7rem] leading-tight font-semibold">
				{seat.username}
			</span>

			<!-- The stack itself, as chips: colour carries the denomination. Kept to a
			     few chips so the column stays legible rather than a thin sliver. -->
			<ChipStack amount={seat.stack} {denominations} size="sm" maxPerColumn={3} />

			{#if clock !== null}
				<span class="mt-1 h-1 w-full bg-ink">
					<span
						class="block h-full transition-[width] duration-200 ease-linear
							{clock < 0.25 ? 'bg-danger' : 'bg-gold'}"
						style="width: {Math.round(clock * 100)}%"
					></span>
				</span>
			{/if}
		</div>

		<!-- What they have pushed into the pot this street, in front of them. -->
		<div class="flex min-h-5 flex-col items-center gap-0.5 text-[0.6rem] leading-tight">
			{#if seat.committed > 0}
				<ChipStack
					amount={seat.committed}
					{denominations}
					size="xs"
					maxPerColumn={3}
					showTotal={false}
				/>
				<span class="font-semibold text-gold tabular-nums">{seat.committed}</span>
			{/if}
			{#if seat.allIn}
				<span class="font-arcade text-[0.5rem] text-gold">{m.table_all_in_label()}</span>
			{:else if seat.sittingOut}
				<span class="text-muted">{m.table_sitting_out()}</span>
			{/if}
			{#if seat.won > 0}
				<span class="font-semibold text-success">{m.table_won({ amount: seat.won })}</span>
			{/if}
			{#if seat.handDescription}
				<span class="text-center text-parchment">{seat.handDescription}</span>
			{/if}
		</div>
	{:else}
		<div class="h-9"></div>
		<button
			type="button"
			disabled={!canSit}
			onclick={() => onsit?.(index)}
			class="w-full border-2 border-dashed border-edge px-1 py-3 text-[0.65rem] text-muted transition enabled:hover:border-gold enabled:hover:text-gold disabled:opacity-40"
		>
			{canSit ? m.table_sit_here() : m.table_empty_seat()}
		</button>
		<div class="min-h-5"></div>
	{/if}
</div>
