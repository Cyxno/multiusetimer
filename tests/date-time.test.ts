import { describe, expect, it } from 'vitest';
import {
	formatOffset,
	getTimeZoneOffsetMinutes,
	isValidIsoWithOffset,
	isoToWallParts,
	localToIsoOffset,
	sameWallParts,
	systemTimeZone
} from '$lib/utils/date-time';

/**
 * Draait met TZ=Europe/Amsterdam (vite.config.ts), maar de functies nemen
 * expliciet een tijdzone aan zodat de tests ook zonder die instelling kloppen.
 */
const NL = systemTimeZone();

describe('getTimeZoneOffsetMinutes', () => {
	it('geeft +60 voor Nederland in wintertijd', () => {
		const instant = new Date('2027-01-15T12:00:00Z');
		expect(getTimeZoneOffsetMinutes(instant, NL)).toBe(60);
	});

	it('geeft +120 voor Nederland in zomertijd', () => {
		const instant = new Date('2027-07-15T12:00:00Z');
		expect(getTimeZoneOffsetMinutes(instant, NL)).toBe(120);
	});

	it('geeft rond de overgang de correcte offset per moment', () => {
		// Nacht van 28 op 29 maart 2026 (02:00 → 03:00 lokaal).
		expect(getTimeZoneOffsetMinutes(new Date('2026-03-28T23:00:00Z'), NL)).toBe(60);
		expect(getTimeZoneOffsetMinutes(new Date('2026-03-29T01:00:00Z'), NL)).toBe(120);
	});
});

describe('formatOffset', () => {
	it('formatteert offsets als +HH:MM', () => {
		expect(formatOffset(60)).toBe('+01:00');
		expect(formatOffset(120)).toBe('+02:00');
		expect(formatOffset(0)).toBe('+00:00');
		expect(formatOffset(-330)).toBe('-05:30');
	});
});

describe('localToIsoOffset', () => {
	it('zet lokale wintertijdinvoer om naar +01:00', () => {
		expect(localToIsoOffset('2027-01-15', '09:30', NL)).toBe('2027-01-15T09:30:00+01:00');
	});

	it('zet lokale zomertijdinvoer om naar +02:00', () => {
		expect(localToIsoOffset('2027-07-15', '09:30', NL)).toBe('2027-07-15T09:30:00+02:00');
	});

	it('gebruikt de offset die op de gekozen datum geldt, niet "nu"', () => {
		const nowInSummer = localToIsoOffset('2027-07-15', '09:30', NL);
		const winter = localToIsoOffset('2027-01-15', '09:30', NL);
		expect(nowInSummer).not.toEqual(winter);
	});

	it('levert een ondubbelzinnig, parseerbaar tijdstip', () => {
		const iso = localToIsoOffset('2027-04-01', '09:00', NL);
		expect(iso).toBe('2027-04-01T09:00:00+02:00');
		expect(Number.isFinite(Date.parse(iso ?? ''))).toBe(true);
	});

	it('wijst ongeldige kalenderdata af', () => {
		expect(localToIsoOffset('2027-02-30', '10:00', NL)).toBeNull();
		expect(localToIsoOffset('2027-13-01', '10:00', NL)).toBeNull();
		expect(localToIsoOffset('2027-00-10', '10:00', NL)).toBeNull();
		expect(localToIsoOffset('niet-een-datum', '10:00', NL)).toBeNull();
	});

	it('wijst ongeldige tijden af', () => {
		expect(localToIsoOffset('2027-01-01', '25:00', NL)).toBeNull();
		expect(localToIsoOffset('2027-01-01', '10:60', NL)).toBeNull();
		expect(localToIsoOffset('2027-01-01', '', NL)).toBeNull();
	});

	it('lost niet-bestaande tijden (naar zomertijd) op naar een stabiel moment', () => {
		// 29 maart 2026, 02:30 bestaat niet in Nederland.
		const iso = localToIsoOffset('2026-03-29', '02:30', NL);
		expect(iso).not.toBeNull();
		expect(Number.isFinite(Date.parse(iso ?? ''))).toBe(true);
		// Deterministisch: dezelfde invoer levert dezelfde output.
		expect(localToIsoOffset('2026-03-29', '02:30', NL)).toBe(iso);
	});

	it('kiest bij een dubbele tijd (naar wintertijd) een ondubbelzinnige interpretatie', () => {
		// 25 oktober 2026, 02:30 bestaat twee keer (CEST en CET).
		const first = localToIsoOffset('2026-10-25', '02:30', NL);
		const second = localToIsoOffset('2026-10-25', '02:30', NL);
		expect(first).toBe(second);
		expect(first).toBe('2026-10-25T02:30:00+01:00');
	});

	it('behoudt de exacte kloktijd in de string (geen stille UTC-conversie)', () => {
		const iso = localToIsoOffset('2027-04-01', '09:00', NL);
		expect(iso).toBe('2027-04-01T09:00:00+02:00');
		const wall = isoToWallParts(iso ?? '');
		expect(wall?.date).toBe('2027-04-01');
		expect(wall?.time).toBe('09:00:00');
	});
});

