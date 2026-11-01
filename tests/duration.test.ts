import { describe, expect, it } from 'vitest';
import { computeDuration, buildDurationDisplay } from '$lib/utils/duration';
import type { TimeUnit } from '$lib/types';
import type { DurationResult } from '$lib/utils/duration';

/**
 * De tests draaien met TZ=Europe/Amsterdam (vite.config.ts) zodat de
 * kalendergebaseerde semantiek deterministisch is, inclusief de
 * zomer-/wintertijdovergangen van 2026.
 */

const DHMS: TimeUnit[] = ['days', 'hours', 'minutes', 'seconds'];
const MDHMS: TimeUnit[] = ['months', 'days', 'hours', 'minutes', 'seconds'];
const ALL: TimeUnit[] = ['months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];

function compute(now: Date, targetIso: string, units: TimeUnit[] = ALL): DurationResult {
	const result = computeDuration(now, targetIso, units);
	expect(result).not.toBeNull();
	return result as DurationResult;
}

describe('computeDuration — basis', () => {
	it('telt af naar een toekomstig tijdstip', () => {
		const now = new Date(2027, 2, 31, 10, 0, 0); // 31 maart 2027, 10:00 CEST
		const result = compute(now, '2027-04-01T09:00:00+02:00', DHMS);
		// 23 uur verschil: kalenderdagVerschil = 1, maar zelfde klokmoment
		// bestaat pas na 23 uur → 0 dagen, 23 uur.
		expect(result.direction).toBe('future');
		expect(result.days).toBe(0);
		expect(result.hours).toBe(23);
		expect(result.minutes).toBe(0);
		expect(result.seconds).toBe(0);
	});

	it('telt op vanaf een tijdstip in het verleden (count-up)', () => {
		const now = new Date(2027, 0, 10, 12, 3, 0);
		const result = compute(now, '2027-01-10T10:00:00+01:00', DHMS);
		expect(result.direction).toBe('past');
		expect(result.days).toBe(0);
		expect(result.hours).toBe(2);
		expect(result.minutes).toBe(3);
	});

	it('geeft direction "now" op exact het doelmoment', () => {
		const now = new Date(2027, 3, 1, 9, 0, 0);
		const result = compute(now, '2027-04-01T09:00:00+02:00', DHMS);
		expect(result.direction).toBe('now');
		expect(result.days).toBe(0);
		expect(result.hours).toBe(0);
		expect(result.seconds).toBe(0);
	});

	it('geeft null bij een ongeldige targetDate', () => {
		const now = new Date(2027, 0, 1);
		expect(computeDuration(now, 'geen-datum', DHMS)).toBeNull();
		expect(computeDuration(now, '2027-04-01T09:00:00', DHMS)).toBeNull();
	});

	it('handelt minder dan één seconde resterend af zonder negatieve waarden', () => {
		const now = new Date(2027, 0, 1, 10, 0, 0, 0);
		const result = compute(now, '2027-01-01T10:00:00.400+01:00', DHMS);
		expect(result.direction).toBe('future');
		expect(result.hours).toBe(0);
		expect(result.minutes).toBe(0);
		expect(result.seconds).toBe(0);
	});

	it('toont bij een target in het verleden geen negatieve waarden', () => {
		const now = new Date(2027, 5, 1, 10, 0, 0);
		const result = compute(now, '2027-01-01T10:00:00+01:00', DHMS);
		expect(result.direction).toBe('past');
		expect(Object.values(result).every((value) => typeof value === 'number' ? value >= 0 : true)).toBe(
			true
		);
	});
});

describe('computeDuration — maanden (kalendergebaseerd)', () => {
	it('rekent met echte maandlengtes: 31 jan → 1 mar is 1 maand + 1 dag', () => {
		// 2027 is geen schrikkeljaar: 31 jan + 1 maand = 28 feb (geklemd).
		const now = new Date(2027, 0, 31, 10, 0, 0);
		const result = compute(now, '2027-03-01T10:00:00+01:00', MDHMS);
		expect(result.months).toBe(1);
		expect(result.days).toBe(1);
		expect(result.hours).toBe(0);
	});

	it('geeft geen maand bij een fractie daarvan (31 jan → 1 feb)', () => {
		const now = new Date(2027, 0, 31, 10, 0, 0);
		const result = compute(now, '2027-02-01T10:00:00+01:00', MDHMS);
		expect(result.months).toBe(0);
		expect(result.days).toBe(1);
	});

	it('handelt schrikkeljaren correct af (28 feb → 1 mar 2028)', () => {
		const now = new Date(2028, 1, 28, 10, 0, 0);
		const result = compute(now, '2028-03-01T10:00:00+01:00', MDHMS);
		expect(result.months).toBe(0);
		expect(result.days).toBe(2); // 29 feb en 1 mar: kalenderdagen
	});

	it('rekent een volledig jaar als 12 maanden', () => {
		const now = new Date(2027, 0, 1, 0, 0, 0);
		const result = compute(now, '2028-01-01T00:00:00+01:00', MDHMS);
		expect(result.months).toBe(12);
		expect(result.days).toBe(0);
	});

	it('loopt de dagen door in uren wanneer dagen niet gekozen zijn', () => {
		// 2 maanden + 14,5 dagen: zonder eenheden weken/dagen verschijnen de
		// dagen na de maanden als totaal aantal uren.
		const now = new Date(2027, 0, 1, 0, 0, 0);
		const result = compute(now, '2027-03-15T12:00:00+01:00', ['months', 'hours', 'minutes']);
		expect(result.months).toBe(2);
		expect(result.days).toBe(0);
		expect(result.hours).toBe(14 * 24 + 12);
		expect(result.minutes).toBe(0);
	});
});

describe('computeDuration — weken en dagen', () => {
	it('leidt weken af uit kalenderdagen (28 dagen = 4 weken)', () => {
		const now = new Date(2027, 0, 1, 12, 0, 0);
		const result = compute(now, '2027-01-29T12:00:00+01:00', ['weeks', 'days']);
		expect(result.weeks).toBe(4);
		expect(result.days).toBe(0);
	});

	it('geeft het restant als dagen (29 dagen = 4 weken + 1 dag)', () => {
		const now = new Date(2027, 0, 1, 12, 0, 0);
		const result = compute(now, '2027-01-30T12:00:00+01:00', ['weeks', 'days', 'hours']);
		expect(result.weeks).toBe(4);
		expect(result.days).toBe(1);
	});

	it('loopt dagen zonder weken door in uren', () => {
		const now = new Date(2027, 0, 1, 12, 0, 0);
		const result = compute(now, '2027-01-30T12:00:00+01:00', ['weeks', 'hours']);
		expect(result.weeks).toBe(4);
		expect(result.days).toBe(0);
		expect(result.hours).toBe(24);
	});

	it('toont het totaal aantal kalenderdagen zonder maanden', () => {
		const now = new Date(2027, 0, 1, 12, 0, 0);
		const result = compute(now, '2028-01-01T12:00:00+01:00', ['days']);
		expect(result.days).toBe(365);
	});
});

describe('computeDuration — zomer- en wintertijd (Europe/Amsterdam)', () => {
	it('telt over de overgang naar zomertijd 1 kalenderdag (23 echte uren)', () => {
		// Nacht van 28 op 29 maart 2026: 02:00 → 03:00 (uur valt weg).
		const now = new Date(2026, 2, 28, 12, 0, 0); // 12:00 CET (+01:00)
		const result = compute(now, '2026-03-29T12:00:00+02:00', ['days', 'hours', 'minutes']);
		// Zelfde klokmoment de volgende dag = 1 kalenderdag; resterende tijd 0.
		expect(result.days).toBe(1);
		expect(result.hours).toBe(0);
	});

	it('telt over de overgang naar wintertijd 1 kalenderdag (25 echte uren)', () => {
		// Nacht van 24 op 25 oktober 2026: 03:00 → 02:00 (uur komt terug).
		const now = new Date(2026, 9, 24, 12, 0, 0); // 12:00 CEST (+02:00)
		const result = compute(now, '2026-10-25T12:00:00+01:00', ['days', 'hours', 'minutes']);
		expect(result.days).toBe(1);
		expect(result.hours).toBe(0);
	});

	it('geeft het echte tijdsverschil wanneer dagen niet getoond worden', () => {
		// Zelfde scenario als hierboven, maar nu alleen uren: 23 echte uren.
		const now = new Date(2026, 2, 28, 12, 0, 0);
		const result = compute(now, '2026-03-29T12:00:00+02:00', ['hours']);
		expect(result.hours).toBe(23);
	});

	it('voorkomt een negatief restant bij een latere kloktijd in het anker', () => {
		// Anker 23:30 → einde 00:30 de volgende dag: 0 dagen, 1 uur.
		const now = new Date(2027, 0, 1, 23, 30, 0);
		const result = compute(now, '2027-01-02T00:30:00+01:00', DHMS);
		expect(result.days).toBe(0);
		expect(result.hours).toBe(1);
	});
});

describe('computeDuration — doorstroming naar kleinste eenheden', () => {
	it('toont het totaal aantal minuten zonder uren', () => {
		const now = new Date(2027, 0, 1, 10, 0, 0);
		const result = compute(now, '2027-01-01T12:30:45+01:00', ['minutes', 'seconds']);
		expect(result.minutes).toBe(150);
		expect(result.seconds).toBe(45);
	});

	it('toont het totaal aantal seconden als enige eenheid', () => {
		const now = new Date(2027, 0, 1, 10, 0, 0);
		const result = compute(now, '2027-01-01T10:01:30+01:00', ['seconds']);
		expect(result.seconds).toBe(90);
	});
});

describe('buildDurationDisplay — presentatie', () => {
	it('toont dag-niveaueenheden als blokken en de rest als digitale klok', () => {
		const result: DurationResult = {
			months: 1, weeks: 0, days: 3, hours: 8, minutes: 42, seconds: 15, direction: 'future'
		};
		const display = buildDurationDisplay(result, MDHMS, true);
		expect(display.blocks.map((block) => block.unit)).toEqual(['months', 'days']);
		expect(display.blocks[0]).toMatchObject({ text: '1', label: 'month' });
		expect(display.blocks[1]).toMatchObject({ text: '3', label: 'days' });
		expect(display.clock).toBe('08:42:15');
		// Het aria-label is het enige wat schermlezers voorlezen: volledige detail.
		expect(display.ariaLabel).toBe('1 month, 3 days, 8 hours, 42 minutes, 15 seconds');
	});

	it('zonder de eenheid seconden toont de klok alleen uren en minuten', () => {
		const result: DurationResult = {
			months: 0, weeks: 0, days: 4, hours: 8, minutes: 42, seconds: 15, direction: 'future'
		};
		const display = buildDurationDisplay(result, DHMS, false);
		expect(display.clock).toBe('08:42');
		expect(display.blocks.map((block) => block.unit)).toEqual(['days']);
	});

	it('zonder de eenheid uren verschijnen kleinere eenheden als tekst', () => {
		const result: DurationResult = {
			months: 0, weeks: 0, days: 0, hours: 0, minutes: 12, seconds: 34, direction: 'future'
		};
		const display = buildDurationDisplay(result, ['days', 'minutes', 'seconds'], true);
		expect(display.clock).toBeNull();
		expect(display.trailing.map((block) => block.unit)).toEqual(['minutes', 'seconds']);
		expect(display.trailing[0]).toMatchObject({ text: '12', label: 'minutes' });
	});

	it('onderdrukt nulwaarden maar toont de kleinste eenheid in de nulstatus', () => {
		const zero: DurationResult = {
			months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, direction: 'now'
		};
		// Met showSeconds is de kleinste effectieve eenheid "seconden".
		const display = buildDurationDisplay(zero, ['months', 'days'], true);
		expect(display.blocks).toHaveLength(0);
		expect(display.trailing).toHaveLength(1);
		expect(display.trailing[0]).toMatchObject({ unit: 'seconds', text: '0', label: 'seconds' });
		expect(display.allZero).toBe(true);
		expect(display.ariaLabel).toBe('0 seconds');

		// Zonder seconden is de kleinste geselecteerde eenheid "dagen".
		const displayNoSeconds = buildDurationDisplay(zero, ['months', 'days'], false);
		expect(displayNoSeconds.blocks).toHaveLength(1);
		expect(displayNoSeconds.blocks[0]).toMatchObject({ unit: 'days', text: '0', label: 'days' });
		expect(displayNoSeconds.ariaLabel).toBe('0 days');
	});

	it('toont in de nulstatus met uren de digitale klok op nul', () => {
		const zero: DurationResult = {
			months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, direction: 'now'
		};
		const display = buildDurationDisplay(zero, DHMS, true);
		expect(display.blocks).toHaveLength(0);
		expect(display.clock).toBe('00:00:00');
		expect(display.allZero).toBe(true);
	});

	it('verbergt de klok wanneer er dag-blokken zijn en de klok op nul staat', () => {
		const result: DurationResult = {
			months: 0, weeks: 0, days: 5, hours: 0, minutes: 0, seconds: 0, direction: 'future'
		};
		const display = buildDurationDisplay(result, DHMS, true);
		expect(display.blocks.map((block) => block.unit)).toEqual(['days']);
		expect(display.clock).toBeNull();
	});

	it('toont eenheden nooit buiten de selectie om', () => {
		const result: DurationResult = {
			months: 2, weeks: 3, days: 4, hours: 5, minutes: 6, seconds: 7, direction: 'future'
		};
		const display = buildDurationDisplay(result, ['months', 'days'], false);
		expect(display.blocks.map((block) => block.unit)).toEqual(['months', 'days']);
		expect(display.clock).toBeNull();
		expect(display.trailing).toHaveLength(0);
	});

	it('geeft seconden als losse tekst zonder de eenheid uren', () => {
		const result: DurationResult = {
			months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 12, direction: 'future'
		};
		const display = buildDurationDisplay(result, ['seconds'], true);
		expect(display.trailing[0]).toMatchObject({ unit: 'seconds', text: '12', label: 'seconds' });
		expect(display.ariaLabel).toBe('12 seconds');
	});
});
