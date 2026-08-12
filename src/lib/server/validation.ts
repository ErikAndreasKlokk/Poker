/**
 * Pure input validation, deliberately free of any database or environment
 * imports so it can be unit-tested without a running Postgres.
 */

export const MAX_AVATAR_BYTES = 512 * 1024;
export const ALLOWED_AVATAR_TYPES = ['image/webp', 'image/jpeg', 'image/png'] as const;
export type AvatarType = (typeof ALLOWED_AVATAR_TYPES)[number];

/** Error codes double as i18n message keys on the client. */
export type AccountError =
	| 'invalid_username'
	| 'invalid_phone'
	| 'invalid_password'
	| 'invalid_invite'
	| 'username_taken'
	| 'phone_taken'
	| 'invalid_credentials'
	| 'invalid_avatar';

export class AccountProblem extends Error {
	constructor(readonly code: AccountError) {
		super(code);
	}
}

export type GameError =
	| 'invalid_game_name'
	| 'invalid_blinds'
	| 'invalid_stack'
	| 'invalid_seats'
	| 'invalid_turn_seconds'
	| 'missing_boks_code'
	| 'invalid_buy_in'
	| 'buy_in_too_small'
	| 'invalid_voice_url';

export class GameProblem extends Error {
	constructor(readonly code: GameError) {
		super(code);
	}
}

export interface GameSettings {
	name: string;
	realMoney: boolean;
	vippsBoksCode: string | null;
	buyInOre: number | null;
	smallBlind: number;
	bigBlind: number;
	startingStack: number;
	maxSeats: number;
	turnSeconds: number;
	voiceChatUrl: string | null;
}

/**
 * Parses a whole number of kroner.
 *
 * Whole kroner only, because one chip is one krone: a buy-in of 249,50 would
 * need half a chip.
 */
export function parseWholeKroner(raw: string): number {
	const cleaned = raw.trim();
	if (!/^\d{1,7}$/.test(cleaned)) throw new GameProblem('invalid_buy_in');

	const kroner = Number(cleaned);
	if (kroner < 1) throw new GameProblem('invalid_buy_in');
	return kroner;
}

/**
 * Validates the game-creation form. Play-money games skip everything to do with
 * the Vipps Boks, which is why the money fields are only checked when
 * `realMoney` is set.
 */
export function parseGameSettings(raw: Record<string, string>): GameSettings {
	const name = (raw.name ?? '').trim();
	if (name.length < 1 || name.length > 60) throw new GameProblem('invalid_game_name');

	const smallBlind = Number(raw.smallBlind);
	const bigBlind = Number(raw.bigBlind);
	if (
		!Number.isInteger(smallBlind) ||
		!Number.isInteger(bigBlind) ||
		smallBlind < 1 ||
		bigBlind < 2 ||
		smallBlind > bigBlind
	) {
		throw new GameProblem('invalid_blinds');
	}

	const maxSeats = Number(raw.maxSeats);
	if (!Number.isInteger(maxSeats) || maxSeats < 2 || maxSeats > 9) {
		throw new GameProblem('invalid_seats');
	}

	const turnSeconds = Number(raw.turnSeconds);
	if (!Number.isInteger(turnSeconds) || turnSeconds < 10 || turnSeconds > 120) {
		throw new GameProblem('invalid_turn_seconds');
	}

	const realMoney = raw.realMoney === 'on' || raw.realMoney === 'true';
	let vippsBoksCode: string | null = null;
	let buyInOre: number | null = null;
	let startingStack: number;

	// Ten big blinds is about the shallowest stack that still plays like poker.
	const shallowest = bigBlind * 10;

	if (realMoney) {
		vippsBoksCode = (raw.vippsBoksCode ?? '').trim();
		if (!vippsBoksCode) throw new GameProblem('missing_boks_code');

		// One chip is one krone, so the buy-in is the stack. Keeping them as two
		// independent numbers meant a chip was worth some awkward fraction and
		// every payout had to be converted; this way the table reads in kroner.
		const kroner = parseWholeKroner(raw.buyInKr ?? '');
		buyInOre = kroner * 100;
		startingStack = kroner;
		if (startingStack < shallowest) throw new GameProblem('buy_in_too_small');
	} else {
		startingStack = Number(raw.startingStack);
		if (!Number.isInteger(startingStack) || startingStack < shallowest) {
			throw new GameProblem('invalid_stack');
		}
	}

	const voiceRaw = (raw.voiceChatUrl ?? '').trim();
	let voiceChatUrl: string | null = null;
	if (voiceRaw) {
		let parsed: URL;
		try {
			parsed = new URL(voiceRaw);
		} catch {
			throw new GameProblem('invalid_voice_url');
		}
		if (parsed.protocol !== 'https:') throw new GameProblem('invalid_voice_url');
		voiceChatUrl = parsed.toString();
	}

	return {
		name,
		realMoney,
		vippsBoksCode,
		buyInOre,
		smallBlind,
		bigBlind,
		startingStack,
		maxSeats,
		turnSeconds,
		voiceChatUrl
	};
}

export function validateUsername(raw: string): string {
	const username = raw.trim();
	if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) throw new AccountProblem('invalid_username');
	return username;
}

/**
 * Normalises Norwegian numbers to E.164. Accepts `12345678`, `+47 12 34 56 78`
 * and `0047…` since everyone types them differently.
 */
export function normalizePhone(raw: string): string {
	const compact = raw.replace(/[\s-]/g, '');
	if (/^\+47\d{8}$/.test(compact)) return compact;
	if (/^0047\d{8}$/.test(compact)) return `+47${compact.slice(4)}`;
	if (/^\d{8}$/.test(compact)) return `+47${compact}`;
	throw new AccountProblem('invalid_phone');
}

export function validatePassword(raw: string): string {
	if (raw.length < 8 || raw.length > 200) throw new AccountProblem('invalid_password');
	return raw;
}

/**
 * Identifies an image by its magic bytes rather than the browser-supplied
 * Content-Type, which a client is free to lie about.
 */
export function sniffImageType(bytes: Uint8Array): AvatarType | null {
	if (bytes.length < 12) return null;

	if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';

	const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
	if (png.every((byte, i) => bytes[i] === byte)) return 'image/png';

	const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';

	return null;
}

/**
 * Validates an uploaded avatar. The browser resizes to a 256px WebP before
 * upload; this is the backstop for clients that don't.
 */
export async function readAvatarUpload(
	file: File
): Promise<{ bytes: Buffer; mimeType: AvatarType }> {
	if (file.size === 0 || file.size > MAX_AVATAR_BYTES) throw new AccountProblem('invalid_avatar');

	const bytes = Buffer.from(await file.arrayBuffer());
	const mimeType = sniffImageType(bytes);
	if (!mimeType) throw new AccountProblem('invalid_avatar');

	return { bytes, mimeType };
}
