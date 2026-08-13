# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A private, invite-only poker site for a friend group who moved apart and can no
longer play in person. Norwegian first, English second. Real-money games settle
through a Vipps "Boks"; play-money games are a first-class option.

**Read `docs/STATUS.md` first** — it holds the current state, what is verified,
and the open bug list.

## Commands

```powershell
npm run dev          # Vite dev server on :5173, with the WebSocket server attached
npm run build        # vite build + esbuild bundle of the socket server
npm start            # production: node server.js (needs both bundles)
npm run check        # svelte-kit sync + svelte-check — the correctness gate
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
npm test             # vitest run (unit tests only, no database needed)
npx drizzle-kit push --force   # sync schema.ts to the database
node scripts/smoke.mjs         # end-to-end, needs a running dev server + clean database
```

`npm run db:push` prompts for confirmation and there is no TTY here, so always
use `npx drizzle-kit push --force`.

## Local setup

```powershell
docker run -d --name poker-pg -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_USER=postgres -e POSTGRES_DB=poker -p 5432:5432 postgres:17-alpine
npx drizzle-kit push --force
docker exec poker-pg psql -U postgres -d poker -c "INSERT INTO invite (code) VALUES ('VENN1');"
npm run dev
```

Registration is invite-only. `BOOTSTRAP_INVITE_CODE` in `.env` creates the very
first account and only works while the user table is empty; everyone else needs
a row in `invite`.

## Architecture

### Two bundles, one process

SvelteKit and the WebSocket server are compiled **separately** — SvelteKit by
Vite, the socket server by esbuild into `build-server/`. They cannot share an
in-memory hub, so responsibilities are split instead:

- **SvelteKit** owns durable data through Postgres: accounts, games, seats, hand
  events, chat, ledger.
- **`GameRoom`** owns live hand state and is its only writer.

Because the socket bundle cannot resolve `$lib` or `$env`, anything it touches
must use **relative imports** and take its database from `createDb(url)`.

Dev wiring uses `ssrLoadModule` inside a Vite plugin (`vite.config.ts`); a
top-level import would drag the whole server graph into the config file.
Production wiring lives in `server.js`.

### The room is the authority

`src/lib/server/game/room.ts` deals the cards, runs the action clock and settles
hands. Nothing trusts a client. `viewFor()` is the **only** path state reaches a
player, which makes it the single place hole cards could leak — every other
seat's cards become a count.

Live hand state exists only in memory, so **the deployment must stay at one
replica**. Two pods would split the tables.

### The event log

Every hand action is appended to `hand_event`. It is both the crash-recovery log
and the hand-history/replay source. An interrupted hand is **voided, not
resumed**: stacks are only written at settlement, so everyone gets their chips
back and a fresh hand deals.

### Money

- **One chip is one krone.** A real-money game has no separate stack setting —
  the buy-in _is_ the stack, so a chip is worth exactly 100 øre and nothing
  rounds away. Blinds are in kroner too.
- Amounts are integer **øre** everywhere. Never floats.
- The Boks is the pot: buy-ins are paid in, winnings withdrawn. Nobody can owe
  anyone, so settlement is a **withdrawal list**, not payments between players.
- Vipps keeps **19 kr per whole 1000 kr** held. Whole thousands only. It is
  carried proportionally by whoever withdraws, which is what physically happens.
- For a settled session the fee is reported as the actual gap between money in
  and out, so changing the rule later cannot rewrite a past night's accounts.

**There is no Vipps API.** Its credentials need a registered business, which
Erik does not have. The Boks code is stored purely to render as text — the app
can never read a balance or verify a payment. Do not propose Vipps integration.

## Testing

Unit tests are pure and need no database — the poker engine, settlement maths,
chip denominations, replay frames and input validation are all written to be
testable in isolation. Keep it that way; put database-free logic in its own
module rather than reaching for a mock.

`scripts/smoke.mjs` drives the real HTTP and WebSocket paths and covers what
unit tests cannot: invite consumption, session cookies, socket auth, per-player
card visibility, the money path. **It needs an empty user table and an unused
`FRIEND1` invite**, so reset the database before running it.

## Conventions

- Svelte 5 runes throughout. No `export let`, no stores.
- Server-only code lives under `$lib/server`; anything a component imports must
  not (see `$lib/money.ts`, split out for exactly this reason).
- Loads throw bare codes (`game_not_found`), and `+error.svelte` translates
  them. Never put user-facing prose in the server.
- Every string goes in both `messages/nb.json` and `messages/en.json`.
  `src/lib/i18n.test.ts` fails the build if they drift.
- Styling is a pixel-art system: square corners, hard offset shadows, no blur.
  Component classes are `.px-panel`, `.px-btn`, `.px-field`, `.px-felt` in
  `src/routes/layout.css`.
- **Desktop is the primary target.** Everyone plays at their own computer.

## Gotchas

- **PowerShell 5.1 mangles double quotes** passed to native executables. Commit
  messages containing `"` get split into pathspecs — use `git commit -F <file>`.
- `psql -c "select ... from \"user\""` fails the same way. Quote the whole
  argument in single quotes and escape as `\"user\"`.
- Paths containing `[code]` break PowerShell globbing; use the Edit tool or the
  Grep tool instead of `Select-String -Path`.
- `src/lib/paraglide` is generated at build time and gitignored. `svelte-kit
sync` does not create it — run a build before `npm run check` on a fresh
  clone, or the message imports will not resolve.
- There is **no `svelte.config.js`**. This toolchain configures the adapter
  inside `sveltekit()` in `vite.config.ts`.
- The workspace `new-web-project` skill is stale on both of the above.
