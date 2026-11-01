import { isValidIsoWithOffset } from '$lib/utils/date-time';
import { ALL_TIME_UNITS, DEFAULT_UNITS } from '$lib/types';
import type { EventInput, TimerEvent, TimeUnit, TimerMode } from '$lib/types';

/**
 * Validatie en normalisatie van timergegevens.
 *
 * Gegevens uit IndexedDB of een geïmporteerd JSON-bestand worden nooit
 * vertrouwd: elk veld wordt gecontroleerd en waar mogelijk genormaliseerd.
 * Ongeldige events worden geweigerd in plaats van stilzwijgend "gerepareerd",
 * zodat er geen half-afgebroken timers ontstaan.
 */

export const MAX_TITLE_LENGTH = 120;
export const MAX_SUBTITLE_LENGTH = 200;
export const MAX_IMAGE_LENGTH = 12_000_000; // ~9 MB base64

export type ValidationSuccess<T> = { ok: true; value: T; errors: [] };
export type ValidationFailure = { ok: false; value?: undefined; errors: string[] };
export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
	return typeof value === 'string' ? value : undefined;
}

/**
 * Normaliseert een accentkleur naar een veilige hex-waarde (#rgb, #rrggbb,
 * #rrggbbaa). Alledaagse CSS-injecties (url(), expressies, namen) worden
 * geweigerd; bij ongeldige invoer volgt `null` (geen accentkleur).
 */
export function normalizeAccentColor(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim().toLowerCase();
	if (!/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(trimmed)) return null;

	if (trimmed.length === 4 || trimmed.length === 5) {
		const r = trimmed[1];
		const g = trimmed[2];
		const b = trimmed[3];
		const a = trimmed.length === 5 ? trimmed[4] : '';
		return `#${r}${r}${g}${g}${b}${b}${a}${a}`;
	}
	return trimmed;
}

export function isDataImage(value: string): boolean {
	return /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value);
}

export function isHttpImage(value: string): boolean {
	if (value.length > 2048) return false;
	try {
		const url = new URL(value);
		return url.protocol === 'http:' || url.protocol === 'https:';
	} catch {
		return false;
	}
}

/** Valideert en normaliseert een afbeeldingswaarde (data-URL of http(s)-URL). */
export function normalizeImage(value: unknown): string | null | undefined {
	if (value === undefined) return undefined;
	if (value === null || value === '') return null;
	if (typeof value !== 'string' || value.length > MAX_IMAGE_LENGTH) return undefined;
	if (isDataImage(value) || isHttpImage(value)) return value;
	return undefined;
}

function normalizeUnits(value: unknown): TimeUnit[] | null {
	if (!Array.isArray(value)) return null;
	const units: TimeUnit[] = [];
	for (const entry of value) {
		if (typeof entry !== 'string' || !ALL_TIME_UNITS.includes(entry as TimeUnit)) return null;
		if (!units.includes(entry as TimeUnit)) units.push(entry as TimeUnit);
	}
	// Orden van groot naar klein zodat de presentatie-consistentie vastligt.
	return ALL_TIME_UNITS.filter((unit) => units.includes(unit));
}

function normalizeMode(value: unknown): TimerMode | null {
	return value === 'countdown' || value === 'countup' ? value : null;
}

export interface ParsedEvent {
	event: TimerEvent;
}

/**
 * Valideert een onbekend object als volledige TimerEvent. Retourneert een
 * genormaliseerd event bij succes, of de fouten bij mislukking.
 */
