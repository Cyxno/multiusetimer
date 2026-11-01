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

	if (!isRecord(raw)) return fail(`Ongeldig event${where}: geen object.`);

	const id = asString(raw.id)?.trim();
	if (!id || id.length > 128) {
		return fail(`Ongeldig event${where}: id ontbreekt of is te lang.`);
	}

	const title = asString(raw.title)?.trim();
	if (!title) return fail(`Ongeldig event${where}: titel ontbreekt.`);
	if (title.length > MAX_TITLE_LENGTH) {
		return fail(`Ongeldig event${where}: titel is langer dan ${MAX_TITLE_LENGTH} tekens.`);
	}

	const subtitleRaw = asString(raw.subtitle)?.trim();
	if (subtitleRaw && subtitleRaw.length > MAX_SUBTITLE_LENGTH) {
		return fail(`Ongeldig event${where}: subtitel is langer dan ${MAX_SUBTITLE_LENGTH} tekens.`);
	}

	const mode = normalizeMode(raw.mode);
	if (!mode) return fail(`Ongeldig event${where}: onbekende modus.`);

	if (!isValidIsoWithOffset(raw.targetDate)) {
		return fail(
			`Ongeldig event${where}: targetDate moet een ISO-datumtijd met expliciete offset zijn.`
		);
	}

	const units = normalizeUnits(raw.units ?? DEFAULT_UNITS);
	if (!units || units.length === 0) {
		return fail(`Ongeldig event${where}: geen geldige tijdseenheden.`);
	}

	if (typeof raw.showSeconds !== 'boolean') {
		return fail(`Ongeldig event${where}: showSeconds moet true of false zijn.`);
	}

	const order = raw.order;
	if (typeof order !== 'number' || !Number.isFinite(order) || order < 0) {
		return fail(`Ongeldig event${where}: ongeldige volgorde.`);
	}

	const createdAt = asString(raw.createdAt) && Number.isFinite(Date.parse(raw.createdAt as string))
		? (raw.createdAt as string)
		: null;
	if (!createdAt) return fail(`Ongeldig event${where}: ongeldig aanmaakmoment.`);

	const image = normalizeImage(raw.image);
	if (image === undefined && raw.image !== undefined && raw.image !== null && raw.image !== '') {
		return fail(`Ongeldig event${where}: niet-ondersteunde afbeelding.`);
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
	if (!title) errors.push('Vul een titel in.');
	else if (title.length > MAX_TITLE_LENGTH) {
		errors.push(`De titel mag maximaal ${MAX_TITLE_LENGTH} tekens bevatten.`);
	}

	const subtitle = (input.subtitle ?? '').trim() || undefined;
	if (subtitle && subtitle.length > MAX_SUBTITLE_LENGTH) {
		errors.push(`De subtitel mag maximaal ${MAX_SUBTITLE_LENGTH} tekens bevatten.`);
	}

	const mode = normalizeMode(input.mode);
	if (!mode) errors.push('Kies een geldige modus.');

	if (!isValidIsoWithOffset(input.targetDate)) {
		errors.push('Vul een geldige datum en tijd in.');
	}

	const units = normalizeUnits(input.units ?? []);
	if (!units || units.length === 0) {
		errors.push('Kies minimaal één tijdseenheid.');
	}

	if (typeof input.showSeconds !== 'boolean') {
		errors.push('Geef aan of seconden getoond moeten worden.');
	}

	const image = normalizeImage(input.image);
	if (image === undefined && input.image !== undefined && input.image !== null && input.image !== '') {
		errors.push('De afbeelding heeft een niet-ondersteund formaat.');
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

	if (!isRecord(raw)) return fail('Ongeldig bestand: de inhoud is geen JSON-object.');
	if (raw.app !== 'MultiUseTimer') {
		return fail('Ongeldig bestand: dit is geen MultiUseTimer-backup.');
	}

	const version = raw.version;
	if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
		return fail('Ongeldig bestand: onbekende versie.');
	}
	if (version > 1) {
		return fail(
			`Dit bestand is gemaakt met een nieuwere versie (exportformaat ${version}) en kan niet worden gelezen.`
		);
	}

	if (!Array.isArray(raw.events)) return fail('Ongeldig bestand: events ontbreken.');

	const events: TimerEvent[] = [];
	let invalidCount = 0;
	raw.events.forEach((entry, index) => {
		const parsed = parseEvent(entry, index);
		if (parsed.ok && parsed.value) events.push(parsed.value);
		else invalidCount += 1;
	});

	return { ok: true, value: { events, invalidCount, version }, errors: [] };
}
