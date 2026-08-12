/**
 * End-to-end smoke test against a running dev server and a real Postgres.
 *
 * There is no browser-driving test runner in this project, and the parts most
 * likely to break — invite consumption, session cookies, websocket auth, and
 * per-player card visibility — cannot be covered by the unit tests. This script
 * drives the real HTTP and WebSocket paths instead.
 *
 * Usage:
 *   docker run -d --name poker-pg -e POSTGRES_PASSWORD=postgres \
 *     -e POSTGRES_USER=postgres -e POSTGRES_DB=poker -p 5432:5432 postgres:17-alpine
 *   npx drizzle-kit push --force
 *   psql -c "insert into invite (code) values ('FRIEND1')"
 *   npm run dev
 *   node scripts/smoke.mjs
 *
 * Expects an empty user table and an unused invite named FRIEND1.
 */
import WebSocket from 'ws';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:5173';
const log = (...args) => console.log(...args);
let failures = 0;

function check(label, ok, detail = '') {
	log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
	if (!ok) failures++;
}

setTimeout(() => {
	log('\nGLOBAL TIMEOUT — run stalled');
	process.exit(1);
}, 90_000);

class Session {
	cookie = '';

	async post(path, data) {
		const res = await fetch(BASE + path, {
			method: 'POST',
			headers: {
				'content-type': 'application/x-www-form-urlencoded',
				// Without this SvelteKit returns the action result as JSON instead of
				// the redirect a real browser form post would get.
				accept: 'text/html',
				origin: BASE,
				...(this.cookie ? { cookie: this.cookie } : {})
			},
			body: new URLSearchParams(data),
			redirect: 'manual'
		});
		for (const c of res.headers.getSetCookie?.() ?? []) {
			if (c.startsWith('auth-session=')) this.cookie = c.split(';')[0];
		}
		return res;
	}

	get(path) {
		return fetch(BASE + path, {
			headers: this.cookie ? { cookie: this.cookie } : {},
			redirect: 'manual'
		});
	}
}

/** Wraps a socket so the script can await specific messages. */
class Client {
	messages = [];
	waiters = [];

	constructor(code, cookie, name) {
		this.name = name;
		this.socket = new WebSocket(`${BASE.replace(/^http/, 'ws')}/ws/game/${code}`, {
			headers: { cookie }
		});
		this.ready = new Promise((resolve, reject) => {
			this.socket.on('open', resolve);
			this.socket.on('error', reject);
		});
		this.socket.on('message', (raw) => {
			const message = JSON.parse(raw.toString());
			this.messages.push(message);
			for (const [predicate, resolve] of this.waiters.splice(0)) {
				if (predicate(message)) resolve(message);
				else this.waiters.push([predicate, resolve]);
			}
		});
	}

	send(message) {
		this.socket.send(JSON.stringify(message));
	}

	get table() {
		for (let i = this.messages.length - 1; i >= 0; i--) {
			if (this.messages[i].type === 'state') return this.messages[i].table;
		}
		return null;
	}

	until(predicate, label, timeout = 8000) {
		const hit = this.messages.find(predicate);
		if (hit) return Promise.resolve(hit);
		return new Promise((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error(`${this.name}: timed out waiting for ${label}`)),
				timeout
			);
			this.waiters.push([
				predicate,
				(message) => {
					clearTimeout(timer);
					resolve(message);
				}
			]);
		});
	}

	state(predicate, label, timeout = 8000) {
		return this.until((m) => m.type === 'state' && predicate(m.table), label, timeout);
	}
}

const stamp = Date.now().toString().slice(-6);

// --- Registration and invites --------------------------------------------

const erik = new Session();
let res = await erik.post('/auth?/register', {
	username: `erik${stamp}`,
	phone: `9${stamp}0`.slice(0, 8),
	password: 'hunter2hunter2',
	invite: 'dev-bootstrap'
});
check('register with bootstrap invite', res.status === 303, `status ${res.status}`);
check('session cookie issued', erik.cookie.length > 0);

// Fresh session: an already-logged-in poster gets bounced home by the page load
// after fail(), which would mask the 400.
const dupe = new Session();
res = await dupe.post('/auth?/register', {
	username: `dupe${stamp}`,
	phone: `9${stamp}1`.slice(0, 8),
	password: 'hunter2hunter2',
	invite: 'dev-bootstrap'
});
check('bootstrap invite refused once a user exists', res.status === 400, `status ${res.status}`);

res = await erik.get('/games');
check('authenticated user reaches the lobby', res.status === 200, `status ${res.status}`);

res = await new Session().get('/games');
check('anonymous user is redirected from the lobby', res.status === 302, `status ${res.status}`);

