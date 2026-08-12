<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<!-- Only anonymous visitors get here; the load redirects everyone else to the lobby. -->
<main class="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-8 p-5">
	<h1 class="font-arcade text-3xl text-gold lg:text-4xl">{m.app_name()}</h1>
	<p class="text-center text-lg text-muted">{m.home_tagline()}</p>

	<a href={resolve('/auth')} class="px-btn px-btn-primary w-full px-6 py-4 text-lg font-bold">
		{m.home_login_cta()}
	</a>
</main>
