import { describe, expect, it } from 'vitest';
import {
	normalizeAccentColor,
	parseEvent,
	validateEventInput,
	validateImportPayload
} from '$lib/utils/validation';
import type { TimerEvent } from '$lib/types';

const validEvent: TimerEvent = {
	id: '11111111-2222-4333-8444-555555555555',
	title: 'Vakantie',
	subtitle: 'Portugal',
	mode: 'countdown',
	targetDate: '2027-07-01T09:00:00+02:00',
	image: null,
	accentColor: '#6c8cff',
	units: ['days', 'hours', 'minutes'],
	showSeconds: true,
	order: 0,
	createdAt: '2026-11-01T10:00:00.000Z'
};

function clone(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { ...validEvent, ...overrides } as unknown as Record<string, unknown>;
}

describe('parseEvent', () => {
	it('accepteert een geldig event ongewijzigd', () => {
		const result = parseEvent(clone({}));
		expect(result.ok).toBe(true);
		expect(result.value).toEqual(validEvent);
	});

	it('weigert events zonder titel of id', () => {
		expect(parseEvent(clone({ title: '  ' })).ok).toBe(false);
		expect(parseEvent(clone({ id: '' })).ok).toBe(false);
		expect(parseEvent(clone({ id: 42 })).ok).toBe(false);
		expect(parseEvent(null).ok).toBe(false);
		expect(parseEvent('tekst').ok).toBe(false);
	});

	it('weigert een ongeldige targetDate (zonder offset of onbestaande datum)', () => {
		expect(parseEvent(clone({ targetDate: '2027-07-01T09:00:00' })).ok).toBe(false);
		expect(parseEvent(clone({ targetDate: '2027-02-31T09:00:00+01:00' })).ok).toBe(false);
		expect(parseEvent(clone({ targetDate: 123 })).ok).toBe(false);
	});

	it('weigert onbekende modi, eenheden en veldtypen', () => {
		expect(parseEvent(clone({ mode: 'omlaag' })).ok).toBe(false);
		expect(parseEvent(clone({ units: ['uur'] })).ok).toBe(false);
		expect(parseEvent(clone({ units: [] })).ok).toBe(false);
		expect(parseEvent(clone({ showSeconds: 'ja' })).ok).toBe(false);
		expect(parseEvent(clone({ order: -1 })).ok).toBe(false);
		expect(parseEvent(clone({ createdAt: 'gisteren' })).ok).toBe(false);
	});

	it('normaliseert eenheden naar groot-naar-klein en verwijdert duplicaten', () => {
		const result = parseEvent(clone({ units: ['seconds', 'days', 'days', 'months'] }));
		expect(result.ok).toBe(true);
		expect(result.value?.units).toEqual(['months', 'days', 'seconds']);
	});

	it('weigert niet-ondersteunde afbeeldingswaarden', () => {
		expect(parseEvent(clone({ image: 'javascript:alert(1)' })).ok).toBe(false);
		expect(parseEvent(clone({ image: 'data:text/html;base64,AAA=' })).ok).toBe(false);
		expect(parseEvent(clone({ image: 'https://voorbeeld.nl/foto.jpg' })).ok).toBe(true);
		expect(parseEvent(clone({ image: 'data:image/png;base64,iVBORw0=' })).ok).toBe(true);
		expect(parseEvent(clone({ image: null })).ok).toBe(true);
	});

	it('normaliseert of verwijdert accentkleuren', () => {
		const result = parseEvent(clone({ accentColor: '#ABC' }));
		expect(result.value?.accentColor).toBe('#aabbcc');
		const rejected = parseEvent(clone({ accentColor: 'url(https://evil.example)' }));
		expect(rejected.ok).toBe(true);
		expect(rejected.value?.accentColor).toBeUndefined();
	});

	it('kapt te lange titels af door ze te weigeren', () => {
		expect(parseEvent(clone({ title: 'x'.repeat(121) })).ok).toBe(false);
	});
});

describe('normalizeAccentColor', () => {
	it('accepteert en normaliseert hex-kleuren', () => {
		expect(normalizeAccentColor('#6C8CFF')).toBe('#6c8cff');
		expect(normalizeAccentColor('#abc')).toBe('#aabbcc');
		expect(normalizeAccentColor('#6c8cff80')).toBe('#6c8cff80');
	});

	it('weigert alles wat geen hex is', () => {
		expect(normalizeAccentColor('red')).toBeNull();
		expect(normalizeAccentColor('rgb(1,2,3)')).toBeNull();
		expect(normalizeAccentColor('url(#x)')).toBeNull();
		expect(normalizeAccentColor('#6c8cf')).toBeNull();
		expect(normalizeAccentColor('')).toBeNull();
		expect(normalizeAccentColor(null)).toBeNull();
		expect(normalizeAccentColor(12)).toBeNull();
	});
});

describe('validateEventInput', () => {
	it('accepteert complete geldige invoer', () => {
		const result = validateEventInput({
			title: 'Verjaardag',
			subtitle: undefined,
			mode: 'countdown',
			targetDate: '2027-07-01T09:00:00+02:00',
			image: null,
			accentColor: undefined,
			units: ['days', 'hours', 'minutes'],
			showSeconds: true
		});
		expect(result.ok).toBe(true);
		expect(result.value?.title).toBe('Verjaardag');
	});

	it('geeft begrijpelijke fouten bij ontbrekende verplichte velden', () => {
		const result = validateEventInput({
			title: ' ',
			mode: 'countdown',
			targetDate: 'geen',
			units: [],
			showSeconds: true
		});
		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThanOrEqual(2);
		expect(result.errors.some((error) => error.includes('title'))).toBe(true);
		expect(result.errors.some((error) => error.includes('date'))).toBe(true);
		expect(result.errors.some((error) => error.includes('unit'))).toBe(true);
	});
});

describe('validateImportPayload', () => {
	it('accepteert een geldig exportformaat', () => {
		const payload = {
			app: 'MultiUseTimer',
			version: 1,
			exportedAt: '2026-11-01T19:00:00.000Z',
			events: [clone({})]
		};
		const result = validateImportPayload(payload);
		expect(result.ok).toBe(true);
		expect(result.value?.events).toHaveLength(1);
		expect(result.value?.invalidCount).toBe(0);
	});

	it('weigert bestanden die geen MultiUseTimer-backup zijn', () => {
		expect(validateImportPayload({ app: 'AndereApp', version: 1, events: [] }).ok).toBe(false);
		expect(validateImportPayload('geen object').ok).toBe(false);
		expect(validateImportPayload(null).ok).toBe(false);
		expect(validateImportPayload({ app: 'MultiUseTimer', events: [] }).ok).toBe(false);
	});

	it('weigert nieuwere exportversies', () => {
		const result = validateImportPayload({ app: 'MultiUseTimer', version: 2, events: [] });
		expect(result.ok).toBe(false);
		expect(result.errors[0]).toContain('newer version');
	});

	it('telt ongeldige events in plaats van het hele bestand te weigeren', () => {
		const payload = {
			app: 'MultiUseTimer',
			version: 1,
			exportedAt: '2026-11-01T19:00:00.000Z',
			events: [clone({}), clone({ title: '' }), clone({ id: '' })]
		};
		const result = validateImportPayload(payload);
		expect(result.ok).toBe(true);
		expect(result.value?.events).toHaveLength(1);
		expect(result.value?.invalidCount).toBe(2);
	});
});
