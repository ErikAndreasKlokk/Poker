<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import PlayingCard from '$lib/components/PlayingCard.svelte';
	import { frameTotal, type ReplayFrame } from '$lib/replay';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let step = $state(0);
	let playing = $state(false);

	const frames = $derived(data.frames as ReplayFrame[]);
	const frame = $derived(frames[Math.min(step, frames.length - 1)] ?? null);

	// Auto-advance while playing, stopping at the end rather than looping.
	$effect(() => {
		if (!playing) return;
		const id = setInterval(() => {
			if (step >= frames.length - 1) {
				playing = false;
				return;
			}
			step += 1;
		}, 1200);
		return () => clearInterval(id);
	});

	function who(seat: number | null): string {
		if (seat === null) return '';
		return data.seatNames[seat] ?? m.replay_seat({ seat });
	}

	const streetNames: Record<string, () => string> = {
		preflop: m.street_preflop,
		flop: m.street_flop,
		turn: m.street_turn,
		river: m.street_river
	};

	function describe(f: ReplayFrame): string {
		const name = who(f.seat);
		switch (f.kind) {
			case 'blind':
				return f.action === 'small'
					? m.replay_blind_small({ who: name, amount: f.amount ?? 0 })
					: m.replay_blind_big({ who: name, amount: f.amount ?? 0 });
			case 'action':
				if (f.action === 'fold') return m.replay_folds({ who: name });
				if (f.action === 'check') return m.replay_checks({ who: name });
				if (f.action === 'call') return m.replay_calls({ who: name, amount: f.amount ?? 0 });
				return m.replay_raises({ who: name, amount: f.amount ?? 0 });
			case 'board':
				return m.replay_board({ street: (streetNames[f.street] ?? m.street_flop)() });
			case 'showdown':
				return m.replay_showdown({ who: name, hand: f.description ?? '' });
			case 'payout':
				return m.replay_payout({ who: name, amount: f.amount ?? 0 });
		}
	}

	/** Seats mentioned anywhere in the hand, so the layout doesn't jump around. */
	const seats = $derived.by(() => {
		// A plain array: at most nine seats, and it avoids a reactive Set.
		const found: number[] = [];
		const add = (seat: number) => {
			if (!found.includes(seat)) found.push(seat);
		};

		for (const f of frames) {
			for (const seat of Object.keys(f.committed)) add(Number(seat));
			for (const seat of Object.keys(f.hole)) add(Number(seat));
			if (f.seat !== null) add(f.seat);
		}
		return found.sort((a, b) => a - b);
	});
</script>

<svelte:head><title>{m.replay_title({ number: data.handNumber })} · {data.name}</title></svelte:head
>

<main class="mx-auto flex w-full max-w-md flex-col gap-4 p-5 pb-16">
	<header class="flex items-start justify-between gap-3 pt-2">
		<div class="min-w-0">
			<h1 class="truncate text-2xl font-semibold tracking-tight">
				{m.replay_title({ number: data.handNumber })}
			</h1>
			<p class="text-sm text-muted">{data.name}</p>
		</div>
		<a
			href={resolve('/games/[code]/hands', { code: data.code })}
			class="shrink-0 text-sm text-muted underline underline-offset-4"
		>
			{m.replay_back()}
		</a>
	</header>

	{#if !frame}
		<p class="text-muted">{m.replay_empty()}</p>
	{:else}
		<section class="px-felt flex flex-col items-center gap-3 px-4 py-6">
			<div class="flex min-h-14 items-center gap-1">
				{#each frame.board as card (card)}
					<PlayingCard {card} size="md" />
				{/each}
			</div>
			<span
				class="border-2 border-felt-dark bg-ink/70 px-2 py-1 font-arcade text-[0.6rem] text-gold tabular-nums"
			>
				{m.table_pot()}
				{frameTotal(frame)}
			</span>
		</section>

		<p class="min-h-6 text-center text-sm font-medium">{describe(frame)}</p>

		<ul class="flex flex-col gap-2">
			{#each seats as seat (seat)}
				{@const isFolded = frame.folded.includes(seat)}
				<li
					class="px-panel flex items-center gap-3 p-3"
					class:opacity-50={isFolded}
					class:border-gold={frame.seat === seat}
				>
					<span class="min-w-0 flex-1 truncate text-sm font-medium">{who(seat)}</span>

					<span class="flex gap-1">
						{#if frame.hole[seat]}
							{#each frame.hole[seat] as card (card)}
								<PlayingCard {card} size="sm" />
							{/each}
						{:else}
							<PlayingCard size="sm" />
							<PlayingCard size="sm" />
						{/if}
					</span>

					<span class="w-12 text-right text-sm tabular-nums">
						{frame.committed[seat] ? `+${frame.committed[seat]}` : ''}
					</span>
				</li>
			{/each}
		</ul>

		{#if !data.sessionEnded}
			<p class="text-xs text-muted">{m.replay_hidden_cards()}</p>
		{/if}

		<section class="px-panel sticky bottom-2 flex flex-col gap-2 p-3">
			<span class="text-center text-xs text-muted">
				{m.replay_step({ current: step + 1, total: frames.length })}
			</span>
			<input
				type="range"
				min="0"
				max={frames.length - 1}
				bind:value={step}
				aria-label={m.replay_step({ current: step + 1, total: frames.length })}
				class="h-8 w-full accent-gold"
			/>
			<div class="grid grid-cols-3 gap-2">
				<button
					type="button"
					disabled={step === 0}
					onclick={() => (step = Math.max(0, step - 1))}
					class="px-btn py-3 text-sm font-bold"
				>
					{m.replay_previous()}
				</button>
				<button
					type="button"
					onclick={() => (playing = !playing)}
					class="px-btn px-btn-primary py-3 text-sm font-bold"
				>
					{playing ? m.replay_pause() : m.replay_play()}
				</button>
				<button
					type="button"
					disabled={step >= frames.length - 1}
					onclick={() => (step = Math.min(frames.length - 1, step + 1))}
					class="px-btn py-3 text-sm font-bold"
				>
					{m.replay_next()}
				</button>
			</div>
		</section>
	{/if}
</main>
