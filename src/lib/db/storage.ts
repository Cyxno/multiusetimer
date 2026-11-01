import localforage from 'localforage';
import { parseEvent, validateImportPayload } from '$lib/utils/validation';
import type { TimerEvent, ImportResult, ExportPayload } from '$lib/types';

/**
 * Persistente opslaglaag op basis van localForage.
 *
 * - Primaire opslag is IndexedDB; localForage valt terug op localStorage
 *   wanneer IndexedDB niet beschikbaar is.
 * - Componenten en stores spreken de opslag uitsluitend via deze laag aan.
 * - Alle operaties lopen via een seriële wachtrij, zodat snelle opeenvolgende
 *   wijzigingen elkaar nooit in verkeerde volgorde overschrijven.
 * - Gegevens die uit de opslag komen worden gevalideerd; beschadigde
 *   losse events worden overgeslagen in plaats van de app te laten crashen.
 */

const INDEX_KEY = 'events:index';
const EVENT_PREFIX = 'event:';

export interface StorageOptions {
	/** Databasenaam; alleen voor tests om isolatie tussen runs te waarborgen. */
	name?: string;
}

let instance: LocalForage | null = null;

function getStore(options?: StorageOptions): LocalForage {
	if (!instance) {
		instance = localforage.createInstance({
			name: options?.name ?? 'multiusetimer',
			storeName: 'events',
			description: 'Lokale opslag van MultiUseTimer-events'
		});
		// IndexedDB eerst, met localStorage als expliciete fallback.
		instance
			.setDriver([localforage.INDEXEDDB, localforage.LOCALSTORAGE])
			.catch(() => undefined);
	}
	return instance;
}

/** Herconfigureert de opslaglaag (alleen bedoeld voor tests). */
export function configureStorage(options: StorageOptions): void {
	instance = null;
	getStore(options);
}

/**
 * Alleen voor tests: directe toegang tot de onderliggende instance, om
 * beschadigde opgeslagen gegevens te simuleren (die de app moet overleven).
 */
export function __rawStoreForTests(): LocalForage {
	return getStore();
}

// ——— Seriële wachtrij: schrijfacties en leesacties verstoren elkaar niet. ———

let queue: Promise<unknown> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
	const run = queue.then(operation, operation);
	queue = run.then(
		() => undefined,
		() => undefined
	);
	return run;
}

// ——— Foutafhandeling ———

export function isQuotaError(error: unknown): boolean {
	if (!error) return false;
	const name = (error as { name?: string }).name ?? '';
	const message = String((error as { message?: string }).message ?? '');
	return (
		name.toLowerCase().includes('quota') ||
		message.toLowerCase().includes('quota') ||
		message.toLowerCase().includes('exceeded the storage')
	);
}

export function describeStorageError(error: unknown): string {
	if (isQuotaError(error)) {
		return 'Browser storage is full. Remove timers or images and try again.';
	}
	if (error instanceof Error && error.name === 'InvalidStateError') {
		return 'Browser storage is unavailable (for example in a private window without storage).';
	}
	return 'Saving to browser storage failed. The change is still on screen, but it may not have been saved.';
}

function describeImportError(error: unknown): string {
	if (error instanceof SyntaxError) {
		return 'Invalid file: the content is not valid JSON.';
	}
	if (isQuotaError(error)) {
		return 'Not enough storage space to import this backup. The existing timers are unchanged.';
	}
	if (error instanceof Error && error.message) return error.message;
	return 'The import failed. The existing timers are unchanged.';
}

// ——— Indexbeheer ———

async function readIndex(store: LocalForage): Promise<string[]> {
	const index = await store.getItem<string[]>(INDEX_KEY);
	return Array.isArray(index) ? index.filter((id) => typeof id === 'string') : [];
}

async function writeIndex(store: LocalForage, ids: string[]): Promise<void> {
	await store.setItem(INDEX_KEY, ids);
}

async function addToIndex(store: LocalForage, id: string): Promise<void> {
	const ids = await readIndex(store);
	if (!ids.includes(id)) {
		ids.push(id);
		await writeIndex(store, ids);
	}
}

async function removeFromIndex(store: LocalForage, id: string): Promise<void> {
	const ids = await readIndex(store);
	const next = ids.filter((existing) => existing !== id);
	if (next.length !== ids.length) await writeIndex(store, next);
}

async function loadEvent(store: LocalForage, id: string): Promise<TimerEvent | null> {
	const raw = await store.getItem(`${EVENT_PREFIX}${id}`);
	if (raw === null || raw === undefined) return null;
	const parsed = parseEvent(raw);
	return parsed.ok && parsed.value ? parsed.value : null;
}

// ——— Publieke API ———

/**
 * Laadt alle events, gesorteerd op `order`. Ontbrekende of beschadigde
 * events worden overgeslagen; een ontbrekende index wordt gereconstrueerd.
 */
