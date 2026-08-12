import type { ChatView, ClientMessage, ServerMessage, TableView } from '$lib/protocol';

const RECONNECT_MIN_MS = 500;
const RECONNECT_MAX_MS = 10_000;
const PING_INTERVAL_MS = 25_000;

/**
 * Live connection to one poker table.
 *
 * The socket is the only source of table state — nothing is derived optimistically
 * on the client, because the server is the authority on every chip and card.
 */
export class TableConnection {
	table = $state<TableView | null>(null);
	chat = $state<ChatView[]>([]);
	error = $state<string | null>(null);
	connected = $state(false);

	private socket: WebSocket | null = null;
	private retryDelay = RECONNECT_MIN_MS;
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private closed = false;

	constructor(private readonly code: string) {}

	open() {
		this.closed = false;
		this.connect();
	}

	close() {
		this.closed = true;
		if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
		if (this.pingTimer) clearInterval(this.pingTimer);
		this.socket?.close();
		this.socket = null;
	}

	send(message: ClientMessage) {
		if (this.socket?.readyState === WebSocket.OPEN) {
			this.socket.send(JSON.stringify(message));
		}
	}

	private connect() {
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const socket = new WebSocket(`${scheme}://${location.host}/ws/game/${this.code}`);
		this.socket = socket;

		socket.addEventListener('open', () => {
			this.connected = true;
			this.error = null;
			this.retryDelay = RECONNECT_MIN_MS;
			this.pingTimer = setInterval(() => this.send({ type: 'ping' }), PING_INTERVAL_MS);
		});

		socket.addEventListener('message', (event) => {
			let message: ServerMessage;
			try {
				message = JSON.parse(event.data);
			} catch {
				return;
			}

			switch (message.type) {
				case 'state':
					this.table = message.table;
					break;
				case 'chat':
					this.chat = [...this.chat, message.message].slice(-200);
					break;
				case 'error':
					this.error = message.message;
					break;
			}
		});

		socket.addEventListener('close', () => {
			this.connected = false;
			if (this.pingTimer) clearInterval(this.pingTimer);
			if (this.closed) return;

			// Back off so a server restart doesn't get hammered by every player at once.
			this.reconnectTimer = setTimeout(() => this.connect(), this.retryDelay);
			this.retryDelay = Math.min(this.retryDelay * 2, RECONNECT_MAX_MS);
		});
	}
}
