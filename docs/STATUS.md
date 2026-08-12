# Status

Current as of 2026-08-13, at commit `2682f80`. Read alongside `../CLAUDE.md`,
which covers architecture and conventions.

**156 → 164 unit tests and 41 smoke checks pass. Type-check and lint are clean.**

---

## Built

| Area | Commits | Notes |
| --- | --- | --- |
| Scaffold | `c28a674` | SvelteKit 5, Tailwind v4, Drizzle, Paraglide (nb/en), adapter-node |
| Schema | `179c123` | users, invites, games, seats, hands, hand events, chat, ledger |
| Poker engine | `81ac87e` | NLHE: crypto shuffle, blinds, min-raise, side pots, showdown |
| Auth | `1d982d7` `85a1ea4` `5558118` | invite-only, session cookie + Argon2, avatars in Postgres |
| Realtime + lobby | `bbc62bc` `dcd9273` | WebSocket rooms, game creation, join by code |
| Table UI | `b38cc88` `e53b170` | felt, seats, action clock, bet presets |
| Settle-up | `5109b88` `826a0a7` `548e7a7` | ledger, Boks fee, withdrawal list |
| History + replay | `a41ae6c` | scrubbable replay from the event log, chat, reactions |
| i18n | `3f7704a` | language switcher, translated errors, catalogue parity test |
| Pixel redesign | `2391b7d` `c6cdc60` | arcade look, real chips, desktop-first layout |
| Fixes | `056e311` `670ef9b` `d889f38` `2682f80` | see git log |

### Decisions worth not relitigating

- **No Vipps API.** Credentials require a registered business. The Boks code is
  display-only; the app can never verify a payment.
- **One chip is one krone** for real-money games. The buy-in is the stack.
- **Settlement is a withdrawal list**, not player-to-player payments, because
  the Boks holds the money.
- **Single replica**, because live hand state is in memory.
- Push notifications, tournaments and other poker variants are phase 2.

### Verified against a real database

Registration and invite reuse, session cookies, socket auth, seating, dealing,
per-player card visibility, blinds, the action clock, payouts, chip
conservation, chat, auto-dealing, the money path end to end (2 × 500 kr in,
981 kr out after the 19 kr fee), hand history, replay, and the reveal policy.

### Not verified

- Anything on a **phone**. Layout is desktop-first and untested on a handset.
- **Three or more players at once.** Every test has been heads-up.
- **Side pots in a live game.** The engine has unit tests for them, but no real
  table has produced one.
- **Reconnect mid-hand** with a hand actually in progress.

---

## Remaining work

### Homelab deploy — the only unstarted item

Use the `new-homelab-project` skill. Needs more than the usual template:

- `Dockerfile` must run `server.js`, not `node build`, and produce **both**
  bundles (`npm run build` does both).
- `Dockerfile.migrate` running `drizzle-kit push --force`.
- Ingress must allow **WebSocket upgrades** on `/ws/game/*`.
- **One replica, `Recreate` strategy.** Two pods would split the tables, and a
  rolling update would run two at once.
- Secrets: `DATABASE_URL`, `ORIGIN`, `BOOTSTRAP_INVITE_CODE`.
- `ORIGIN` must be set or SvelteKit rejects form posts behind the ingress.

---

## Open bugs, newest first

### 1. Auto-check marks a player as sitting out

`src/lib/server/game/room.ts` — `actOnTimeout()` sets `player.sittingOut = true`
whichever action the clock took. Timing out on a **free check** costs nothing and
should not remove someone from the table, but "Sitter over" appears under them.

Fix: only sit out when the timeout produced a fold, or after two or three
consecutive timeouts rather than the first.

### 2. No way to cash out of a running game

`src/routes/games/[code]/+page.svelte` — the leave button is gated on
`table.status === 'lobby'`, and on your turn the action bar replaces that slot
entirely. So once a game starts **there is no way to leave**, which is also the
only way to bank your chips.

`room.leave()` already does the right thing (folds if mid-hand, records a
cash-out at the chip rate). This is purely a missing control. Probably wants to
live in the sidebar next to "End the session", and to read as *cash out* rather
than *leave* when playing for money.

### 3. Cards overflow the seat plates

Board cards are `lg` (6.5rem) and the centre block grows as streets are dealt,
so with a full board it runs into the seats. Hole cards may also spill below
their plate.

Fix: probably scale the board with the felt (a smaller size below some width),
or give the centre block a max height and let the seat ring breathe.
`positionFor()` in the table page controls the ring radii.

### 4. Digits 2, 5 and 8 are hard to tell apart

Pixelify Sans renders them too similarly at the sizes stacks and pots use. This
matters — misreading a stack is a real problem at a poker table.

Options: use the arcade face (Press Start 2P) for all numerals, bump numeric
sizes, or swap the body font for a pixel face with clearer digits. Numbers
already carry `tabular-nums`, so only the glyphs are at issue.

### 5. Chip counts overflow the seat plate

`ChipStack` lays each denomination out as its own column and then the total. A
pile with four colours plus the number is wider than the plate has room for
beside the avatar.

Fix: cap the columns drawn on a seat (the pot can afford more), or move the
number onto its own line, or drop to two colours at `xs`.

### 6. Reactions are stored but never shown as chat

Deliberate, but worth revisiting: reactions are written to `chat_message` with
`kind='reaction'` and only ever rendered as a floating animation. Either lean
into it (reaction counts on a replay) or stop storing them.

---

## Nice-to-haves, not started

- Season stats and a leaderboard across games.
- Spectator rail for busted players.
- Tournament / SNG mode with rising blinds.
- Other variants: PLO, short deck, five-card draw.
- Push notifications for "it's your turn" (deferred from v1).
- Resuming an interrupted hand from the event log rather than voiding it.
- A profile page to change avatar or password after signup.
- Invite management in the UI — codes are inserted by hand in SQL today.
