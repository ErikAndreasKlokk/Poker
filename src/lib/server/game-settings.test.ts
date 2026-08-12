import { describe, expect, it } from 'vitest';
import { GameProblem, parseGameSettings, parseWholeKroner } from './validation';

const valid = {
	name: 'Fredagspoker',
	smallBlind: '10',
	bigBlind: '20',
	startingStack: '2000',
	maxSeats: '6',
	turnSeconds: '30',
	realMoney: 'false'
};

function codeOf(raw: Record<string, string>): string {
	try {
		parseGameSettings(raw);
	} catch (error) {
		if (error instanceof GameProblem) return error.code;
		throw error;
	}
	throw new Error('expected a rejection but parsing succeeded');
}

describe('parseWholeKroner', () => {
	it.each([
		['250', 250],
		['1', 1],
		['  200  ', 200]
	])('reads %s as %i kroner', (input, expected) => {
		expect(parseWholeKroner(input)).toBe(expected);
	});

	it.each(['', 'abc', '-5', '0', '249,50', '249.5'])('rejects %s', (input) => {
		// Fractions are refused: one chip is one krone, so half a krone is half a chip.
		expect(() => parseWholeKroner(input)).toThrow(GameProblem);
	});
});

describe('parseGameSettings', () => {
	it('accepts a plain play-money game', () => {
		expect(parseGameSettings(valid)).toMatchObject({
			name: 'Fredagspoker',
			realMoney: false,
			vippsBoksCode: null,
			buyInOre: null,
			smallBlind: 10,
			bigBlind: 20,
			startingStack: 2000
		});
	});

	it('ignores money fields entirely when playing for fun', () => {
		const settings = parseGameSettings({
			...valid,
			vippsBoksCode: 'ABC123',
			buyInKr: '250'
		});
		expect(settings.vippsBoksCode).toBeNull();
		expect(settings.buyInOre).toBeNull();
	});

	it('requires a Boks code for a real-money game', () => {
		expect(codeOf({ ...valid, realMoney: 'true', buyInKr: '250' })).toBe('missing_boks_code');
	});

	it('makes the buy-in the stack, one chip to the krone', () => {
		const settings = parseGameSettings({
			...valid,
			realMoney: 'true',
			vippsBoksCode: 'ABC123',
			buyInKr: '250'
		});
		expect(settings).toMatchObject({
			realMoney: true,
			vippsBoksCode: 'ABC123',
			buyInOre: 25_000,
			startingStack: 250
		});
		// A chip is worth exactly 100 øre, so nothing can round away.
		expect(settings.buyInOre! / settings.startingStack).toBe(100);
	});

	it('ignores any starting stack sent alongside a real-money buy-in', () => {
		const settings = parseGameSettings({
			...valid,
			startingStack: '9999',
			realMoney: 'true',
			vippsBoksCode: 'ABC123',
			buyInKr: '300'
		});
		expect(settings.startingStack).toBe(300);
	});

	it('rejects a real-money buy-in shallower than ten big blinds', () => {
		// 20 big blind means at least 200 kr.
		expect(codeOf({ ...valid, realMoney: 'true', vippsBoksCode: 'ABC', buyInKr: '199' })).toBe(
			'buy_in_too_small'
		);
	});

	it('rejects fractional kroner', () => {
		expect(codeOf({ ...valid, realMoney: 'true', vippsBoksCode: 'ABC', buyInKr: '249,50' })).toBe(
			'invalid_buy_in'
		);
	});

	it.each([
		[{ name: '' }, 'invalid_game_name'],
		[{ name: 'x'.repeat(61) }, 'invalid_game_name'],
		[{ smallBlind: '30' }, 'invalid_blinds'],
		[{ bigBlind: '1' }, 'invalid_blinds'],
		[{ smallBlind: '1.5' }, 'invalid_blinds'],
		[{ startingStack: '100' }, 'invalid_stack'],
		[{ maxSeats: '1' }, 'invalid_seats'],
		[{ maxSeats: '10' }, 'invalid_seats'],
		[{ turnSeconds: '5' }, 'invalid_turn_seconds'],
		[{ turnSeconds: '300' }, 'invalid_turn_seconds'],
		[{ voiceChatUrl: 'not a url' }, 'invalid_voice_url'],
		[{ voiceChatUrl: 'http://insecure.example' }, 'invalid_voice_url']
	])('rejects %o', (patch, expected) => {
		expect(codeOf({ ...valid, ...patch })).toBe(expected);
	});

	it('accepts an https voice link', () => {
		const settings = parseGameSettings({ ...valid, voiceChatUrl: 'https://discord.gg/abc' });
		expect(settings.voiceChatUrl).toBe('https://discord.gg/abc');
	});

	it('requires a stack of at least ten big blinds', () => {
		expect(parseGameSettings({ ...valid, startingStack: '200' }).startingStack).toBe(200);
		expect(codeOf({ ...valid, startingStack: '199' })).toBe('invalid_stack');
	});
});
