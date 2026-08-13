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
 *   psql -c "insert into invite (code) values ('FRIEND1'), ('FRIEND2')"
 *   npm run dev
 *   node scripts/smoke.mjs
 *
 * Expects an empty user table and unused invites named FRIEND1 and FRIEND2.
 *
 * The last section runs on a 10-second action clock and deliberately waits for
 * it to expire twice, so the whole run takes a couple of minutes.
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
}, 240_000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

// --- Real-money session and settlement ------------------------------------

// 500 kr each puts exactly 1000 kr in the Boks, so the 19 kr fee applies. One
// chip is one krone, so the stack is 500 and no startingStack is sent.
res = await erik.post('/games?/create', {
	name: 'Money night',
	realMoney: 'true',
	vippsBoksCode: 'BOKS123',
	buyInKr: '500',
	smallBlind: '10',
	bigBlind: '20',
	maxSeats: '6',
	turnSeconds: '60'
});
const moneyCode = (res.headers.get('location') ?? '').split('/').pop() ?? '';
check('create a real-money game', res.status === 303 && moneyCode.length === 6, moneyCode);

const erikMoney = new Client(moneyCode, erik.cookie, 'erik$');
const olaMoney = new Client(moneyCode, ola.cookie, 'ola$');
await Promise.all([erikMoney.ready, olaMoney.ready]);

erikMoney.send({ type: 'sit', seat: 0 });
await erikMoney.state((t) => t.seats.length === 1, 'erik seated');
olaMoney.send({ type: 'sit', seat: 1 });
await Promise.all([
	erikMoney.state((t) => t.seats.length === 2, 'erik sees two'),
	olaMoney.state((t) => t.seats.length === 2, 'ola sees two')
]);

erikMoney.send({ type: 'start' });
await Promise.all([
	erikMoney.state((t) => t.handNumber !== null, 'erik dealt'),
	olaMoney.state((t) => t.handNumber !== null, 'ola dealt')
]);

// Heads-up the button posts the small blind and acts first; folding there loses
// exactly the 10-chip small blind.
const moneyActor = erikMoney.table.toAct === 0 ? erikMoney : olaMoney;
moneyActor.send({ type: 'act', action: { type: 'fold' } });
await erikMoney.state((t) => t.seats.some((s) => s.won > 0), 'money payout');

erikMoney.send({ type: 'end_session' });
await erikMoney.state((t) => t.status === 'ended', 'session ended');
check('host can end the session', erikMoney.table.status === 'ended');

res = await erik.get(`/games/${moneyCode}/settlement`);
const settlement = await res.text();
check('settlement page renders', res.status === 200, `status ${res.status}`);

// Two 500 kr buy-ins is 1000 kr in the Boks: one whole thousand, so 19 kr goes
// to Vipps and 981 kr is left for the players to withdraw.
check('settlement shows what is in the boks', settlement.includes('1000,00 kr'), '1000,00 kr');
check('settlement shows the vipps fee', settlement.includes('19,00 kr'), '19,00 kr');
check('settlement shows what is left to withdraw', settlement.includes('981,00 kr'), '981,00 kr');

// The folder lost the 10 small blind, leaving 490 and 510 chips. Scaled to the
// 981 kr pool that is 480,69 kr and 500,31 kr, together exactly 981 kr.
check('winner withdraws their share of the reduced pool', settlement.includes('500,31 kr'));
check('loser withdraws their share of the reduced pool', settlement.includes('480,69 kr'));

const loser = erikMoney.table.seats.find((s) => s.stack === 490);
check('losing stack is one small blind down', loser !== undefined);

res = await new Session().get(`/games/${moneyCode}/settlement`);
check('settlement is not public', res.status === 302, `status ${res.status}`);

erikMoney.socket.close();
olaMoney.socket.close();

// --- Hand history and replay ---------------------------------------------

res = await erik.get(`/games/${code}/hands`);
const historyPage = await res.text();
check('hand history renders', res.status === 200, `status ${res.status}`);
check('history lists a played hand', historyPage.includes('1'), 'hand numbers present');

res = await erik.get(`/games/${code}/hands/1`);
const replayPage = await res.text();
check('replay renders the first hand', res.status === 200, `status ${res.status}`);

res = await erik.get(`/games/${code}/hands/999`);
check('unknown hand 404s', res.status === 404, `status ${res.status}`);

res = await new Session().get(`/games/${code}/hands`);
check('hand history is not public', res.status === 302, `status ${res.status}`);

