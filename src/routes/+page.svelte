<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 p-5">
	<header class="flex items-center justify-between gap-3 pt-2">
		<h1 class="text-2xl font-semibold tracking-tight">{m.app_name()}</h1>

		{#if data.user}
			<div class="flex items-center gap-3">
				<img
					src="/avatar/{data.user.id}"
					alt=""
					class="size-9 rounded-full bg-neutral-200 object-cover dark:bg-neutral-800"
				/>
				<span class="text-sm font-medium">{data.user.username}</span>
				<form method="POST" action="/logout">
					<button class="text-sm text-neutral-500 underline underline-offset-4">
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
		<p class="text-neutral-500">…</p>
	{/if}
</main>
