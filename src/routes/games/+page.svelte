<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages.js';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let creating = $state(false);
	// Radio values arrive as strings; the server parses 'true' into the boolean.
	let moneyMode = $state('false');

	const errorMessages: Record<string, () => string> = {
		invalid_game_name: m.error_invalid_game_name,
		invalid_blinds: m.error_invalid_blinds,
		invalid_stack: m.error_invalid_stack,
		invalid_seats: m.error_invalid_seats,
		invalid_turn_seconds: m.error_invalid_turn_seconds,
		missing_boks_code: m.error_missing_boks_code,
		invalid_buy_in: m.error_invalid_buy_in,
		invalid_voice_url: m.error_invalid_voice_url,
		game_not_found: m.error_game_not_found
	};

	const error = $derived(form?.code ? (errorMessages[form.code]?.() ?? null) : null);

	const field =
		'rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900';
</script>

<svelte:head><title>{m.lobby_title()} · {m.app_name()}</title></svelte:head>

<main class="mx-auto flex w-full max-w-md flex-col gap-6 p-5 pb-16">
	<header class="flex items-center justify-between pt-2">
		<h1 class="text-2xl font-semibold tracking-tight">{m.lobby_title()}</h1>
		<a href={resolve('/')} class="text-sm text-neutral-500 underline underline-offset-4">
			{m.app_name()}
		</a>
	</header>

	{#if error}
		<p
			class="rounded-lg bg-red-100 px-4 py-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200"
			role="alert"
		>
			{error}
		</p>
	{/if}

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-semibold text-neutral-500 uppercase">{m.lobby_join_title()}</h2>
		<form method="POST" action="?/join" class="flex gap-2" use:enhance>
			<input
				name="code"
				required
				autocapitalize="characters"
				placeholder={m.lobby_join_code()}
				class="{field} min-w-0 flex-1 font-mono tracking-widest uppercase"
			/>
			<button
				class="rounded-lg bg-neutral-800 px-4 py-3 font-medium text-white dark:bg-neutral-200 dark:text-neutral-900"
			>
				{m.lobby_join_submit()}
			</button>
		</form>
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-semibold text-neutral-500 uppercase">{m.lobby_open_games()}</h2>

		{#if data.games.length === 0}
			<p class="text-neutral-500">{m.lobby_no_games()}</p>
		{:else}
			<ul class="flex flex-col gap-2">
				{#each data.games as game (game.id)}
					<li>
						<a
							href={resolve('/games/[code]', { code: game.code })}
							class="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800"
						>
							<span class="min-w-0">
								<span class="block truncate font-medium">{game.name}</span>
								<span class="block text-sm text-neutral-500">
									{m.lobby_seats({ seated: game.seated, max: game.maxSeats })}
									· {game.smallBlind}/{game.bigBlind}
									{#if game.realMoney}· {m.game_real_money()}{/if}
								</span>
							</span>
							<span class="flex shrink-0 flex-col items-end gap-1">
								<span class="font-mono text-sm tracking-widest">{game.code}</span>
								<span class="text-xs text-neutral-500">
									{game.status === 'running' ? m.game_status_running() : m.game_status_lobby()}
								</span>
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-sm font-semibold text-neutral-500 uppercase">{m.lobby_new_game()}</h2>

		<form
			method="POST"
			action="?/create"
			class="flex flex-col gap-4"
			use:enhance={() => {
				creating = true;
				return async ({ update }) => {
					await update();
					creating = false;
				};
			}}
		>
			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.game_name()}</span>
				<input name="name" required maxlength="60" class={field} />
			</label>

			<fieldset class="flex flex-col gap-2">
				<legend class="text-sm font-medium">{m.game_money_mode()}</legend>
				<div class="grid grid-cols-2 gap-2">
					<label
						class="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-3 dark:border-neutral-700"
					>
						<input type="radio" name="realMoney" value="false" bind:group={moneyMode} />
						<span class="text-sm">{m.game_play_money()}</span>
					</label>
					<label
						class="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-3 dark:border-neutral-700"
					>
						<input type="radio" name="realMoney" value="true" bind:group={moneyMode} />
						<span class="text-sm">{m.game_real_money()}</span>
					</label>
				</div>
			</fieldset>

			{#if moneyMode === 'true'}
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_boks_code()}</span>
					<input name="vippsBoksCode" class={field} />
					<span class="text-xs text-neutral-500">{m.game_boks_hint()}</span>
				</label>

				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_buy_in()}</span>
					<input name="buyInKr" inputmode="decimal" class={field} />
					<span class="text-xs text-neutral-500">{m.game_buy_in_hint()}</span>
				</label>
			{/if}

			<div class="grid grid-cols-2 gap-3">
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_small_blind()}</span>
					<input name="smallBlind" type="number" value="10" min="1" required class={field} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_big_blind()}</span>
					<input name="bigBlind" type="number" value="20" min="2" required class={field} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_starting_stack()}</span>
					<input name="startingStack" type="number" value="2000" required class={field} />
				</label>
				<label class="flex flex-col gap-1.5">
					<span class="text-sm font-medium">{m.game_max_seats()}</span>
					<input name="maxSeats" type="number" value="6" min="2" max="9" required class={field} />
				</label>
			</div>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">{m.game_turn_seconds()}</span>
				<input
					name="turnSeconds"
					type="number"
					value="30"
					min="10"
					max="120"
					required
					class={field}
				/>
			</label>

			<label class="flex flex-col gap-1.5">
				<span class="text-sm font-medium">
					{m.game_voice_url()}
					<span class="font-normal text-neutral-500">({m.auth_optional()})</span>
				</span>
				<input name="voiceChatUrl" type="url" placeholder="https://…" class={field} />
				<span class="text-xs text-neutral-500">{m.game_voice_hint()}</span>
			</label>

			<button
				type="submit"
				disabled={creating}
				class="rounded-lg bg-emerald-700 px-4 py-3 font-medium text-white disabled:opacity-60"
			>
				{m.game_create_submit()}
			</button>
		</form>
	</section>
</main>