// Hand 1 ended in a fold with no showdown, and that game is still running, so
// the opponent's cards must not be readable from the replay. Cards are rendered
// with the card code as an aria-label.
const shows = (card) => replayPage.includes(`aria-label="${card}"`);
check(
	'replay shows the viewer their own cards',
	erikSelf.hole.every(shows),
	erikSelf.hole.join(' ')
);
check(
	'replay hides an opponent hand that never went to showdown',
	olaSelf.hole.every((card) => !shows(card)),
	olaSelf.hole.join(' ')
);

// --- Three-handed play, side pots, cashing out and reconnecting -----------

const kari = new Session();
res = await kari.post('/auth?/register', {
	username: `kari${stamp}`,
	phone: `9${stamp}4`.slice(0, 8),
	password: 'hunter2hunter2',
	invite: 'FRIEND2'
});
check('third player registers', res.status === 303, `status ${res.status}`);

res = await erik.post('/games?/create', {
	name: 'Three way',
	realMoney: 'false',
	smallBlind: '10',
	bigBlind: '20',
	startingStack: '1000',
	maxSeats: '6',
	turnSeconds: '10'
});
const threeCode = (res.headers.get('location') ?? '').split('/').pop() ?? '';
check('create a three-handed game', res.status === 303 && threeCode.length === 6, threeCode);

const a = new Client(threeCode, erik.cookie, 'erik3');
const b = new Client(threeCode, ola.cookie, 'ola3');
const c = new Client(threeCode, kari.cookie, 'kari3');
const table3 = [a, b, c];
await Promise.all(table3.map((client) => client.ready));

// Deliberately uneven stacks: three all-ins at these depths must break the pot
// into a main pot and two side pots.
a.send({ type: 'sit', seat: 0, buyIn: 1000 });
await a.state((t) => t.seats.length === 1, 'erik seated');
b.send({ type: 'sit', seat: 1, buyIn: 300 });
await b.state((t) => t.seats.length === 2, 'ola seated');
c.send({ type: 'sit', seat: 2, buyIn: 100 });
await Promise.all(table3.map((client) => client.state((t) => t.seats.length === 3, 'all seated')));
check('three players seated at once', a.table.seats.length === 3);
check(
	'short buy-ins are honoured',
	a.table.seats.map((s) => s.stack).sort((x, y) => x - y)[0] === 100,
	a.table.seats.map((s) => `${s.seat}:${s.stack}`).join(' ')
);

a.send({ type: 'start' });
await Promise.all(table3.map((client) => client.state((t) => t.handNumber !== null, 'hand dealt')));
check(
	'three-handed hand is dealt',
	a.table.seats.every((s) => s.cardCount === 2)
);

/**
 * Drives a hand to its end with everyone shoving, so short stacks run out.
 *
 * Waits for `legal` to clear on the client that just acted rather than for a
 * matching state message: the client keeps every message it has received, so a
 * predicate that only asks for "no legal actions" matches a state from before
 * this seat's turn and returns while the action is still in flight.
 */
async function shoveToShowdown(clients, label) {
	const deadline = Date.now() + 30_000;

	while (Date.now() < deadline) {
		if (clients[0].table?.seats.some((s) => s.won > 0)) return;

		const actor = clients.find((client) => client.table?.legal);
		if (!actor) {
			await sleep(100);
			continue;
		}

		const legal = actor.table.legal;
		actor.send({
			type: 'act',
			action: legal.canRaise
				? { type: 'raise', to: legal.maxRaiseTo }
				: legal.canCall
					? { type: 'call' }
					: { type: 'check' }
		});

		const acted = Date.now() + 5000;
		while (actor.table?.legal && Date.now() < acted) await sleep(50);
	}
	throw new Error(`${label}: hand never finished`);
}

await shoveToShowdown(table3, 'three-handed');
await a.state((t) => t.pots.length > 0, 'pots settled');

check(
	'an all-in three-way pot produces side pots',
	a.table.pots.length > 1,
	`${a.table.pots.length} pot(s)`
);
check(
	'the main pot is limited to the shortest stack',
	a.table.pots[0].amount === 300,
	`main pot ${a.table.pots[0].amount}`
);
check(
	'every seat is eligible for the main pot',
	a.table.pots[0].eligibleSeats.length === 3,
	a.table.pots[0].eligibleSeats.join(',')
);
check(
	'chips are conserved across a side-pot hand',
	a.table.seats.reduce((sum, s) => sum + s.stack, 0) === 1400,
	`${a.table.seats.reduce((sum, s) => sum + s.stack, 0)} of 1400`
);

