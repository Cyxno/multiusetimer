/**
 * Tijdzonebewuste datum- en tijdconversies.
 *
 * `targetDate` wordt opgeslagen als ISO 8601-string met expliciete UTC-offset
 * (bijv. `2027-04-01T09:00:00+02:00`). Daarmee is elk opgeslagen moment
 * ondubbelzinnig, onafhankelijk van de tijdzone van het apparaat dat het later
 * uitleest.
 *
 * Bij het invoeren van een datum/tijd in het formulier interpreteren we de
 * invoer als lokale kalenderdatum + kloktijd en berekenen we de offset die
 * voor díe datum in de tijdzone van het apparaat geldt (zomer- of wintertijd).
 * We gebruiken nooit simpelweg `new Date().toISOString()` (die naar UTC
 * converteert) en ook nooit een hardcoded offset.
 */

const OFFSET_RE = /^[+-]\d{2}:\d{2}$/;
const ISO_WITH_OFFSET_RE =
	/^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|z|[+-]\d{2}:\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

export function systemTimeZone(): string {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
	} catch {
		return 'UTC';
	}
}

/**
 * Offset in minuten tussen de opgegeven tijdzone en UTC op het moment van
 * `instant` (positief = oostelijk, bijv. +60 voor winter- en +120 voor
 * zomertijd in Nederland).
 */
