import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import {
	__rawStoreForTests,
	configureStorage,
	deleteEvent,
	exportEvents,
	getAllEvents,
	importEvents,
	reorderEvents,
	saveAllEvents,
	saveEvent,
	updateEvent
} from '$lib/db/storage';
import type { TimerEvent } from '$lib/types';

/**
 * Integratietests van de opslaglaag met fake-indexeddb (IndexedDB in Node).
 * Elke test krijgt een eigen databasenaam voor volledige isolatie.
 */

const IMAGE_DATA_URL =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function makeEvent(overrides: Partial<TimerEvent> = {}): TimerEvent {
	return {
		id: 'id-' + Math.random().toString(16).slice(2, 10),
		title: 'Test timer',
		mode: 'countdown',
		targetDate: '2027-07-01T09:00:00+02:00',
		image: null,
		units: ['days', 'hours', 'minutes'],
		showSeconds: true,
		order: 0,
		createdAt: '2026-11-01T10:00:00.000Z',
		...overrides
	};
}

beforeEach(() => {
	configureStorage({ name: 'test-db-' + Math.random().toString(36).slice(2) });
});

describe('getAllEvents / saveEvent', () => {
	it('slaagt events op en leest ze terug, gesorteerd op order', async () => {
		const a = makeEvent({ id: 'a', order: 1, title: 'B' });
		const b = makeEvent({ id: 'b', order: 0, title: 'A' });
		await saveEvent(a);
		await saveEvent(b);

		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['b', 'a']);
		expect(events[1].title).toBe('B');
	});

	it('behoudt afbeeldings-data-URLs', async () => {
		const event = makeEvent({ image: IMAGE_DATA_URL });
		await saveEvent(event);
		const events = await getAllEvents();
		expect(events[0].image).toBe(IMAGE_DATA_URL);
	});

	it('werkt zonder voorafgaande index (reconstructie via sleutelscan)', async () => {
		// Schrijf rechtstreeks een event weg zonder een index bij te houden,
		// zoals bij een oude of kapotte opslagstatus.
		const raw = __rawStoreForTests();
		await raw.setItem('event:raw', makeEvent({ id: 'raw', title: 'Zonder index' }));
		expect(await raw.getItem('events:index')).toBeNull();

		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['raw']);

		// De index is daarna gereconstrueerd en volgende leesacties blijven werken.
		const again = await getAllEvents();
		expect(again).toHaveLength(1);
	});

	it('updateEvent overschrijft een bestaand event', async () => {
		const event = makeEvent({ id: 'a', title: 'Oud' });
		await saveEvent(event);
		await updateEvent('a', { ...event, title: 'Nieuw' });
		const events = await getAllEvents();
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Nieuw');
	});

	it('deleteEvent verwijdert het event definitief', async () => {
		await saveEvent(makeEvent({ id: 'a' }));
		await deleteEvent('a');
		expect(await getAllEvents()).toEqual([]);
		// Opnieuw verwijderen is geen fout.
		await deleteEvent('a');
	});
});

describe('seriële wachtrij', () => {
	it('behandelt snelle opeenvolgende schrijfacties in volgorde', async () => {
		const base = makeEvent({ id: 'race', title: 'versie-0' });
		await saveEvent(base);
		// Bewust niet awaiten: schrijfacties starten gelijktijdig.
		const writes = [1, 2, 3, 4, 5].map((n) =>
			updateEvent('race', { ...base, title: `versie-${n}` })
		);
		await Promise.all(writes);

		const events = await getAllEvents();
		expect(events[0].title).toBe('versie-5');
	});
});

describe('saveAllEvents', () => {
	it('vervangt de volledige lijst en verwijdert oude events', async () => {
		await saveEvent(makeEvent({ id: 'oud' }));
		const nieuw = [makeEvent({ id: 'n1', order: 0 }), makeEvent({ id: 'n2', order: 1 })];
		await saveAllEvents(nieuw);

		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['n1', 'n2']);
	});
});

describe('reorderEvents', () => {
	it('past de order-waarden persistent aan', async () => {
		await saveEvent(makeEvent({ id: 'a', order: 0 }));
		await saveEvent(makeEvent({ id: 'b', order: 1 }));
		await saveEvent(makeEvent({ id: 'c', order: 2 }));

		await reorderEvents(['c', 'a', 'b']);
		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['c', 'a', 'b']);
	});
});

