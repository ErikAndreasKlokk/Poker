import { describe, expect, it } from 'vitest';
import {
	AccountProblem,
	MAX_AVATAR_BYTES,
	normalizePhone,
	readAvatarUpload,
	sniffImageType,
	validatePassword,
	validateUsername
} from './validation';

function codeOf(fn: () => unknown): string {
	try {
		fn();
	} catch (error) {
		if (error instanceof AccountProblem) return error.code;
		throw error;
	}
	throw new Error('expected a rejection but the call succeeded');
}

describe('normalizePhone', () => {
	it.each([
		['12345678', '+4712345678'],
		['+4712345678', '+4712345678'],
		['004712345678', '+4712345678'],
		['+47 12 34 56 78', '+4712345678'],
		['12 34 56 78', '+4712345678'],
		['12-34-56-78', '+4712345678']
	])('normalises %s to %s', (input, expected) => {
		expect(normalizePhone(input)).toBe(expected);
	});

	it.each([
		['1234567', 'too short'],
		['123456789', 'too long'],
		['+4612345678', 'wrong country code'],
		['abcdefgh', 'not digits'],
		['', 'empty']
	])('rejects %s (%s)', (input) => {
		expect(codeOf(() => normalizePhone(input))).toBe('invalid_phone');
	});
});

describe('validateUsername', () => {
	it.each(['erik', 'Erik_92', 'a-b-c', 'abc', 'a'.repeat(20)])('accepts %s', (input) => {
		expect(validateUsername(input)).toBe(input);
	});

	it('trims surrounding whitespace', () => {
		expect(validateUsername('  erik  ')).toBe('erik');
	});

	it.each(['ab', 'a'.repeat(21), 'erik klokk', 'erik@home', 'ærlig', ''])('rejects %s', (input) => {
		expect(codeOf(() => validateUsername(input))).toBe('invalid_username');
	});
});

describe('validatePassword', () => {
	it('accepts eight characters or more', () => {
		expect(validatePassword('12345678')).toBe('12345678');
	});

	it('rejects anything shorter', () => {
		expect(codeOf(() => validatePassword('1234567'))).toBe('invalid_password');
	});

	it('rejects absurdly long passwords', () => {
		expect(codeOf(() => validatePassword('x'.repeat(201)))).toBe('invalid_password');
	});
});

describe('sniffImageType', () => {
	const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
	const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
	const webp = new Uint8Array([
		...[0x52, 0x49, 0x46, 0x46], // RIFF
		...[0, 0, 0, 0],
		...[0x57, 0x45, 0x42, 0x50] // WEBP
	]);

	it('identifies jpeg, png and webp by magic bytes', () => {
		expect(sniffImageType(jpeg)).toBe('image/jpeg');
		expect(sniffImageType(png)).toBe('image/png');
		expect(sniffImageType(webp)).toBe('image/webp');
	});

	it('rejects data that is too short to identify', () => {
		expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull();
	});

	it('rejects a non-image, however it is labelled', () => {
		const script = new TextEncoder().encode('<script>alert(1)</script>');
		expect(sniffImageType(script)).toBeNull();
	});
});

describe('readAvatarUpload', () => {
	const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

	it('accepts a real png and reports the sniffed type', async () => {
		const file = new File([pngBytes], 'a.png', { type: 'image/png' });
		await expect(readAvatarUpload(file)).resolves.toMatchObject({ mimeType: 'image/png' });
	});

	it('ignores a lying Content-Type and trusts the bytes', async () => {
		// Claims to be a webp, is actually a png. The bytes win.
		const file = new File([pngBytes], 'a.webp', { type: 'image/webp' });
		await expect(readAvatarUpload(file)).resolves.toMatchObject({ mimeType: 'image/png' });
	});

	it('rejects a disguised non-image', async () => {
		const file = new File([new TextEncoder().encode('not an image at all')], 'a.png', {
			type: 'image/png'
		});
		await expect(readAvatarUpload(file)).rejects.toThrow(AccountProblem);
	});

	it('rejects an empty file', async () => {
		await expect(readAvatarUpload(new File([], 'a.png'))).rejects.toThrow(AccountProblem);
	});

	it('rejects a file over the size cap', async () => {
		const huge = new Uint8Array(MAX_AVATAR_BYTES + 1);
		huge.set(pngBytes);
		await expect(readAvatarUpload(new File([huge], 'a.png'))).rejects.toThrow(AccountProblem);
	});
});
