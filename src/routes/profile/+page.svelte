<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import { resizeAvatar } from '$lib/avatar';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// A writable derived: the field owns the value while it is being edited, but
	// re-seeds whenever the server's idea of the name changes. The server trims,
	// so after saving the box should show what was actually stored.
	let username = $derived(data.username);
	let avatarPreview = $state<string | null>(null);
	let submitting = $state(false);

	/**
	 * Busts the browser's cache of the avatar after a successful upload.
	 *
	 * The image is served with a one-minute cache, so without a changing query
	 * the page would keep showing the picture that was just replaced and the
	 * upload would look like it failed.
	 */
	let avatarVersion = $state(0);

	const error = $derived(form?.code ? errorMessage(form.code) : null);

	function errorMessage(code: string): string {
		const messages: Record<string, () => string> = {
			invalid_username: m.error_invalid_username,
			username_taken: m.error_username_taken,
			invalid_avatar: m.error_invalid_avatar
		};
		return (messages[code] ?? m.error_invalid_avatar)();
	}

	function previewAvatar(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (avatarPreview) URL.revokeObjectURL(avatarPreview);
		avatarPreview = file ? URL.createObjectURL(file) : null;
	}
</script>

<svelte:head><title>{m.profile_title()} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-col gap-6 p-5 pb-16 lg:p-6">
	<header class="flex items-center justify-between gap-4 pt-2">
		<h1 class="font-arcade text-xl text-gold lg:text-2xl">{m.profile_title()}</h1>
		<a href={resolve('/games')} class="px-btn shrink-0 px-4 py-2 text-sm font-bold">
			{m.lobby_title()}
		</a>
	</header>

	{#if error}
		<p class="px-panel border-danger px-4 py-3 text-sm text-danger" role="alert">{error}</p>
	{:else if form?.saved}
		<p class="px-panel border-gold px-4 py-3 text-sm text-gold" role="status">
			{form.saved === 'username' ? m.profile_username_saved() : m.profile_avatar_saved()}
		</p>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="font-arcade text-xs text-muted">{m.profile_username()}</h2>

		<form method="POST" action="?/username" class="flex flex-col gap-2" use:enhance>
			<input
				name="username"
				bind:value={username}
				required
				autocapitalize="off"
				autocorrect="off"
				spellcheck="false"
				class="px-field px-3 py-3 text-base"
			/>
			<span class="text-xs text-muted">{m.profile_username_hint()}</span>
			<button
				disabled={username.trim() === data.username}
				class="px-btn px-4 py-3 font-bold disabled:opacity-40"
			>
				{m.profile_save()}
			</button>
		</form>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="font-arcade text-xs text-muted">{m.profile_avatar()}</h2>

		<form
			method="POST"
			action="?/avatar"
			enctype="multipart/form-data"
			class="flex flex-col gap-2"
			use:enhance={async ({ formData }) => {
				submitting = true;
				// Shrink the picture in the browser so we upload ~15 kB instead of ~4 MB.
				const picked = formData.get('avatar');
				if (picked instanceof File && picked.size > 0) {
					try {
						formData.set('avatar', await resizeAvatar(picked), 'avatar.webp');
					} catch {
						// Fall back to the original file; the server still validates it.
					}
				}
				return async ({ update, result }) => {
					await update({ reset: false });
					if (result.type === 'success') {
						avatarVersion++;
						if (avatarPreview) URL.revokeObjectURL(avatarPreview);
						avatarPreview = null;
						// Every other avatar on the site is a plain /avatar/<id>, so
						// refresh the data rather than trying to bust each of them.
						await invalidateAll();
					}
					submitting = false;
				};
			}}
		>
			<div class="flex items-center gap-3">
				<img
					src={avatarPreview ?? `/avatar/${data.userId}?v=${avatarVersion}`}
					alt=""
					class="size-16 shrink-0 border-2 border-edge-hi object-cover"
				/>
				<input
					name="avatar"
					type="file"
					accept="image/*"
					required
					onchange={previewAvatar}
					class="min-w-0 flex-1 text-sm"
				/>
			</div>
			<span class="text-xs text-muted">{m.auth_avatar_hint()}</span>
			<button disabled={submitting} class="px-btn px-4 py-3 font-bold disabled:opacity-40">
				{m.profile_save()}
			</button>
		</form>
	</section>
</main>
