import { describe, expect, it } from 'vitest';
import { GameProblem, parseGameSettings, parseKronerToOre } from './validation';

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

describe('parseKronerToOre', () => {
	it.each([
		['250', 25000],
		['249,50', 24950],
		['249.5', 24950],
		['0,01', 1],
		['1', 100]
	])('converts %s kr to %i øre', (input, expected) => {
		expect(parseKronerToOre(input)).toBe(expected);
	});

	it.each(['', 'abc', '1,234', '-5', '1.2.3'])('rejects %s', (input) => {
		expect(() => parseKronerToOre(input)).toThrow(GameProblem);
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

	it('accepts a real-money game with a Boks code and buy-in', () => {
		const settings = parseGameSettings({
			...valid,
			realMoney: 'true',
			vippsBoksCode: 'ABC123',
			buyInKr: '250'
		});
		expect(settings).toMatchObject({ realMoney: true, vippsBoksCode: 'ABC123', buyInOre: 25000 });
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
