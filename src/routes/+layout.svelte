<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
	The layout owns the viewport height so the footer always lands just below the
	content instead of a screen further down. Pages use flex-1, not min-h-dvh.
-->
<div class="flex min-h-dvh flex-col">
	{@render children()}

	<footer class="mx-auto flex w-full max-w-6xl justify-end px-5 pt-2 pb-6 lg:px-6">
		<LanguageSwitcher />
	</footer>
</div>