// Reconnect mid-hand: a fresh socket on the same session must be dealt back
// into the hand it left, holding the same cards.
await a.state((t) => t.handNumber === 2, 'second hand', 15000);
const beforeDrop = a.table.seats.find((s) => s.seat === 0).hole;
a.socket.close();
const rejoined = new Client(threeCode, erik.cookie, 'erik-again');
await rejoined.ready;
await rejoined.state((t) => t.handNumber !== null, 'state after reconnect');
const afterRejoin = rejoined.table.seats.find((s) => s.seat === 0);
check('a reconnecting player is still in the hand', afterRejoin !== undefined);
check(
	'a reconnecting player gets their own cards back',
	JSON.stringify(afterRejoin.hole) === JSON.stringify(beforeDrop),
	`${JSON.stringify(beforeDrop)} vs ${JSON.stringify(afterRejoin.hole)}`
);
check('reconnecting does not leave the player sitting out', afterRejoin.sittingOut === false);

// Cashing out mid-hand: the seat is held until the hand settles, because the
// room only learns the real stack at settlement.
const cashOutSeat = 1;
const seatsBefore = rejoined.table.seats.length;
b.send({ type: 'leave' });
await b.state((t) => t.you.leaving, 'leave acknowledged');
check('cashing out mid-hand is acknowledged', b.table.you.leaving === true);
check(
	'the seat is held until the hand ends',
	b.table.seats.some((s) => s.seat === cashOutSeat),
	`${b.table.seats.length} seats`
);

// The leaver folds when the action reaches them; the other two finish the hand.
await shoveToShowdown([rejoined, c], 'after cash-out');
await rejoined.state((t) => !t.seats.some((s) => s.seat === cashOutSeat), 'seat released', 20000);
check(
	'the seat is released once the hand settles',
	rejoined.table.seats.length === seatsBefore - 1
);

rejoined.socket.close();
b.socket.close();
c.socket.close();

// --- Cashing out mid-hand for real money ----------------------------------

// The room only refreshes a stack at settlement, so a player who leaves after
// betting must be paid for the chips they finished with, not the ones they sat
// down with. Getting this wrong pays them for money sitting in the pot.
res = await erik.post('/games?/create', {
	name: 'Cash out night',
	realMoney: 'true',
	vippsBoksCode: 'BOKS777',
	buyInKr: '500',
	smallBlind: '10',
	bigBlind: '20',
	maxSeats: '6',
	turnSeconds: '10'
});
const cashCode = (res.headers.get('location') ?? '').split('/').pop() ?? '';
check('create a real-money game for three', res.status === 303 && cashCode.length === 6, cashCode);

const m1 = new Client(cashCode, erik.cookie, 'erik$$');
const m2 = new Client(cashCode, ola.cookie, 'ola$$');
const m3 = new Client(cashCode, kari.cookie, 'kari$$');
const money3 = [m1, m2, m3];
await Promise.all(money3.map((client) => client.ready));

m1.send({ type: 'sit', seat: 0 });
await m1.state((t) => t.seats.length === 1, 'first seated');
m2.send({ type: 'sit', seat: 1 });
await m2.state((t) => t.seats.length === 2, 'second seated');
m3.send({ type: 'sit', seat: 2 });
await Promise.all(money3.map((client) => client.state((t) => t.seats.length === 3, 'all seated')));
check(
	'a real-money buy-in is the stack, one chip to the krone',
	m1.table.seats.every((s) => s.stack === 500),
	m1.table.seats.map((s) => s.stack).join(',')
);

m1.send({ type: 'start' });
await Promise.all(money3.map((client) => client.state((t) => t.handNumber !== null, 'dealt')));

// The big blind has posted 20 and has 480 behind: a fixed, card-independent
// amount to check the payout against.
const bbSeat = m1.table.seats.find((s) => s.committed === 20).seat;
const leaver = money3.find((client) => client.table.you.seat === bbSeat);
leaver.send({ type: 'leave' });
await leaver.state((t) => t.you.leaving, 'money leave acknowledged');

await shoveToShowdown(
	money3.filter((client) => client !== leaver),
	'money hand'
);
await m1.state((t) => !t.seats.some((s) => s.seat === bbSeat), 'leaver cashed out', 20000);
check(
	'a player who cashes out mid-hand loses their seat',
	!m1.table.seats.some((s) => s.seat === bbSeat)
);