export function parseEvent(raw: unknown, position?: number): ValidationResult<TimerEvent> {
	const where = position !== undefined ? ` (positie ${position + 1})` : '';
	const fail = (...errors: string[]) => ({ ok: false as const, errors });

	if (!isRecord(raw)) return fail(`Invalid event${where}: not an object.`);

	const id = asString(raw.id)?.trim();
	if (!id || id.length > 128) {
		return fail(`Invalid event${where}: id is missing or too long.`);
	}

	const title = asString(raw.title)?.trim();
	if (!title) return fail(`Invalid event${where}: title is missing.`);
	if (title.length > MAX_TITLE_LENGTH) {
		return fail(`Invalid event${where}: title exceeds ${MAX_TITLE_LENGTH} characters.`);
	}

	const subtitleRaw = asString(raw.subtitle)?.trim();
	if (subtitleRaw && subtitleRaw.length > MAX_SUBTITLE_LENGTH) {
		return fail(`Invalid event${where}: subtitle exceeds ${MAX_SUBTITLE_LENGTH} characters.`);
	}

	const mode = normalizeMode(raw.mode);
	if (!mode) return fail(`Invalid event${where}: unknown mode.`);

	if (!isValidIsoWithOffset(raw.targetDate)) {
		return fail(
			`Invalid event${where}: targetDate must be an ISO date-time with an explicit offset.`
		);
	}

	const units = normalizeUnits(raw.units ?? DEFAULT_UNITS);
	if (!units || units.length === 0) {
		return fail(`Invalid event${where}: no valid time units.`);
	}

	if (typeof raw.showSeconds !== 'boolean') {
		return fail(`Invalid event${where}: showSeconds must be true or false.`);
	}

	const order = raw.order;
	if (typeof order !== 'number' || !Number.isFinite(order) || order < 0) {
		return fail(`Invalid event${where}: invalid order.`);
	}

	const createdAt = asString(raw.createdAt) && Number.isFinite(Date.parse(raw.createdAt as string))
		? (raw.createdAt as string)
		: null;
	if (!createdAt) return fail(`Invalid event${where}: invalid creation timestamp.`);

	const image = normalizeImage(raw.image);
	if (image === undefined && raw.image !== undefined && raw.image !== null && raw.image !== '') {
		return fail(`Invalid event${where}: unsupported image.`);
	}

	const accentColor = normalizeAccentColor(raw.accentColor);

	const event: TimerEvent = {
		id,
		title,
		...(subtitleRaw ? { subtitle: subtitleRaw } : {}),
		mode,
		targetDate: raw.targetDate as string,
		image: image ?? null,
		...(accentColor ? { accentColor } : {}),
		units,
		showSeconds: raw.showSeconds,
		order: Math.round(order),
		createdAt
	};

	return { ok: true, value: event, errors: [] };
}

/**
 * Valideert formulierinvoer voor het aanmaken of bewerken van een timer.
 */
export function validateEventInput(
	input: Partial<EventInput>
): ValidationResult<EventInput> {
	const errors: string[] = [];

	const title = (input.title ?? '').trim();
	if (!title) errors.push('Enter a title.');
	else if (title.length > MAX_TITLE_LENGTH) {
		errors.push(`The title may contain at most ${MAX_TITLE_LENGTH} characters.`);
	}

	const subtitle = (input.subtitle ?? '').trim() || undefined;
	if (subtitle && subtitle.length > MAX_SUBTITLE_LENGTH) {
		errors.push(`The subtitle may contain at most ${MAX_SUBTITLE_LENGTH} characters.`);
	}

	const mode = normalizeMode(input.mode);
	if (!mode) errors.push('Pick a valid mode.');

	if (!isValidIsoWithOffset(input.targetDate)) {
		errors.push('Enter a valid date and time.');
	}

	const units = normalizeUnits(input.units ?? []);
	if (!units || units.length === 0) {
		errors.push('Select at least one time unit.');
	}

	if (typeof input.showSeconds !== 'boolean') {
		errors.push('Indicate whether seconds should be shown.');
	}

	const image = normalizeImage(input.image);
	if (image === undefined && input.image !== undefined && input.image !== null && input.image !== '') {
		errors.push('The image format is not supported.');
	}

	const accentColor = normalizeAccentColor(input.accentColor);

	if (errors.length > 0) return { ok: false, errors };

	return {
		ok: true,
		errors: [],
		value: {
			title,
			...(subtitle ? { subtitle } : {}),
			mode: mode as TimerMode,
			targetDate: input.targetDate as string,
			image: image ?? null,
			...(accentColor ? { accentColor } : {}),
			units: units as TimeUnit[],
			showSeconds: input.showSeconds as boolean
		}
	};
}

/**
 * Valideert de structuur van een geïmporteerd backup-bestand en retourneert
 * alle geldige events plus het aantal ongeldige regels.
 */
export function validateImportPayload(
	raw: unknown
): ValidationResult<{ events: TimerEvent[]; invalidCount: number; version: number }> {
	const fail = (...errors: string[]) => ({ ok: false as const, errors });

	if (!isRecord(raw)) return fail('Invalid file: the content is not a JSON object.');
	if (raw.app !== 'MultiUseTimer') {
		return fail('Invalid file: this is not a MultiUseTimer backup.');
	}

	const version = raw.version;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return fail('Invalid file: unknown version.');
	}
	if (version > 1) {
		return fail(
			`This file was created with a newer version (export format ${version}) and cannot be read.`
		);
	}

	if (!Array.isArray(raw.events)) return fail('Invalid file: events are missing.');

	const events: TimerEvent[] = [];
	let invalidCount = 0;
	raw.events.forEach((entry, index) => {
		const parsed = parseEvent(entry, index);
		if (parsed.ok && parsed.value) events.push(parsed.value);
		else invalidCount += 1;
	});

	return { ok: true, value: { events, invalidCount, version }, errors: [] };
}
