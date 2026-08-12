/**
 * Production entry point.
 *
 * adapter-node's own entry cannot host a WebSocket server, so we build the HTTP
 * server ourselves, hand every normal request to SvelteKit's handler, and let
 * the game server claim `/ws/game/*` upgrades.
 *
 * Run after `npm run build`, which produces both `build/` and `build-server/`.
 */
import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { startGameServer } from './build-server/game-server.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const server = createServer(handler);
const games = startGameServer(server, process.env.DATABASE_URL);

server.listen(port, host, () => {
	console.log(`poker listening on http://${host}:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		games.close();
		server.close(() => process.exit(0));
	});
}
