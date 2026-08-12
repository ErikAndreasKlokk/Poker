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

	// Square corners and hard shadows: no border radius anywhere in the deck.
	// Sized for a desktop screen — the earlier sizes were unreadable past arm's length.
	const sizeClasses = {
		sm: 'h-12 w-9 text-xs',
		md: 'h-[4.5rem] w-[3.25rem] text-lg',
		lg: 'h-[6.5rem] w-[4.75rem] text-2xl'
	} as const;
</script>

{#if card}
	<span
		class="inline-flex shrink-0 flex-col items-center justify-center border-2 border-neutral-900 bg-parchment leading-none font-bold shadow-[2px_2px_0_0_#00000080] {sizeClasses[
			size
		]}"
		class:text-danger={isRed}
		class:text-ink={!isRed}
		aria-label={card}
	>
		<span class="font-arcade">{rank}</span>
		<span class="text-[1.4em] leading-none" aria-hidden="true">{SUIT_SYMBOLS[suit!]}</span>
	</span>
{:else}
	<!-- Face down: a woven pixel back, carrying no information. -->
	<span
		class="inline-flex shrink-0 border-2 border-neutral-900 bg-[#3b2f7a] shadow-[2px_2px_0_0_#00000080] {sizeClasses[
			size
		]}"
		style="background-image: repeating-linear-gradient(45deg, #ffffff1f 0 2px, transparent 2px 4px), repeating-linear-gradient(-45deg, #00000033 0 2px, transparent 2px 4px)"
		aria-label={m.a11y_face_down_card()}
	></span>
{/if}
