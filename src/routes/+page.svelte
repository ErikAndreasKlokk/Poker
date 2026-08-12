<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5">
	<header class="flex items-center justify-between gap-3 pt-2">
		<h1 class="text-2xl font-semibold tracking-tight">{m.app_name()}</h1>

		{#if data.user}
			<div class="flex items-center gap-3">
				<img
					src="/avatar/{data.user.id}"
					alt=""
					class="size-9 border-2 border-edge-hi object-cover"
				/>
				<span class="text-sm font-medium">{data.user.username}</span>
				<form method="POST" action="/logout">
					<button class="text-sm text-muted underline underline-offset-4">
						{m.log_out()}
					</button>
				</form>
			</div>
		{:else}
			<a href={resolve('/auth')} class="text-sm font-medium underline underline-offset-4">
				{m.auth_login_tab()}
			</a>
		{/if}
	</header>

	{#if data.user}
		<!-- The lobby lands here next; game creation and joining are still to come. -->
		<p class="text-muted">…</p>
	{/if}
</main>
