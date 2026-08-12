import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { createDb, type Db } from '../lib/server/db/client';
import { GameRoom, RoomError } from '../lib/server/game/room';
import { findSessionUser, readCookie, sessionCookieName } from '../lib/server/session';
import type { ClientMessage, ServerMessage } from '../lib/protocol';

const WS_PATH = /^\/ws\/game\/([A-Za-z0-9]{4,12})$/;

interface Client {
	socket: WebSocket;
	userId: string;
	username: string;
}

/**
 * Attaches the realtime poker server to an existing HTTP server.
 *
 * Rooms live in memory here and are the only writer of live hand state, which
 * is why the deployment must stay at a single replica. Durable data (games,
 * seats, hand events, chat) goes through Postgres and is shared with the
 * SvelteKit side.
 */
export function attachGameServer(server: Server, db: Db) {
	const wss = new WebSocketServer({ noServer: true });
	const rooms = new Map<string, GameRoom>();
	const clients = new Map<string, Set<Client>>();

	function send(client: Client, message: ServerMessage) {
		if (client.socket.readyState === client.socket.OPEN) {
			client.socket.send(JSON.stringify(message));
		}
	}

	/** Each client gets its own projection — hole cards differ per recipient. */
	function broadcastState(code: string) {
		const room = rooms.get(code);
		const members = clients.get(code);
		if (!room || !members) return;
		for (const client of members) {
			send(client, { type: 'state', table: room.viewFor(client.userId, client.username) });
		}
	}

	function broadcast(code: string, message: ServerMessage) {
		for (const client of clients.get(code) ?? []) send(client, message);
	}

	async function roomFor(code: string): Promise<GameRoom | null> {
		const existing = rooms.get(code);
		if (existing) return existing;

		const room = await GameRoom.load(db, code, () => broadcastState(code));
		if (!room) return null;

		// Another upgrade may have loaded the same room while we awaited.
		const raced = rooms.get(code);
		if (raced) {
			room.dispose();
			return raced;
		}

		rooms.set(code, room);
		return room;
	}

	server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
		const match = request.url?.match(WS_PATH);
		// Not ours — leave it for Vite's HMR socket or anything else listening.
		if (!match) return;

		void (async () => {
			const token = readCookie(request.headers.cookie, sessionCookieName);
			const user = token ? await findSessionUser(db, token) : null;
			if (!user) {
				socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
				socket.destroy();
				return;
			}

			const code = match[1];
			const room = await roomFor(code);
			if (!room) {
				socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
				socket.destroy();
				return;
			}

			wss.handleUpgrade(request, socket, head, (ws) => {
				onConnection(ws, code, room, { id: user.id, username: user.username });
			});
		})();
	});

	function onConnection(
		socket: WebSocket,
		code: string,
		room: GameRoom,
		user: { id: string; username: string }
	) {
		const client: Client = { socket, userId: user.id, username: user.username };
		if (!clients.has(code)) clients.set(code, new Set());
		clients.get(code)!.add(client);
		room.connect(user.id);

		send(client, { type: 'state', table: room.viewFor(user.id, user.username) });

		socket.on('message', (raw) => {
			void handleMessage(client, code, room, raw.toString());
		});

		socket.on('close', () => {
			clients.get(code)?.delete(client);
			room.disconnect(user.id);

			// Drop idle rooms so their timers stop and memory is reclaimed.
			if (clients.get(code)?.size === 0) {
				clients.delete(code);
				if (room.isIdle) {
					room.dispose();
					rooms.delete(code);
				}
			}
		});
	}

	async function handleMessage(client: Client, code: string, room: GameRoom, raw: string) {
		let message: ClientMessage;
		try {
			message = JSON.parse(raw);
		} catch {
			return send(client, { type: 'error', message: 'bad_json' });
		}

		try {
			switch (message.type) {
				case 'ping':
					return send(client, { type: 'pong' });
				case 'sit':
					return await room.sit(client.userId, client.username, message.seat);
				case 'leave':
					return await room.leave(client.userId);
				case 'start':
					return await room.start(client.userId);
				case 'act':
					return await room.act(client.userId, message.action);
				case 'chat': {
					const posted = await room.chat(client.userId, message.body);
					return broadcast(code, { type: 'chat', message: posted });
				}
				default:
					return send(client, { type: 'error', message: 'unknown_message' });
			}
		} catch (error) {
			// RoomError and engine rejections are the client's problem; anything else
			// is ours, so surface a generic message and let it be logged.
			const known = error instanceof RoomError || error instanceof Error;
			if (!(error instanceof RoomError)) console.error('[ws] action failed', error);
			send(client, { type: 'error', message: known ? (error as Error).message : 'failed' });
		}
	}

	return {
		close() {
			for (const room of rooms.values()) room.dispose();
			rooms.clear();
			clients.clear();
			wss.close();
		}
	};
}

/** Entry point used by both the dev plugin and the production server. */
export function startGameServer(server: Server, databaseUrl: string) {
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');
	return attachGameServer(server, createDb(databaseUrl));
}
