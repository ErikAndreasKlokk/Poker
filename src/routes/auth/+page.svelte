<script lang="ts">
	import { enhance } from '$app/forms';
	import { m } from '$lib/paraglide/messages.js';
	import { resizeAvatar } from '$lib/avatar';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();

	let mode = $state<'login' | 'register'>('login');
	let submitting = $state(false);
	let avatarPreview = $state<string | null>(null);

	// Only show an error on the tab that produced it.
	const error = $derived(form?.form === mode ? errorMessage(form.code) : null);

	function errorMessage(code: string): string {
		const messages: Record<string, () => string> = {
			invalid_username: m.error_invalid_username,
			invalid_phone: m.error_invalid_phone,
			invalid_password: m.error_invalid_password,
			invalid_invite: m.error_invalid_invite,
			username_taken: m.error_username_taken,
			phone_taken: m.error_phone_taken,
			invalid_credentials: m.error_invalid_credentials,
			invalid_avatar: m.error_invalid_avatar
		};
		return (messages[code] ?? m.error_invalid_credentials)();
	}

	function previewAvatar(event: Event) {
		const file = (event.currentTarget as HTMLInputElement).files?.[0];
		if (avatarPreview) URL.revokeObjectURL(avatarPreview);
		avatarPreview = file ? URL.createObjectURL(file) : null;
	}
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 p-5">
	<h1 class="text-center font-arcade text-2xl text-gold">{m.app_name()}</h1>

	<div class="px-inset grid grid-cols-2 gap-1 p-1">
		{#each [{ id: 'login', label: m.auth_login_tab() }, { id: 'register', label: m.auth_register_tab() }] as tab (tab.id)}
			<button
				type="button"
				class="px-4 py-2.5 text-sm font-bold transition"
				class:bg-surface-hi={mode === tab.id}
				class:text-gold={mode === tab.id}
				class:text-muted={mode !== tab.id}
				onclick={() => (mode = tab.id as typeof mode)}
			>
				{tab.label}
			</button>
		{/each}
	</div>

	{#if error}
		<p class="px-panel border-danger px-4 py-3 text-sm text-danger" role="alert">
			{error}
		</p>
	{/if}

	{#if mode === 'login'}
		<form
			method="POST"
			action="?/login"
			class="flex flex-col gap-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_username()}</span>
				<input
					name="username"
					autocomplete="username"
					required
					class="px-field px-3 py-3 text-base"
				/>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_password()}</span>
				<input
					name="password"
					type="password"
					autocomplete="current-password"
					required
					class="px-field px-3 py-3 text-base"
				/>
			</label>

			<button type="submit" disabled={submitting} class="px-btn px-btn-primary px-4 py-4 font-bold">
				{m.auth_login_submit()}
			</button>
		</form>
	{:else}
		<form
			method="POST"
			action="?/register"
			enctype="multipart/form-data"
			class="flex flex-col gap-4"
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
				return async ({ update }) => {
					await update();
					submitting = false;
				};
			}}
		>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_username()}</span>
				<input
					name="username"
					autocomplete="username"
					required
					class="px-field px-3 py-3 text-base"
				/>
				<span class="text-xs text-muted">{m.auth_username_hint()}</span>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_phone()}</span>
				<input
					name="phone"
					type="tel"
					inputmode="tel"
					autocomplete="tel"
					required
					class="px-field px-3 py-3 text-base"
				/>
				<span class="text-xs text-muted">{m.auth_phone_hint()}</span>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_password()}</span>
				<input
					name="password"
					type="password"
					autocomplete="new-password"
					required
					class="px-field px-3 py-3 text-base"
				/>
				<span class="text-xs text-muted">{m.auth_password_hint()}</span>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.auth_invite()}</span>
				<input name="invite" required class="px-field px-3 py-3 text-base" />
				<span class="text-xs text-muted">{m.auth_invite_hint()}</span>
			</label>

			<div class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">
					{m.auth_avatar()}
					<span class="font-normal text-muted">({m.auth_optional()})</span>
				</span>
				<div class="flex items-center gap-3">
					{#if avatarPreview}
						<img
							src={avatarPreview}
							alt=""
							class="size-14 shrink-0 border-2 border-edge-hi object-cover"
						/>
					{:else}
						<div class="px-inset size-14 shrink-0"></div>
					{/if}
					<input
						name="avatar"
						type="file"
						accept="image/*"
						onchange={previewAvatar}
						class="min-w-0 flex-1 text-sm"
					/>
				</div>
				<span class="text-xs text-muted">{m.auth_avatar_hint()}</span>
			</div>

			<button type="submit" disabled={submitting} class="px-btn px-btn-primary px-4 py-4 font-bold">
				{m.auth_register_submit()}
			</button>
		</form>
	{/if}
</main>
