<script lang="ts">
	import { getLocale, locales, setLocale } from '$lib/paraglide/runtime';

	type Locale = (typeof locales)[number];

	const LABELS: Record<string, string> = { nb: 'Norsk', en: 'English' };

	let current = $state<Locale>(getLocale());

	async function choose(locale: Locale) {
		if (locale === current) return;
		current = locale;

		// Save against the account first: setLocale reloads the page, which would
		// otherwise cancel the request in flight.
		try {
			await fetch('/locale', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ locale })
			});
		} catch {
			// Not worth blocking the switch; the cookie still applies on this device.
		}

		setLocale(locale);
	}
</script>

<div class="flex items-center gap-1" role="group">
	{#each locales as locale (locale)}
		<button
			type="button"
			onclick={() => choose(locale)}
			aria-current={locale === current ? 'true' : undefined}
			class="rounded-md px-2 py-1 text-xs font-medium transition"
			class:bg-neutral-200={locale === current}
			class:dark:bg-neutral-800={locale === current}
			class:text-neutral-500={locale !== current}
		>
			{LABELS[locale] ?? locale}
		</button>
	{/each}
</div>
