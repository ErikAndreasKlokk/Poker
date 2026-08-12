<script lang="ts">
	import { m } from '$lib/paraglide/messages.js';
	import type { Card } from '$lib/protocol';

	let {
		card = null,
		size = 'md'
	}: {
		/** null renders a face-down card. */
		card?: Card | null;
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const SUIT_SYMBOLS = { c: '♣', d: '♦', h: '♥', s: '♠' } as const;

	const rank = $derived(card ? card.slice(0, -1).replace('T', '10') : '');
	const suit = $derived(card ? (card.slice(-1) as keyof typeof SUIT_SYMBOLS) : null);
	const isRed = $derived(suit === 'h' || suit === 'd');

	const sizeClasses = {
		sm: 'h-9 w-6.5 text-[0.6rem] rounded',
		md: 'h-14 w-10 text-sm rounded-md',
		lg: 'h-20 w-14 text-lg rounded-lg'
	} as const;
</script>

{#if card}
	<span
		class="inline-flex shrink-0 flex-col items-center justify-center bg-white leading-none font-semibold shadow-sm ring-1 ring-black/10 {sizeClasses[
			size
		]}"
		class:text-rose-600={isRed}
		class:text-neutral-900={!isRed}
		aria-label={card}
	>
		<span>{rank}</span>
		<span aria-hidden="true">{SUIT_SYMBOLS[suit!]}</span>
	</span>
{:else}
	<!-- Face down: a plain patterned back, no information leaked. -->
	<span
		class="inline-flex shrink-0 bg-sky-800 bg-[repeating-linear-gradient(45deg,transparent,transparent_3px,rgba(255,255,255,0.12)_3px,rgba(255,255,255,0.12)_6px)] shadow-sm ring-1 ring-black/20 {sizeClasses[
			size
		]}"
		aria-label={m.a11y_face_down_card()}
	></span>
{/if}