describe('isoToWallParts', () => {
	it('leest datum, tijd en offset uit een opgeslagen ISO-string', () => {
		const parts = isoToWallParts('2027-04-01T09:00:00+02:00');
		expect(parts).toMatchObject({
			date: '2027-04-01',
			time: '09:00:00',
			offset: '+02:00',
			offsetMinutes: 120
		});
	});

	it('ondersteunt Z-notatie', () => {
		const parts = isoToWallParts('2027-04-01T09:00:00Z');
		expect(parts).toMatchObject({ date: '2027-04-01', time: '09:00:00', offsetMinutes: 0 });
	});

	it('werkt zonder seconden', () => {
		const parts = isoToWallParts('2027-04-01T09:30+02:00');
		expect(parts).toMatchObject({ date: '2027-04-01', time: '09:30' });
	});

	it('geeft null bij ongeldige invoer', () => {
		expect(isoToWallParts('')).toBeNull();
		expect(isoToWallParts('2027-04-01T09:00:00')).toBeNull(); // geen offset
		expect(isoToWallParts('niet een datum')).toBeNull();
	});
});

describe('isValidIsoWithOffset', () => {
	it('accepteert geldige ISO-strings met offset of Z', () => {
		expect(isValidIsoWithOffset('2027-04-01T09:00:00+02:00')).toBe(true);
		expect(isValidIsoWithOffset('2027-04-01T09:00:00Z')).toBe(true);
		expect(isValidIsoWithOffset('2027-04-01T09:00+02:00')).toBe(true);
	});

	it('wijst strings zonder expliciete offset af', () => {
		expect(isValidIsoWithOffset('2027-04-01T09:00:00')).toBe(false);
		expect(isValidIsoWithOffset('2027-04-01')).toBe(false);
		expect(isValidIsoWithOffset('')).toBe(false);
		expect(isValidIsoWithOffset(null)).toBe(false);
		expect(isValidIsoWithOffset(undefined)).toBe(false);
		expect(isValidIsoWithOffset(123456)).toBe(false);
	});

	it('wijst onbestaande kalenderdata af', () => {
		expect(isValidIsoWithOffset('2027-02-30T10:00:00+01:00')).toBe(false);
		expect(isValidIsoWithOffset('2027-13-01T10:00:00+01:00')).toBe(false);
	});
});

describe('sameWallParts', () => {
	it('herkent een ongewijzigde datum en tijd', () => {
		expect(sameWallParts('2027-04-01T09:00:00+02:00', '2027-04-01', '09:00')).toBe(true);
	});

	it('herkent een gewijzigde datum of tijd', () => {
		expect(sameWallParts('2027-04-01T09:00:00+02:00', '2027-04-02', '09:00')).toBe(false);
		expect(sameWallParts('2027-04-01T09:00:00+02:00', '2027-04-01', '10:00')).toBe(false);
	});

	it('beschouwt seconden in de opslag als ongewijzigd (formulierprecisie is minuten)', () => {
		expect(sameWallParts('2027-04-01T09:00:30+02:00', '2027-04-01', '09:00')).toBe(true);
	});
});
