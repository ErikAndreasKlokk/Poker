<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	/** The code whose copy button was last pressed, to confirm it worked. */
	let copied = $state<string | null>(null);

	async function copy(code: string) {
		try {
			await navigator.clipboard.writeText(code);
			copied = code;
			setTimeout(() => (copied = null), 2000);
		} catch {
			// Clipboard access can be refused; the code is on screen to read anyway.
		}
	}

	/** Dates as plain ISO days: unambiguous, and identical on server and client. */
	function day(value: Date | string) {
		return new Date(value).toISOString().slice(0, 10);
	}
</script>

<svelte:head><title>{m.invites_title()} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-5 pb-16 lg:p-6">
	<header class="flex items-center justify-between gap-4 pt-2">
		<h1 class="font-arcade text-xl text-gold lg:text-2xl">{m.invites_title()}</h1>
		<a href={resolve('/games')} class="px-btn shrink-0 px-4 py-2 text-sm font-bold">
			{m.lobby_title()}
		</a>
	</header>

	<p class="text-sm text-muted">{m.invites_hint()}</p>

	<form method="POST" action="?/create" use:enhance>
		<button class="px-btn px-btn-primary w-full py-3 font-bold">{m.invites_new()}</button>
	</form>

	{#if form?.created}
		<p class="px-panel border-gold px-4 py-3 text-sm text-gold" role="status">
			{m.invites_created({ code: form.created })}
		</p>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="font-arcade text-xs text-muted">{m.invites_all()}</h2>

		{#if data.invites.length === 0}
			<p class="text-muted">{m.invites_none()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each data.invites as invite (invite.code)}
					<li
						class="px-panel flex flex-wrap items-center justify-between gap-3 p-4
							{invite.usedAt ? 'opacity-60' : ''}"
					>
						<span class="flex min-w-0 flex-col gap-1">
							<span class="font-mono text-base font-bold break-all">{invite.code}</span>
							<span class="text-xs text-muted">
								{#if invite.createdBy}
									{m.invites_made_by({ username: invite.createdBy })}
								{:else}
									{m.invites_made_outside()}
								{/if}
								· {day(invite.createdAt)}
							</span>
						</span>

						<span class="flex shrink-0 items-center gap-3">
							{#if invite.usedBy}
								<span class="text-xs text-muted">
									{m.invites_used_by({ username: invite.usedBy })}
								</span>
							{:else if invite.usedAt}
								<span class="text-xs text-muted">{m.invites_used()}</span>
							{:else}
								<span class="border-2 border-success px-1.5 py-0.5 text-[0.6rem] text-success">
									{m.invites_unused()}
								</span>
								<button
									type="button"
									onclick={() => copy(invite.code)}
									class="px-btn px-3 py-1.5 text-xs font-bold"
								>
									{copied === invite.code ? m.invites_copied() : m.invites_copy()}
								</button>
							{/if}
						</span>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