export function getTimeZoneOffsetMinutes(instant: Date, timeZone: string = systemTimeZone()): number {
	let dtf: Intl.DateTimeFormat;
	try {
		dtf = new Intl.DateTimeFormat('en-US', {
			timeZone,
			hourCycle: 'h23',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	} catch {
		return 0;
	}

	const parts = dtf.formatToParts(instant);
	const value = (type: Intl.DateTimeFormatPartTypes): number => {
		const part = parts.find((p) => p.type === type);
		return part ? Number(part.value) : 0;
	};

	const year = value('year');
	const month = value('month');
	const day = value('day');
	const hour = value('hour') % 24; // sommige omgevingen leveren "24" om middernacht
	const minute = value('minute');
	const second = value('second');

	const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
	return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Formatteert een offset in minuten als "+02:00" (nooit "Z", altijd expliciet). */
export function formatOffset(minutes: number): string {
	const sign = minutes < 0 ? '-' : '+';
	const abs = Math.abs(Math.round(minutes));
	const h = String(Math.floor(abs / 60)).padStart(2, '0');
	const m = String(abs % 60).padStart(2, '0');
	return `${sign}${h}:${m}`;
}

function parseDatePart(value: string): { y: number; mo: number; d: number } | null {
	const match = DATE_RE.exec(value);
	if (!match) return null;
	const y = Number(match[1]);
	const mo = Number(match[2]);
	const d = Number(match[3]);
	if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
	// Echte kalenderdatum controleren (vangt bijv. 30 februari af).
	const probe = new Date(Date.UTC(y, mo - 1, d));
	if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
		return null;
	}
	return { y, mo, d };
}

function parseTimePart(value: string): { h: number; mi: number; s: number } | null {
	const match = TIME_RE.exec(value);
	if (!match) return null;
	const h = Number(match[1]);
	const mi = Number(match[2]);
	const s = match[3] !== undefined ? Number(match[3]) : 0;
	if (h > 23 || mi > 59 || s > 59) return null;
	return { h, mi, s };
}

/**
 * Zet een lokale kalenderdatum (`2027-04-01`) en kloktijd (`09:00`) om naar
 * een ISO-string met de offset die in `timeZone` op dat moment geldt.
 *
 * Retourneert `null` bij ongeldige invoer. Tijden die niet bestaan vanwege
 * een overgang naar zomertijd krijgen de vóór de overgang geldende offset;
 * dubbele tijden bij een overgang naar wintertijd krijgen de ná de overgang
 * geldende offset. In beide gevallen is het resultaat een ondubbelzinnig,
 * stabiel tijdstip.
 */
export function localToIsoOffset(
	date: string,
	time: string,
	timeZone: string = systemTimeZone()
): string | null {
	const d = parseDatePart(date);
	const t = parseTimePart(time);
	if (!d || !t) return null;

	const guess = Date.UTC(d.y, d.mo - 1, d.d, t.h, t.mi, t.s);

	// Zoek een stabiele offset: de offset geldig op het geschatte moment,
	// daarna (indien nodig) de offset geldig op het gecorrigeerde moment.
	let offset = getTimeZoneOffsetMinutes(new Date(guess), timeZone);
	for (let i = 0; i < 3; i++) {
		const next = getTimeZoneOffsetMinutes(new Date(guess - offset * 60_000), timeZone);
		if (next === offset) break;
		offset = next;
	}

	const seconds = `:${String(t.s).padStart(2, '0')}`;
	return `${date}T${time}${seconds}${formatOffset(offset)}`;
}

export interface IsoWallParts {
	/** Kalenderdatum zoals opgeslagen, bijv. "2027-04-01". */
	date: string;
	/** Kloktijd "HH:mm" (of "HH:mm:ss"), in de opgeslagen offset. */
	time: string;
	/** Offset in minuten, bijv. 120 voor "+02:00". */
	offsetMinutes: number;
	/** Offset-string, bijv. "+02:00". */
	offset: string;
	/** Tijd in seconden op de UTC-tijdlijn (NaN bij ongeldige invoer). */
	timestamp: number;
}

/**
 * Leest de "wandklok"-onderdelen (datum en kloktijd in de opgeslagen offset)
 * rechtstreeks uit de ISO-string. Zo kan het bewerkingsformulier exact laten
 * zien wat de gebruiker oorspronkelijk koos, óók als het apparaat inmiddels
 * in een andere tijdzone staat.
 */
export function isoToWallParts(iso: string): IsoWallParts | null {
	if (typeof iso !== 'string') return null;
	const match = ISO_WITH_OFFSET_RE.exec(iso.trim());
	if (!match) return null;

	const [, y, mo, d, h, mi, s, offsetRaw] = match;
	const offsetMinutes =
		offsetRaw.toUpperCase() === 'Z'
			? 0
			: Number(offsetRaw.slice(1, 3)) * 60 + Number(offsetRaw.slice(4, 6)) * (offsetRaw[0] === '-' ? -1 : 1);

	const date = `${y}-${mo}-${d}`;
	const time = s !== undefined ? `${h}:${mi}:${s}` : `${h}:${mi}`;
	const timestamp = Date.parse(`${date}T${h}:${mi}:${s ?? '00'}${offsetRaw}`);
	return {
		date,
		time,
		offsetMinutes,
		offset: offsetRaw.toUpperCase(),
		timestamp
	};
}

/** Of de string een geldige ISO-datumtijd met expliciete offset (of Z) is. */
export function isValidIsoWithOffset(value: unknown): value is string {
	if (typeof value !== 'string') return false;
	const parts = isoToWallParts(value);
	if (!parts || !Number.isFinite(parts.timestamp)) return false;
	// Onderliggende kalenderdatum opnieuw valideren (vangt bijv. 31 februari af).
	return parseDatePart(parts.date) !== null;
}

/**
 * Vergelijkt of de opgeslagen ISO-string dezelfde kalenderdatum en kloktijd
 * (op minuutniveau, de precisie van het formulier) bevat als de
 * formulierwaarden, in de opgeslagen offset. Gebruikt om bij bewerken te
 * detecteren dat de gebruiker de datum/tijd níet heeft gewijzigd, zodat het
 * originele tijdstip — inclusief eventuele seconden — exact behouden blijft.
 */
export function sameWallParts(iso: string, date: string, time: string): boolean {
	const parts = isoToWallParts(iso);
	if (!parts) return false;
	return parts.date === date && parts.time.slice(0, 5) === time.slice(0, 5);
}