/** Ends the session, retrying while the table keeps dealing new hands. */
async function endSession(client) {
	const deadline = Date.now() + 40_000;
	while (Date.now() < deadline) {
		client.send({ type: 'end_session' });
		const ended = await client
			.state((t) => t.status === 'ended', 'session ended', 4000)
			.then(() => true)
			.catch(() => false);
		if (ended) return true;
	}
	return false;
}

check('the host can close a table someone walked out of', await endSession(m1));

res = await erik.get(`/games/${cashCode}/settlement`);
const cashSettlement = await res.text();
check('settlement renders after a mid-hand cash-out', res.status === 200, `status ${res.status}`);

// Three 500 kr buy-ins is 1500 kr in the Boks. Vipps keeps 19 kr per whole
// thousand, and 1500 holds one, so 1481 kr is left to withdraw.
check('the boks holds all three buy-ins', cashSettlement.includes('1500,00 kr'), '1500,00 kr');
check('one whole thousand is charged a fee', cashSettlement.includes('19,00 kr'), '19,00 kr');
check('the rest is available to withdraw', cashSettlement.includes('1481,00 kr'), '1481,00 kr');

// The heart of it: the leaver posted a 20 blind and folded, so 480 chips is
// 480 kr. Paying their pre-hand 500 would hand them chips still in the pot.
// (500,00 kr appears legitimately as everyone's buy-in, so the payout figure
// is what distinguishes a correct cash-out from an overpaid one.)
check(
	'a mid-hand cash-out is priced from the stack the hand left them',
	cashSettlement.includes('480,00 kr'),
	'480,00 kr'
);

money3.forEach((client) => client.socket.close());

// --- The action clock -----------------------------------------------------

// A timed-out fold and a timed-out check are different events, so they get a
// game each: the fold sits its player out, which would stop the table.
async function clockGame(name) {
	const created = await erik.post('/games?/create', {
		name,
		realMoney: 'false',
		smallBlind: '10',
		bigBlind: '20',
		startingStack: '1000',
		maxSeats: '6',
		turnSeconds: '10'
	});
	const gameCode = (created.headers.get('location') ?? '').split('/').pop() ?? '';

	const host = new Client(gameCode, erik.cookie, `${name}-erik`);
	const guest = new Client(gameCode, ola.cookie, `${name}-ola`);
	await Promise.all([host.ready, guest.ready]);

	host.send({ type: 'sit', seat: 0 });
	await host.state((t) => t.seats.length === 1, 'host seated');
	guest.send({ type: 'sit', seat: 1 });
	await Promise.all([
		host.state((t) => t.seats.length === 2, 'host sees two'),
		guest.state((t) => t.seats.length === 2, 'guest sees two')
	]);

	host.send({ type: 'start' });
	await Promise.all([
		host.state((t) => t.handNumber !== null, 'host dealt'),
		guest.state((t) => t.handNumber !== null, 'guest dealt')
	]);
	return { host, guest };
}

// Heads-up the button posts the small blind and acts first facing the big
// blind, so letting the clock run out there can only fold.
const folding = await clockGame('Clock fold');
const foldSeat = folding.host.table.toAct;
await folding.host.state((t) => t.seats.some((s) => s.won > 0), 'timeout fold settled', 25000);
check(
	'an unanswered clock folds the hand',
	folding.host.table.seats.some((s) => s.won > 0),
	'pot awarded'
);
check(
	'a timed-out fold sits the player out',
	folding.host.table.seats.find((s) => s.seat === foldSeat).sittingOut === true,
	`seat ${foldSeat}`
);
folding.host.socket.close();
folding.guest.socket.close();

// The big blind facing a call has a free check, which costs nothing — timing
// out on it must not remove anyone from the table.
const checking = await clockGame('Clock check');
const caller = [checking.host, checking.guest].find((client) => client.table.legal);
// Heads-up there are only two seats, so the big blind is simply the other one.
const bigBlindSeat = caller.table.legal.seat === 0 ? 1 : 0;
caller.send({ type: 'act', action: { type: 'call' } });
await checking.host.state((t) => t.street === 'flop', 'flop dealt by timeout', 25000);
check('a free check on the clock advances the street', checking.host.table.street === 'flop');
check(
	'a timed-out free check does not sit the player out',
	checking.host.table.seats.find((s) => s.seat === bigBlindSeat).sittingOut === false,
	`seat ${bigBlindSeat}`
);
checking.host.socket.close();
checking.guest.socket.close();

log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