describe('exportEvents', () => {
	it('levert een versieerbaar exportformaat met alle events', async () => {
		await saveEvent(makeEvent({ id: 'a', image: IMAGE_DATA_URL }));
		const payload = await exportEvents();
		expect(payload.app).toBe('MultiUseTimer');
		expect(payload.version).toBe(1);
		expect(payload.events).toHaveLength(1);
		expect(payload.exportedAt).toBeTruthy();
		expect((payload.events[0] as TimerEvent).image).toBe(IMAGE_DATA_URL);
	});
});

describe('importEvents', () => {
	it('voegt toe zonder bestaande id te overschrijven (merge)', async () => {
		const bestaande = makeEvent({ id: 'bestaand', title: 'Bestaand', order: 0 });
		await saveEvent(bestaande);

		const backup = {
			app: 'MultiUseTimer',
			version: 1,
			exportedAt: '2026-11-01T19:00:00.000Z',
			events: [
				bestaande, // zelfde id → overgeslagen
				{ ...makeEvent({ id: 'nieuw', title: 'Nieuw' }), order: 0 }
			]
		};

		const result = await importEvents(JSON.stringify(backup), 'merge');
		expect(result.imported).toBe(1);
		expect(result.skippedExisting).toBe(1);

		const events = await getAllEvents();
		expect(events).toHaveLength(2);
		expect(events.find((event) => event.id === 'bestaand')?.title).toBe('Bestaand');
		// Nieuw event komt ná de bestaande in de volgorde.
		expect(events[1].id).toBe('nieuw');
	});

	it('vervangt de volledige lijst bij mode "replace"', async () => {
		await saveEvent(makeEvent({ id: 'oud' }));
		const backup = {
			app: 'MultiUseTimer',
			version: 1,
			exportedAt: '2026-11-01T19:00:00.000Z',
			events: [makeEvent({ id: 'n1' }), makeEvent({ id: 'n2' })]
		};

		const result = await importEvents(JSON.stringify(backup), 'replace');
		expect(result.imported).toBe(2);
		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['n1', 'n2']);
	});

	it('telt ongeldige events mee zonder ze op te slaan', async () => {
		const backup = {
			app: 'MultiUseTimer',
			version: 1,
			exportedAt: '2026-11-01T19:00:00.000Z',
			events: [makeEvent({ id: 'goed' }), { id: 'fout', title: 42 }]
		};
		const result = await importEvents(JSON.stringify(backup), 'replace');
		expect(result.imported).toBe(1);
		expect(result.invalid).toBe(1);
	});

	it('weigert ongeldig JSON met een duidelijke fout', async () => {
		await expect(importEvents('{ geen json', 'replace')).rejects.toThrow(/JSON/);
	});

	it('weigert bestanden met een onbekende app of nieuwere versie', async () => {
		const verkeerd = { app: 'AndereApp', version: 1, events: [] };
		await expect(importEvents(JSON.stringify(verkeerd), 'replace')).rejects.toThrow(
			/MultiUseTimer/
		);

		const nieuwer = { app: 'MultiUseTimer', version: 99, events: [] };
		await expect(importEvents(JSON.stringify(nieuwer), 'replace')).rejects.toThrow(
			/nieuwere versie/
		);
	});
});

describe('robuustheid tegen beschadigde gegevens', () => {
	it('slaagt beschadigde events over en laat goede events werken', async () => {
		await saveEvent(makeEvent({ id: 'goed' }));

		// Schrijf rechtstreeks een beschadigd record en voeg het toe aan de index.
		const raw = __rawStoreForTests();
		await raw.setItem('event:kapot', { id: 'kapot', title: 42, units: 'alles' });
		await raw.setItem('events:index', ['goed', 'kapot']);

		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['goed']);
	});

	it('reset de index naar alleen geldige events na een reconstructie', async () => {
		const raw = __rawStoreForTests();
		await raw.setItem('event:kapot', 'gewoon een string');
		await raw.setItem('events:index', ['kapot']);

		expect(await getAllEvents()).toEqual([]);

		// Nieuwe events kunnen daarna gewoon worden opgeslagen.
		await saveEvent(makeEvent({ id: 'vers' }));
		const events = await getAllEvents();
		expect(events.map((event) => event.id)).toEqual(['vers']);
	});
});
