# Status

Current as of 2026-08-13, deployed and playable. Read alongside `../CLAUDE.md`,
which covers architecture and conventions.

**173 unit tests and 71 smoke checks pass. Type-check and lint are clean.**

---

## Built

| Area              | Commits                                 | Notes                                                                 |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------- |
| Scaffold          | `c28a674`                               | SvelteKit 5, Tailwind v4, Drizzle, Paraglide (nb/en), adapter-node    |
| Schema            | `179c123`                               | users, invites, games, seats, hands, hand events, chat, ledger        |
| Poker engine      | `81ac87e`                               | NLHE: crypto shuffle, blinds, min-raise, side pots, showdown          |
| Auth              | `1d982d7` `85a1ea4` `5558118`           | invite-only, session cookie + Argon2, avatars in Postgres             |
| Realtime + lobby  | `bbc62bc` `dcd9273`                     | WebSocket rooms, game creation, join by code                          |
| Table UI          | `b38cc88` `e53b170`                     | felt, seats, action clock, bet presets                                |
| Settle-up         | `5109b88` `826a0a7` `548e7a7`           | ledger, Boks fee, withdrawal list                                     |
| History + replay  | `a41ae6c`                               | scrubbable replay from the event log, chat, reactions                 |
| i18n              | `3f7704a`                               | language switcher, translated errors, catalogue parity test           |
| Pixel redesign    | `2391b7d` `c6cdc60`                     | arcade look, real chips, desktop-first layout                         |
| Fixes             | `056e311` `670ef9b` `d889f38` `2682f80` | see git log                                                           |
| Bug-fix pass      | `2e04f6d`                               | the six bugs below, plus 28 new smoke checks                          |
| Homelab deploy    | `0ac220c`                               | Dockerfiles, CI, and `homelab/applications/poker/`                    |
| Invites in the UI | uncommitted                             | `/invites`: anyone signed in can mint a code, list shows who spent it |

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

Added on 2026-08-13, all in `scripts/smoke.mjs`:

- **Four players at one table**, and a **three-way all-in** at 1000/300/100
  chips producing a real main pot plus two side pots, with chips conserved.
- **Reconnecting mid-hand**: a fresh socket is dealt back into the hand holding
  the same cards, and is not left sitting out.
- **Cashing out mid-hand**, including for real money: the seat is held until the
  hand settles and the payout is priced from the stack the hand left them
  (480 kr on a 500 kr buy-in that posted a 20 blind and folded), not the buy-in.
- **The action clock** both ways: a timed-out fold sits the player out, a
  timed-out free check does not.

### Not verified

- Anything on a **phone**. Layout is desktop-first and untested on a handset.
- **A full table of six.** Four is the most that has played at once.
- **A long session**: every test runs a handful of hands, not an evening.

---

## Deployed

Live at **poker.erikak.no**, manifests in `homelab/applications/poker/`. Use the
`new-homelab-project` skill for anything against the cluster.

- The image runs `server.js`, not `node build`: adapter-node's entry cannot host
  the WebSocket server, so both bundles ship and `server.js` wires them together.
- `drizzle-orm` and `postgres` must stay in **dependencies**. The SvelteKit
  bundle inlines them, but the socket bundle is built `--packages=external` and
  imports both at runtime, so `npm prune --production` would delete them.
- **One replica, `Recreate` strategy**, because live hand state is in memory.
- The HTTPRoute gives `/ws/game` its own rule with timeouts disabled. Envoy
  passes an HTTP/1.1 Upgrade through a normal route, but the default backend
  timeout would cut an idle table's socket.
- Secrets: `poker-postgresql-secret` and `poker-bootstrap-secret`, both sealed.
  `ORIGIN` is a plain env var and must be set, or SvelteKit rejects form posts.
- **A push to `main` does not redeploy.** The `:main` tag is reused, so ArgoCD
  sees no diff — run `kubectl rollout restart deployment/poker -n poker` once CI
  has built the image. Schema changes re-apply on their own via the migrate Job.
- The GHCR packages (`poker`, `poker-migrate`) must be **public**, or the
  cluster gets a 401 pulling them. Package visibility is separate from repo
  visibility and is a UI-only setting.

## Remaining work

Nothing blocking. See the nice-to-haves below.

---

## Open bugs

None known. The six that were open were fixed on 2026-08-13.

### Fixed on 2026-08-13

1. **Auto-check no longer sits a player out.** `actOnTimeout()` sat the player
   out whichever action the clock took. A timed-out fold still does, because it
   threw a hand away; a free check only does after three in a row
   (`CHECKS_BEFORE_SITTING_OUT`), counted on `RoomPlayer.timeouts` and reset by
   any action, reconnect or rebuy.
2. **Cashing out of a running game.** The control moved to the sidebar, is
   worded _cash out_ for money games, and asks for a second click because it
   folds a live hand.

   The server half mattered more: `leave()` mid-hand used to fold and sit the
   player out without ever cashing them out, and the immediate path paid from
   `player.stack`, which is only refreshed at settlement — so a player who
   folded after betting would have been paid for chips already in the pot. Leaves
   are now queued in `GameRoom.leaving` and settled by `finishPendingLeaves()`
   once stacks are real. A queued player folds the moment the action reaches
   them rather than holding the table for a full clock.

3. **The board scales with the felt** (`boardSize`/`potChipSize` off a measured
   width) and the centre block is capped at 60% of the felt height, so a river
   plus a pot label no longer reaches the seat ring.
4. **Digits are legible.** `.px-num` in `layout.css` renders numbers a player
   must read exactly — stacks, bets, pots, money — in Press Start 2P, which
   separates 2, 5 and 8. Sized at `0.82em` to sit level with the body face.
5. **Chip counts stay inside the seat plate.** `drawablePile()` takes a
   `maxColumns` cap (cheapest colours dropped first, two on a seat), and the
   number moved onto its own line — with its `×N` label a single column is wider
   than it looks. Checked in a browser at 1500, 1000 and 720 px.
6. **Reactions are no longer stored.** Both the live path and the backlog threw
   them away before rendering, so the rows were read by nothing — and they
   shared the 50-row chat backlog, meaning a burst of emoji could push every
   real message out of what a joining player sees. `GameRoom.reaction()` now
   broadcasts them transiently with a negative id; `recentChat()` excludes the
   rows older games still have.

---

## Nice-to-haves, not started

- Season stats and a leaderboard across games.
- Spectator rail for busted players.
- Tournament / SNG mode with rising blinds.
- Other variants: PLO, short deck, five-card draw.
- Push notifications for "it's your turn" (deferred from v1).
- Resuming an interrupted hand from the event log rather than voiding it.
- A profile page to change avatar or password after signup.
