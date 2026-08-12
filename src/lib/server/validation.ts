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