export async function getAllEvents(): Promise<TimerEvent[]> {
	return enqueue(async () => {
		const store = getStore();
		let ids = await readIndex(store);

		if (ids.length === 0) {
			// Geen (geldige) index: scan alle sleutels en bouw de index opnieuw.
			const keys = (await store.keys()).filter((key) => key.startsWith(EVENT_PREFIX));
			const scannedIds = keys.map((key) => key.slice(EVENT_PREFIX.length));
			if (scannedIds.length > 0) {
				await writeIndex(store, scannedIds);
				ids = scannedIds;
			}
		}

		const loaded = await Promise.all(ids.map((id) => loadEvent(store, id)));
		const events = loaded.filter((event): event is TimerEvent => event !== null);

		// Index opruimen als events verdwenen zijn.
		if (events.length !== ids.length) {
			await writeIndex(store, events.map((event) => event.id));
		}

		return events.sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
	});
}

/** Voegt een event toe of overschrijft het bestaande event met dezelfde id. */
export async function saveEvent(event: TimerEvent): Promise<void> {
	await enqueue(async () => {
		const store = getStore();
		await store.setItem(`${EVENT_PREFIX}${event.id}`, event);
		await addToIndex(store, event.id);
	});
}

/** Werk een bestaand event bij (volledig object). */
export async function updateEvent(id: string, event: TimerEvent): Promise<void> {
	await saveEvent({ ...event, id });
}

export async function deleteEvent(id: string): Promise<void> {
	await enqueue(async () => {
		const store = getStore();
		await store.removeItem(`${EVENT_PREFIX}${id}`);
		await removeFromIndex(store, id);
	});
}

/**
 * Slaat een volledige lijst op (gebruikt bij importeren/vervangen): events
 * die niet in de lijst staan worden uit de opslag verwijderd.
 */
export async function saveAllEvents(events: TimerEvent[]): Promise<void> {
	await enqueue(async () => {
		const store = getStore();
		const keepIds = new Set(events.map((event) => event.id));

		const keys = (await store.keys()).filter((key) => key.startsWith(EVENT_PREFIX));
		const stale = keys.filter((key) => !keepIds.has(key.slice(EVENT_PREFIX.length)));
		await Promise.all(stale.map((key) => store.removeItem(key)));

		await Promise.all(events.map((event) => store.setItem(`${EVENT_PREFIX}${event.id}`, event)));
		await writeIndex(store, events.map((event) => event.id));
	});
}

/** Werkt de positie van meerdere events in één keer bij. */
export async function reorderEvents(orderedIds: string[]): Promise<void> {
	await enqueue(async () => {
		const store = getStore();
		await Promise.all(
			orderedIds.map((id, index) =>
				loadEvent(store, id).then((event) => {
					if (!event || event.order === index) return undefined;
					return store.setItem(`${EVENT_PREFIX}${id}`, { ...event, order: index });
				})
			)
		);
	});
}

/** Bouwt het exportformaat met alle events (inclusief data-URL's). */
export async function exportEvents(): Promise<ExportPayload> {
	const events = await getAllEvents();
	return {
		app: 'MultiUseTimer',
		version: 1,
		exportedAt: new Date().toISOString(),
		events
	};
}

export type ImportMode = 'replace' | 'merge';

/**
 * Importeert een JSON-backup.
 *
 * - `replace`: vervangt de volledige lijst door de geïmporteerde events.
 * - `merge`: voegt events toe; events met een al bestaande id worden
 *   overgeslagen zodat bestaande gegevens behouden blijven.
 *
 * Bij fouten wordt niets gewijzigd; het resultaat meldt wat er is gebeurd.
 */
export async function importEvents(json: string, mode: ImportMode): Promise<ImportResult> {
	let payload: unknown;
	try {
		payload = JSON.parse(json);
	} catch {
		throw new Error('Invalid file: the content is not valid JSON.');
	}

	const validated = validateImportPayload(payload);
	if (!validated.ok) {
		throw new Error(validated.errors[0] ?? 'Ongeldig bestand.');
	}
	const { events: incoming, invalidCount } = validated.value;

	try {
		if (mode === 'replace') {
			await saveAllEvents(incoming);
			return { imported: incoming.length, skippedExisting: 0, invalid: invalidCount, mode };
		}

		const existing = await getAllEvents();
		const existingIds = new Set(existing.map((event) => event.id));
		const toAdd = incoming.filter((event) => !existingIds.has(event.id));

		// Voeg toe ná de bestaande events (volgorde behouden).
		let nextOrder = existing.reduce((max, event) => Math.max(max, event.order + 1), 0);
		const added = toAdd.map((event) => ({ ...event, order: nextOrder++ }));

		if (added.length > 0) {
			await enqueue(async () => {
				const store = getStore();
				await Promise.all(
					added.map((event) => store.setItem(`${EVENT_PREFIX}${event.id}`, event))
				);
				const index = await readIndex(store);
				await writeIndex(store, [...index, ...added.map((event) => event.id)]);
			});
		}

		return {
			imported: added.length,
			skippedExisting: incoming.length - added.length,
			invalid: invalidCount,
			mode
		};
	} catch (error) {
		throw new Error(describeImportError(error));
	}
}
