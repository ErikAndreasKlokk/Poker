<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';

	// Loads throw bare codes rather than prose so the message can be translated
	// here instead of being baked into the server in one language.
	const messages: Record<string, () => string> = {
		game_not_found: m.error_game_not_found,
		not_your_game: m.error_not_your_game,
		no_such_hand: m.error_no_such_hand,
		unsupported_locale: m.error_unsupported_locale
	};

	const text = $derived(
		messages[page.error?.message ?? '']?.() ??
			(page.status === 404 ? m.error_not_found() : m.error_unexpected())
	);
</script>

<svelte:head><title>{page.status} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 p-5">
	<p class="font-mono text-5xl font-semibold text-neutral-300 dark:text-neutral-700">
		{page.status}
	</p>
	<p class="text-center">{text}</p>
	<a href={resolve('/')} class="text-sm underline underline-offset-4">{m.error_go_home()}</a>
</main>
