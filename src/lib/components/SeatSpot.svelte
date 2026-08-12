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
		betsAbove = false,
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
		/** Put the wager on the centre side of the seat, as chips sit on a real table. */
		betsAbove?: boolean;
		onsit?: (seat: number) => void;
	} = $props();
</script>

{#snippet wager(seat: SeatView)}
	<div class="flex min-h-6 flex-col items-center gap-0.5 text-xs leading-tight">
		{#if seat.committed > 0}
			<ChipStack
				amount={seat.committed}
				{denominations}
				size="xs"
				maxPerColumn={3}
				showTotal={false}
			/>
			<span class="font-bold text-gold tabular-nums">{seat.committed}</span>
		{/if}
	</div>
{/snippet}

<div class="flex w-36 flex-col items-center">
	{#if seat}
		{#if betsAbove}{@render wager(seat)}{/if}

		<!-- Cards tuck in behind the plate, so only their tops need vertical room. -->
		<div class="-mb-3 flex h-12 items-end gap-1">
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

		<!--
			Laid out sideways: avatar beside the name and stack rather than above
			them, with the clock on the bottom edge instead of taking its own row.
			Stacking all four made the plate twice as tall as it needed to be.
		-->
		<div
			class="relative z-10 flex w-full items-center gap-2 border-2 px-2 py-1.5 transition
				{isActing ? 'border-gold bg-surface-hi shadow-[0_0_0_3px_#ffc94a55]' : 'border-edge bg-surface'}
				{seat.folded ? 'opacity-40' : ''}"
		>
			{#if isButton}
				<span
					class="absolute -top-2.5 -right-2.5 grid size-6 place-items-center border-2 border-neutral-900 bg-parchment font-arcade text-[0.6rem] text-ink"
					title={m.a11y_dealer_button()}
				>
					D
				</span>
			{/if}

			<img
				src="/avatar/{seat.userId}"
				alt=""
				class="size-10 shrink-0 border-2 object-cover {isYou ? 'border-gold' : 'border-edge-hi'}"
			/>

			<span class="flex min-w-0 flex-1 flex-col items-start">
				<span class="w-full truncate text-sm leading-tight font-bold">{seat.username}</span>
				<ChipStack amount={seat.stack} {denominations} size="xs" maxPerColumn={3} />
			</span>

			{#if clock !== null}
				<span class="absolute inset-x-0 bottom-0 h-1 bg-ink">
					<span
						class="block h-full transition-[width] duration-200 ease-linear
							{clock < 0.25 ? 'bg-danger' : 'bg-gold'}"
						style="width: {Math.round(clock * 100)}%"
					></span>
				</span>
			{/if}
		</div>

		{#if !betsAbove}{@render wager(seat)}{/if}

		<div class="flex min-h-5 flex-col items-center gap-0.5 text-xs leading-tight">
			{#if seat.allIn}
				<span class="font-arcade text-[0.6rem] text-gold">{m.table_all_in_label()}</span>
			{:else if seat.sittingOut}
				<span class="text-muted">{m.table_sitting_out()}</span>
			{/if}
			{#if seat.won > 0}
				<span class="font-bold text-success">{m.table_won({ amount: seat.won })}</span>
			{/if}
			{#if seat.handDescription}
				<span class="text-center text-parchment">{seat.handDescription}</span>
			{/if}
		</div>
	{:else}
		<button
			type="button"
			disabled={!canSit}
			onclick={() => onsit?.(index)}
			class="w-full border-2 border-dashed border-edge px-2 py-4 text-xs text-muted transition enabled:hover:border-gold enabled:hover:text-gold disabled:opacity-40"
		>
			{canSit ? m.table_sit_here() : m.table_empty_seat()}
		</button>
	{/if}
</div>
