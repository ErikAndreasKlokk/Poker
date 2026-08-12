<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Action, LegalActions } from '$lib/protocol';

	let {
		legal,
		potTotal,
		currentBet,
		/** Seconds left on the clock, or null when it isn't running. */
		secondsLeft = null,
		onact
	}: {
		legal: LegalActions;
		potTotal: number;
		currentBet: number;
		secondsLeft?: number | null;
		onact: (action: Action) => void;
	} = $props();

	// A writable derived: freely assignable, but re-seeded whenever a new decision
	// arrives, so a stale amount from the previous street can never be submitted.
	let raiseTo = $derived(legal.minRaiseTo);

	/** Everything in the middle, including the current street's bets. */
	const potWithBets = $derived(potTotal + currentBet + legal.callAmount);

	function clamp(value: number) {
		return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(value)));
	}

	const presets = $derived(
		[
			{ label: '½', to: clamp(currentBet + potWithBets / 2) },
			{ label: '¾', to: clamp(currentBet + potWithBets * 0.75) },
			{ label: m.table_pot(), to: clamp(currentBet + potWithBets) },
			{ label: m.table_all_in(), to: legal.maxRaiseTo }
		].filter(
			(preset, i, all) =>
				// Drop presets that collapse onto each other on a short stack.
				preset.to > legal.minRaiseTo - 1 && all.findIndex((p) => p.to === preset.to) === i
		)
	);

	const isShove = $derived(raiseTo >= legal.maxRaiseTo);
</script>

<section
	class="px-panel sticky bottom-0 z-10 -mx-4 flex flex-col gap-3 border-x-0 border-b-0 border-t-gold px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:static lg:mx-0 lg:border-2 lg:border-gold lg:p-4"
>
	<div class="flex items-center justify-between text-sm">
		<span class="font-arcade text-xs text-gold lg:text-sm">{m.table_your_turn()}</span>
		{#if secondsLeft !== null}
			<span
				class="font-arcade text-xs tabular-nums lg:text-sm"
				class:text-danger={secondsLeft <= 5}
				class:text-muted={secondsLeft > 5}
			>
				{secondsLeft}s
			</span>
		{/if}
	</div>

	{#if legal.canRaise}
		<div class="flex items-center gap-2">
			<div class="flex gap-1">
				{#each presets as preset (preset.label)}
					<button
						type="button"
						onclick={() => (raiseTo = preset.to)}
						class="px-btn px-3 py-2 text-sm font-bold"
						class:border-gold={raiseTo === preset.to}
						class:text-gold={raiseTo === preset.to}
					>
						{preset.label}
					</button>
				{/each}
			</div>
			<span class="ml-auto font-arcade text-sm text-gold tabular-nums lg:text-base">{raiseTo}</span>
		</div>

		<input
			type="range"
			min={legal.minRaiseTo}
			max={legal.maxRaiseTo}
			step="1"
			bind:value={raiseTo}
			aria-label={m.table_raise({ amount: raiseTo })}
			class="h-8 w-full accent-gold"
		/>
	{/if}

	<!-- Three wide targets along the bottom, reachable one-handed. -->
	<div class="grid grid-cols-3 gap-2">
		<button
			type="button"
			onclick={() => onact({ type: 'fold' })}
			class="px-btn px-btn-danger py-4 text-base font-bold"
		>
			{m.table_fold()}
		</button>

		{#if legal.canCheck}
			<button
				type="button"
				onclick={() => onact({ type: 'check' })}
				class="px-btn py-4 text-base font-bold"
			>
				{m.table_check()}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => onact({ type: 'call' })}
				class="px-btn py-4 text-base font-bold"
			>
				{m.table_call({ amount: legal.callAmount })}
			</button>
		{/if}

		<button
			type="button"
			disabled={!legal.canRaise}
			onclick={() => onact({ type: 'raise', to: raiseTo })}
			class="px-btn px-btn-primary py-4 text-base font-bold"
		>
			{isShove ? m.table_all_in() : m.table_raise({ amount: raiseTo })}
		</button>
	</div>
</section>
