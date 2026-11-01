import { beforeEach, describe, expect, it } from 'vitest';
import { eventStore } from '$lib/stores/events.svelte';
import type { EventInput } from '$lib/types';

/**
 * Tests van de reactieve store (Svelte 5 runes) zonder browseropslag:
 * buiten de browser slaat de store alleen in het geheugen op, zodat de
 * applicatielogica (toevoegen, bewerken, verwijderen, volgorde) hier
 * geïsoleerd getest kan worden. Persistentie zelf is gedekt in storage.test.ts.
 */

function input(overrides: Partial<EventInput> = {}): EventInput {
	return {
		title: 'Timer',
		mode: 'countdown',
		targetDate: '2027-07-01T09:00:00+02:00',
		image: null,
		units: ['days', 'hours', 'minutes'],
		showSeconds: true,
		...overrides
	};
}

beforeEach(() => {
	eventStore.__resetForTests?.();
	eventStore.status = 'ready';
	eventStore.events = [];
});

describe('eventStore — mutaties', () => {
	it('voegt timers toe met een unieke id en oplopende order', async () => {
		const a = await eventStore.add(input({ title: 'A' }));
		const b = await eventStore.add(input({ title: 'B' }));

		expect(eventStore.events).toHaveLength(2);
		expect(a.id).not.toBe(b.id);
		expect(a.order).toBe(0);
		expect(b.order).toBe(1);
		expect(eventStore.sorted.map((event) => event.title)).toEqual(['A', 'B']);
	});

	it('werkt tijden een bestaande timer bij en behoudt id/order/createdAt', async () => {
		const event = await eventStore.add(input({ title: 'Oud' }));
		const updated = await eventStore.update(event.id, input({ title: 'Nieuw' }));

		expect(updated?.title).toBe('Nieuw');
		expect(eventStore.events).toHaveLength(1);
		expect(eventStore.events[0]).toMatchObject({
			id: event.id,
			order: event.order,
			createdAt: event.createdAt,
			title: 'Nieuw'
		});
	});

	it('retourneert null bij het bijwerken van een onbekende id', async () => {
		expect(await eventStore.update('onzin', input())).toBeNull();
	});

	it('gooit een fout bij ongeldige invoer', async () => {
		await expect(eventStore.add(input({ title: '   ' }))).rejects.toThrow(/titel/i);
		await expect(eventStore.add(input({ targetDate: 'geen datum' }))).rejects.toThrow(/datum/i);
	});

	it('verwijdert timers', async () => {
		const event = await eventStore.add(input());
		await eventStore.remove(event.id);
		expect(eventStore.events).toHaveLength(0);
		// Verwijderen van een onbekende id is geen fout.
		await eventStore.remove('onzin');
	});
});

describe('eventStore — volgorde', () => {
	it('past een nieuwe volgorde toe via reorder', async () => {
		const a = await eventStore.add(input({ title: 'A' }));
		const b = await eventStore.add(input({ title: 'B' }));
		const c = await eventStore.add(input({ title: 'C' }));

		await eventStore.reorder([c.id, a.id, b.id]);

		expect(eventStore.sorted.map((event) => event.title)).toEqual(['C', 'A', 'B']);
		expect([...eventStore.events].map((event) => event.order).sort((x, y) => x - y)).toEqual([
			0, 1, 2
		]);
	});

	it('verplaatst één timer omhoog en omlaag', async () => {
		const a = await eventStore.add(input({ title: 'A' }));
		const b = await eventStore.add(input({ title: 'B' }));
		const c = await eventStore.add(input({ title: 'C' }));

		await eventStore.move(b.id, 'up');
		expect(eventStore.sorted.map((event) => event.title)).toEqual(['B', 'A', 'C']);

		await eventStore.move(b.id, 'down');
		expect(eventStore.sorted.map((event) => event.title)).toEqual(['A', 'B', 'C']);

		// Randgevallen: bovenaan omhoog en onderaan omlaag wijzigt niets.
		await eventStore.move(a.id, 'up');
		await eventStore.move(c.id, 'down');
		expect(eventStore.sorted.map((event) => event.id)).toEqual([a.id, b.id, c.id]);
	});

	it('past een nieuwe order toe op nieuw toegevoegde timers na reorder', async () => {
		const a = await eventStore.add(input({ title: 'A' }));
		const b = await eventStore.add(input({ title: 'B' }));
		await eventStore.reorder([b.id, a.id]);

		const c = await eventStore.add(input({ title: 'C' }));
		expect(eventStore.sorted.map((event) => event.title)).toEqual(['B', 'A', 'C']);
		expect(c.order).toBeGreaterThan(b.order);
	});
});
