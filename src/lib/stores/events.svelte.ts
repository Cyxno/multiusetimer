import { browser } from '$app/environment';
import * as storage from '$lib/db/storage';
import { describeStorageError } from '$lib/db/storage';
import { createId } from '$lib/utils/id';
import { validateEventInput, parseEvent } from '$lib/utils/validation';
import { notify } from '$lib/stores/notify.svelte';
import type { EventInput, ExportPayload, ImportResult, TimerEvent } from '$lib/types';
import type { ImportMode } from '$lib/db/storage';

/**
 * Centrale reactieve applicatiestatus (Svelte 5 runes).
 *
 * Componenten zijn zelf niet verantwoordelijk voor persistente opslag: elke
 * mutatie in deze store schrijft automatisch (geserialiseerd) naar de
 * opslaglaag. Laadstatus en opslagstatus worden gescheiden bijgehouden.
 *
 * Veranderingen worden eerst in het geheugen doorgevoerd en daarna
 * persisteer geprobeerd; een opslagfout leidt tot een zichtbare melding en
 * voorkomt dat gegevens stilzwijgend verloren gaan.
 */
class EventStore {
	events = $state<TimerEvent[]>([]);
	/** 'idle' → nog niet geprobeerd te laden; 'loading' | 'ready' | 'error'. */
	status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	/** Laatste opslagfout (niet-blokkerend, wordt gewist na een geslaagde schrijfactie). */
	storageError = $state<string | null>(null);

	#loaded = false;

	/** Events in dashboardvolgorde. */
	get sorted(): TimerEvent[] {
		return [...this.events].sort((a, b) => a.order - b.order);
	}

	get isReady(): boolean {
		return this.status === 'ready';
	}

	/** Herstelt opgeslagen gegevens bij het laden van de applicatie. */
	async load(): Promise<void> {
		if (!browser || this.#loaded) return;
		this.#loaded = true;
		this.status = 'loading';
		try {
			this.events = await storage.getAllEvents();
			this.status = 'ready';
		} catch (error) {
			this.status = 'error';
			this.storageError = describeStorageError(error);
		}
	}

	async retryLoad(): Promise<void> {
		if (!browser) return;
		this.status = 'idle';
		this.#loaded = false;
		await this.load();
	}

	#nextOrder(): number {
		return this.events.reduce((max, event) => Math.max(max, event.order + 1), 0);
	}

	/** Persisteer een schrijfactie; meldt fouten zonder de UI-staat terug te draaien. */
	async #persist(operation: () => Promise<void>): Promise<void> {
		if (!browser) return;
		try {
			await operation();
			this.storageError = null;
		} catch (error) {
			this.storageError = describeStorageError(error);
			notify.error(this.storageError);
		}
	}

	/** Voegt een nieuwe timer toe; retourneert het aangemaakte event. */
	async add(input: EventInput): Promise<TimerEvent> {
		const validated = validateEventInput(input);
		if (!validated.ok || !validated.value) {
			throw new Error(validated.errors.join(' '));
		}

		const event: TimerEvent = {
			...validated.value,
			id: createId(),
			order: this.#nextOrder(),
			createdAt: new Date().toISOString()
		};

		this.events = [...this.events, event];
		await this.#persist(() => storage.saveEvent(event));
		return event;
	}

	/** Werkt een bestaande timer bij. */
	async update(id: string, input: EventInput): Promise<TimerEvent | null> {
		const current = this.events.find((event) => event.id === id);
		if (!current) return null;

		const validated = validateEventInput(input);
		if (!validated.ok || !validated.value) {
			throw new Error(validated.errors.join(' '));
		}

		const updated: TimerEvent = { ...current, ...validated.value };
		this.events = this.events.map((event) => (event.id === id ? updated : event));
		await this.#persist(() => storage.updateEvent(id, updated));
		return updated;
	}

	/** Verwijdert een timer. */
	async remove(id: string): Promise<void> {
		if (!this.events.some((event) => event.id === id)) return;
		this.events = this.events.filter((event) => event.id !== id);
		await this.#persist(() => storage.deleteEvent(id));
	}

	/**
	 * Past een nieuwe volgorde toe (na drag-and-drop of verplaatsen) en
	 * persisteert deze. `orderedIds` bevat id's in de gewenste volgorde; ids
	 * die ontbreken blijven na de genoemde, op hun bestaande relatieve positie.
	 */
	async reorder(orderedIds: string[]): Promise<void> {
		const known = new Set(this.events.map((event) => event.id));
		const ids = orderedIds.filter((id) => known.has(id));
		if (ids.length === 0) return;
		const rest = this.sorted
			.map((event) => event.id)
			.filter((id) => !ids.includes(id));
		const full = [...ids, ...rest];

		const orderById = new Map(full.map((id, index) => [id, index]));
		this.events = this.events.map((event) => ({
			...event,
			order: orderById.get(event.id) ?? event.order
		}));

		await this.#persist(() => storage.reorderEvents(full));
	}

	/** Verplaatst één event één positie omhoog of omlaag (toegankelijk alternatief). */
	async move(id: string, direction: 'up' | 'down'): Promise<void> {
		const sorted = this.sorted;
		const index = sorted.findIndex((event) => event.id === id);
		if (index < 0) return;
		const target = direction === 'up' ? index - 1 : index + 1;
		if (target < 0 || target >= sorted.length) return;

		const ids = sorted.map((event) => event.id);
		[ids[index], ids[target]] = [ids[target], ids[index]];
		await this.reorder(ids);
	}

	/** Exporteert alle timers als backup-payload (inclusief data-URL's). */
	async export(): Promise<ExportPayload> {
		return storage.exportEvents();
	}

	/**
	 * Importeert een JSON-backup en ververst de status met het resultaat.
	 * Gooit een fout met een begrijpelijke melding bij een ongeldig bestand of
	 * mislukte import; bestaande gegevens blijven dan behouden.
	 */
	async import(json: string, mode: ImportMode): Promise<ImportResult> {
		const result = await storage.importEvents(json, mode);
		// Herladen vanuit de opslag zodat de status exact klopt met wat er staat.
		if (browser) {
			try {
				this.events = await storage.getAllEvents();
				this.storageError = null;
			} catch (error) {
				this.storageError = describeStorageError(error);
				notify.error(this.storageError);
			}
		}
		return result;
	}

	/** Alleen voor tests: volledige reset van de in-memory status. */
	__resetForTests(): void {
		this.events = [];
		this.status = 'idle';
		this.storageError = null;
		this.#loaded = false;
	}
}

export const eventStore = new EventStore();
