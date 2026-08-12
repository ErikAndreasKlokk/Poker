<script lang="ts">
	import { breakdown, drawablePile } from '$lib/chips';

	let {
		amount,
		denominations,
		size = 'md',
		maxPerColumn = 4,
		showTotal = true
	}: {
		amount: number;
		denominations: number[];
		size?: 'xs' | 'sm' | 'md';
		/** How tall a single column is drawn; the count stays exact. */
		maxPerColumn?: number;
		showTotal?: boolean;
	} = $props();

	/** Cheapest colour first, so tier 0 is white and the dearest is gold. */
	const TIER_COLORS = [
		{ body: '#e8e6f0', edge: '#a8a4bd', mark: '#ffffff' },
		{ body: '#d13c48', edge: '#8c1f2a', mark: '#ff9aa2' },
		{ body: '#2f9e5e', edge: '#14603a', mark: '#87e8b0' },
		{ body: '#3d6fd6', edge: '#1e3a80', mark: '#9dbcff' },
		{ body: '#ffc94a', edge: '#a37613', mark: '#fff0c2' }
	];

	const SIZES = { xs: 8, sm: 11, md: 14 } as const;

	const columns = $derived(drawablePile(breakdown(amount, denominations), maxPerColumn));
	const px = $derived(SIZES[size]);
	/** Chips overlap so a column reads as a stack, but stay individually visible. */
	const overlap = $derived(Math.round(px * 0.55));
</script>

{#if amount > 0}
	<span class="inline-flex items-end gap-1">
		{#each columns as column (column.value)}
			{@const colors = TIER_COLORS[Math.min(column.tier, TIER_COLORS.length - 1)]}
			<span
				class="relative inline-flex flex-col-reverse items-center"
				title="{column.count} × {column.value}"
			>
				{#if column.count > column.drawn}
					<!-- The pile is capped for space, so say how many there really are. -->
					<span class="mt-0.5 text-[0.55rem] leading-none text-muted tabular-nums"
						>×{column.count}</span
					>
				{/if}
				{#each Array.from({ length: column.drawn }, (_, i) => i) as index (index)}
					<!-- 8x8 grid: an octagon body with four edge marks and a hollow centre. -->
					<svg
						width={px}
						height={px}
						viewBox="0 0 8 8"
						shape-rendering="crispEdges"
						style="margin-bottom: {index === 0 ? 0 : -overlap}px"
						aria-hidden="true"
					>
						<g fill={colors.edge}>
							<rect x="2" y="0" width="4" height="8" />
							<rect x="0" y="2" width="8" height="4" />
							<rect x="1" y="1" width="6" height="6" />
						</g>
						<g fill={colors.body}>
							<rect x="2" y="1" width="4" height="6" />
							<rect x="1" y="2" width="6" height="4" />
						</g>
						<g fill={colors.mark}>
							<rect x="3" y="1" width="2" height="1" />
							<rect x="3" y="6" width="2" height="1" />
							<rect x="1" y="3" width="1" height="2" />
							<rect x="6" y="3" width="1" height="2" />
						</g>
						<rect x="3" y="3" width="2" height="2" fill={colors.edge} />
					</svg>
				{/each}
			</span>
		{/each}

		{#if showTotal}
			<span class="ml-0.5 text-[0.7rem] leading-none font-semibold tabular-nums">{amount}</span>
		{/if}
	</span>
{/if}
