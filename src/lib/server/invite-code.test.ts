import { describe, expect, it } from 'vitest';
import { INVITE_PREFIX, generateInviteCode } from './invite-code';

describe('generateInviteCode', () => {
	it('prefixes the code so it cannot be mistaken for a game code', () => {
		expect(generateInviteCode().startsWith(INVITE_PREFIX)).toBe(true);
	});

	it('avoids characters people mistype', () => {
		// 400 codes is enough to hit every position of the alphabet many times.
		const codes = Array.from({ length: 400 }, () => generateInviteCode());
		for (const code of codes) {
			expect(code.slice(INVITE_PREFIX.length)).toMatch(/^[a-z2-9]{6}$/);
			expect(code.slice(INVITE_PREFIX.length)).not.toMatch(/[ilo]/);
		}
	});

	it('draws every character from the random source it is given', () => {
		// Always picking index 0 must produce the first letter of the alphabet.
		expect(generateInviteCode(() => 0)).toBe(`${INVITE_PREFIX}aaaaaa`);
	});

	it('asks for indexes inside the alphabet', () => {
		const asked: number[] = [];
		generateInviteCode((max) => {
			asked.push(max);
			return max - 1;
		});
		expect(asked).toHaveLength(6);
		expect(new Set(asked).size).toBe(1);
	});

	it('does not repeat itself', () => {
		const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
		expect(codes.size).toBe(500);
	});
});
