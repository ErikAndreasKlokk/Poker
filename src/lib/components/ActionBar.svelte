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
	class="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-emerald-500/60 bg-white/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur dark:bg-neutral-950/95"
>
	<div class="flex items-center justify-between text-sm">
		<span class="font-semibold text-emerald-700 dark:text-emerald-400">{m.table_your_turn()}</span>
		{#if secondsLeft !== null}
			<span
				class="font-mono tabular-nums"
				class:text-rose-600={secondsLeft <= 5}
				class:text-neutral-500={secondsLeft > 5}
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
						class="rounded-md bg-neutral-200 px-2.5 py-1.5 text-xs font-medium dark:bg-neutral-800"
						class:ring-2={raiseTo === preset.to}
						class:ring-emerald-500={raiseTo === preset.to}
					>
						{preset.label}
					</button>
				{/each}
			</div>
			<span class="ml-auto font-mono text-sm font-semibold tabular-nums">{raiseTo}</span>
		</div>

		<input
			type="range"
			min={legal.minRaiseTo}
			max={legal.maxRaiseTo}
			step="1"
			bind:value={raiseTo}
			aria-label={m.table_raise({ amount: raiseTo })}
			class="h-8 w-full accent-emerald-600"
		/>
	{/if}

	<!-- Three wide targets along the bottom, reachable one-handed. -->
	<div class="grid grid-cols-3 gap-2">
		<button
			type="button"
			onclick={() => onact({ type: 'fold' })}
			class="rounded-xl bg-neutral-200 py-4 text-sm font-semibold active:scale-[0.98] dark:bg-neutral-800"
		>
			{m.table_fold()}
		</button>

		{#if legal.canCheck}
			<button
				type="button"
				onclick={() => onact({ type: 'check' })}
				class="rounded-xl bg-neutral-200 py-4 text-sm font-semibold active:scale-[0.98] dark:bg-neutral-800"
			>
				{m.table_check()}
			</button>
		{:else}
			<button
				type="button"
				onclick={() => onact({ type: 'call' })}
				class="rounded-xl bg-neutral-200 py-4 text-sm font-semibold active:scale-[0.98] dark:bg-neutral-800"
			>
				{m.table_call({ amount: legal.callAmount })}
			</button>
		{/if}

		<button
			type="button"
			disabled={!legal.canRaise}
			onclick={() => onact({ type: 'raise', to: raiseTo })}
			class="rounded-xl bg-emerald-600 py-4 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-40"
		>
			{isShove ? m.table_all_in() : m.table_raise({ amount: raiseTo })}
		</button>
	</div>
</section>