const ola = new Session();
res = await ola.post('/auth?/register', {
	username: `ola${stamp}`,
	phone: `9${stamp}2`.slice(0, 8),
	password: 'hunter2hunter2',
	invite: 'FRIEND1'
});
check('register with a real invite code', res.status === 303, `status ${res.status}`);

res = await new Session().post('/auth?/register', {
	username: `late${stamp}`,
	phone: `9${stamp}3`.slice(0, 8),
	password: 'hunter2hunter2',
	invite: 'FRIEND1'
});
check('invite cannot be used twice', res.status === 400, `status ${res.status}`);

// --- Game creation --------------------------------------------------------

res = await erik.post('/games?/create', {
	name: 'Smoke test',
	realMoney: 'false',
	smallBlind: '10',
	bigBlind: '20',
	startingStack: '1000',
	maxSeats: '6',
	turnSeconds: '60'
});
const location = res.headers.get('location') ?? '';
const code = location.split('/').pop() ?? '';
check('create game redirects to the table', res.status === 303 && code.length === 6, location);

// --- Realtime -------------------------------------------------------------

const erikWs = new Client(code, erik.cookie, 'erik');
const olaWs = new Client(code, ola.cookie, 'ola');
await Promise.all([erikWs.ready, olaWs.ready]);
check('both players connected over websocket', true);

await erikWs.state(() => true, 'initial state');
check('initial state received', erikWs.table?.code === code);

erikWs.send({ type: 'sit', seat: 0 });
await erikWs.state((t) => t.seats.length === 1, 'erik seated');
olaWs.send({ type: 'sit', seat: 1 });
await olaWs.state((t) => t.seats.length === 2, 'ola seated');
check('both players seated', olaWs.table.seats.length === 2);
check(
	'stacks funded from starting stack',
	olaWs.table.seats.every((s) => s.stack === 1000)
);

olaWs.send({ type: 'start' });
const refusal = await olaWs.until((m) => m.type === 'error', 'host-only error');
check('non-host cannot start the game', refusal.message === 'not_host', refusal.message);

erikWs.send({ type: 'start' });
// Await both, otherwise we may read one client's state before its update lands.
await Promise.all([
	erikWs.state((t) => t.status === 'running' && t.handNumber !== null, 'erik hand dealt'),
	olaWs.state((t) => t.status === 'running' && t.handNumber !== null, 'ola hand dealt')
]);

const erikTable = erikWs.table;
const olaTable = olaWs.table;

const erikSelf = erikTable.seats.find((s) => s.seat === 0);
const erikSeesOla = erikTable.seats.find((s) => s.seat === 1);
check(
	'player sees their own hole cards',
	erikSelf.hole?.length === 2,
	JSON.stringify(erikSelf.hole)
);
check('player cannot see the opponent hole cards', erikSeesOla.hole === null);
check('opponent card count is still visible', erikSeesOla.cardCount === 2);

const olaSelf = olaTable.seats.find((s) => s.seat === 1);
check('opponent sees their own cards', olaSelf.hole?.length === 2);
check(
	'the two players were dealt different cards',
	JSON.stringify(erikSelf.hole) !== JSON.stringify(olaSelf.hole)
);

check(
	'blinds posted',
	erikTable.seats.some((s) => s.committed === 10) && erikTable.seats.some((s) => s.committed === 20)
);

const actor = erikTable.toAct;
const actorClient = actor === 0 ? erikWs : olaWs;
const watcher = actor === 0 ? olaWs : erikWs;
check('someone is to act', actor !== null, `seat ${actor}`);
check(
	'only the acting player receives legal actions',
	actorClient.table.legal !== null && watcher.table.legal === null
);
check('action deadline is set', typeof erikTable.actionDeadline === 'number');

// Heads-up the button posts the small blind, so folding preflop hands the big
// blind the whole 10 + 20 pot.
actorClient.send({ type: 'act', action: { type: 'fold' } });
await erikWs.state((t) => t.seats.some((s) => s.won > 0), 'payout');
const winner = erikWs.table.seats.find((s) => s.won > 0);
check('folding awards the pot', winner.won === 30, `won ${winner.won}`);
check(
	'chips are conserved across the hand',
	erikWs.table.seats.reduce((sum, s) => sum + s.stack, 0) === 2000
);

erikWs.send({ type: 'chat', body: 'nice fold' });
const chat = await olaWs.until((m) => m.type === 'chat', 'chat broadcast');
check('chat is broadcast to the other player', chat.message.body === 'nice fold');

await erikWs.state((t) => t.handNumber === 2, 'second hand', 12000);
check('next hand deals automatically', erikWs.table.handNumber === 2);

erikWs.socket.close();
olaWs.socket.close();

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
