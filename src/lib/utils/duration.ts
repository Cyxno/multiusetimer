import { addDays, addMonths, differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';
import { isValidIsoWithOffset } from '$lib/utils/date-time';
import type { TimeUnit } from '$lib/types';

/**
 * Berekening van resterende (countdown) of verstreken (count-up) tijd.
 *
 * Deze module is volledig onafhankelijk van de UI. De semantiek:
 *
 * - **Maanden** zijn kalendergebaseerd. Alleen wanneer maanden geselecteerd
 *   zijn, wordt het startpunt "verankerd" op volledige kalendermaanden
 *   (`addMonths`, dag van de maand wordt geklemd: 31 jan + 1 maand = 28 feb).
 * - **Weken en dagen** zijn kalendergebaseerd: vanaf het anker tellen we
 *   kalenderdagen. "1 dag" betekent daardoor hetzelfde lokale klokmoment de
 *   volgende dag, ook over een zomer-/wintertijdovergang (die dag duurt dan
 *   23 of 25 echte uren). Weken = 7 kalenderdagen.
 * - **Uren, minuten en seconden** zijn gebaseerd op het resterende
 *   tijdsverschil in milliseconden na het anker van de grotere eenheden.
 *
 * Eenheden die niet geselecteerd zijn "verliezen" geen tijd: hun restant
 * loopt door in de volgende kleinere geselecteerde eenheid. Voorbeelden:
 * maanden + uren geselecteerd → de dagen na de volledige maanden verschijnen
 * als totaal aantal uren; alleen seconden → het totaal aantal seconden.
 *
 * De teller berekent ieder moment opnieuw vanaf de actuele tijd (centrale
 * klok); er wordt nooit een seconde bijgeteld.
 */

export interface DurationResult {
	months: number;
	weeks: number;
	days: number;
	hours: number;
	minutes: number;
	seconds: number;
	direction: 'past' | 'future' | 'now';
}

export interface DurationBlock {
	unit: TimeUnit;
	label: string;
	text: string;
}

export interface DurationDisplayModel {
	/** Blokken voor dag-niveaueenheden (maanden/weken/dagen). */
	blocks: DurationBlock[];
	/** Digitale klok "HH:MM" of "HH:MM:SS" wanneer uren geselecteerd zijn. */
	clock: string | null;
	/** Prose-restant (bijv. minuten/seconden) wanneer uren níet geselecteerd zijn. */
	trailing: DurationBlock[];
	/** Toegankelijke omschrijving, bijv. "5 maanden, 3 dagen". */
	ariaLabel: string;
	/** Alle getoonde waarden zijn nul (nulstatus). */
	allZero: boolean;
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;

const UNIT_ORDER: readonly TimeUnit[] = ['months', 'weeks', 'days', 'hours', 'minutes', 'seconds'];

const UNIT_LABELS: Record<TimeUnit, [singular: string, plural: string]> = {
	months: ['month', 'months'],
	weeks: ['week', 'weeks'],
	days: ['day', 'days'],
	hours: ['hour', 'hours'],
	minutes: ['minute', 'minutes'],
	seconds: ['second', 'seconds']
};

export function unitLabel(unit: TimeUnit, value: number): string {
	const [singular, plural] = UNIT_LABELS[unit];
	return value === 1 ? singular : plural;
}

/**
 * Bepaalt de effectieve eenheden op basis van de geselecteerde eenheden en
 * de schakelaar "seconden tonen": met `showSeconds` hoort de eenheid
 * "seconden" (anders blijft de digitale klok stilstaan op :00), zonder
 * worden seconden volledig weggelaten.
 */
export function resolveUnits(units: readonly TimeUnit[], showSeconds: boolean): TimeUnit[] {
	const base = UNIT_ORDER.filter((unit) => unit !== 'seconds' && units.includes(unit));
	return showSeconds ? [...base, 'seconds'] : base;
}

/**
 * Bereken de duur tussen `now` en `targetDate` (ISO 8601 met offset),
 * uitgesplitst naar de geselecteerde eenheden. Niet-geselecteerde eenheden
 * zijn 0; hun restant is in kleinere geselecteerde eenheden verrekend.
 * Retourneert `null` bij een ongeldige `targetDate`.
 */
export function computeDuration(
	now: Date,
	targetDate: string,
	units: readonly TimeUnit[]
): DurationResult | null {
	// Alleen ondubbelzinnige tijdstippen (met expliciete offset) zijn geldig.
	if (!isValidIsoWithOffset(targetDate)) return null;
	const target = new Date(targetDate);
	if (Number.isNaN(target.getTime())) return null;

	const diffMs = target.getTime() - now.getTime();
	if (diffMs === 0) {
		return { months: 0, weeks: 0, days: 0, hours: 0, minutes: 0, seconds: 0, direction: 'now' };
	}

	const future = diffMs > 0;
	const direction: DurationResult['direction'] = future ? 'future' : 'past';
	// Reken altijd van eerder naar later; richting zit in `direction`.
	const start = future ? now : target;
	const end = future ? target : now;

	const has = (unit: TimeUnit) => units.includes(unit);
	const result: DurationResult = {
		months: 0,
		weeks: 0,
		days: 0,
		hours: 0,
		minutes: 0,
		seconds: 0,
		direction
	};

	let cursor = start;

	// 1. Volledige kalendermaanden (alleen ankeren als maanden getoond worden).
	if (has('months')) {
		let months = Math.max(0, differenceInCalendarMonths(end, start));
		if (months > 0 && addMonths(start, months).getTime() > end.getTime()) {
			months -= 1;
		}
		result.months = months;
		if (months > 0) cursor = addMonths(start, months);
	}

	// 2. Kalenderdagen tussen anker en einde → weken en/of dagen.
	let remainingMs = end.getTime() - cursor.getTime();
	if (remainingMs < 0) remainingMs = 0;

	if (has('weeks') || has('days')) {
		let calDays = Math.max(0, differenceInCalendarDays(end, cursor));
		// Voorkom een negatief restant als de kloktijd van het anker ná die van
		// het einde ligt (bijv. anker 23:30 → einde 00:30 de volgende dag).
		while (calDays > 0 && addDays(cursor, calDays).getTime() > end.getTime()) {
			calDays -= 1;
		}

		if (has('weeks')) {
			const weeks = Math.floor(calDays / 7);
			result.weeks = weeks;
			calDays -= weeks * 7;
			cursor = addDays(cursor, weeks * 7);
			remainingMs = end.getTime() - cursor.getTime();
		}
		if (has('days')) {
			result.days = calDays;
			cursor = addDays(cursor, calDays);
			remainingMs = end.getTime() - cursor.getTime();
		}
		if (remainingMs < 0) remainingMs = 0;
	}

	// 3. Restant in uren, minuten en seconden (echt tijdsverschil).
	if (has('hours')) {
		result.hours = Math.floor(remainingMs / MS_PER_HOUR);
		remainingMs -= result.hours * MS_PER_HOUR;
	}
	if (has('minutes')) {
		result.minutes = Math.floor(remainingMs / MS_PER_MINUTE);
		remainingMs -= result.minutes * MS_PER_MINUTE;
	}
	if (has('seconds')) {
		result.seconds = Math.floor(remainingMs / 1000);
	}

	return result;
}

/** Hoeveelheid milliseconden die nog zichtbaar is in de kleinste eenheid. */
function isDayLevel(unit: TimeUnit): boolean {
	return unit === 'months' || unit === 'weeks' || unit === 'days';
}

/**
 * Zet een DurationResult om naar een presentatiemodel.
 *
 * Regels:
 * - Alleen geselecteerde eenheden worden getoond, van groot naar klein.
 * - Nulwaarden worden onderdrukt; als álle waarden nul zijn blijft de kleinste
 *   geselecteerde eenheid zichtbaar ("0 dagen", "0 seconden", "00:00:00"),
 *   zodat de nulstatus duidelijk is.
 * - Met de eenheid "uren" worden uren/minuten(/seconden) als compacte
 *   digitale klok getoond ("4 dagen, 08:42:15"); zonder de eenheid uren
 *   verschijnen kleinere eenheden als tekst ("12 minuten, 34 seconden").
 * - `showSeconds` bepaalt of seconden überhaupt meedoen.
 */
export function buildDurationDisplay(
	result: DurationResult,
	units: readonly TimeUnit[],
	showSeconds: boolean
): DurationDisplayModel {
	const effective: TimeUnit[] = resolveUnits(units, showSeconds);

	const valueOf = (unit: TimeUnit): number => result[unit];

	// Toon eenheden met een waarde groter dan nul; onderdruk nulwaarden.
	const shown = effective.filter((unit) => valueOf(unit) > 0);
	if (shown.length === 0 && effective.length > 0) {
		shown.push(effective[effective.length - 1]);
	}

	const blocks: DurationBlock[] = [];
	const trailing: DurationBlock[] = [];
	let clock: string | null = null;

	const showDigitalClock = effective.includes('hours');

	if (showDigitalClock) {
		for (const unit of shown) {
			if (isDayLevel(unit)) {
				const value = valueOf(unit);
				blocks.push({ unit, label: unitLabel(unit, value), text: String(value) });
			}
		}
		const clockNonZero = result.hours > 0 || result.minutes > 0 || result.seconds > 0;
		if (clockNonZero || blocks.length === 0) {
			const h = String(result.hours).padStart(2, '0');
			const m = String(result.minutes).padStart(2, '0');
			const s = String(result.seconds).padStart(2, '0');
			clock = showSeconds ? `${h}:${m}:${s}` : `${h}:${m}`;
		}
	} else {
		for (const unit of shown) {
			const value = valueOf(unit);
			const entry: DurationBlock = { unit, label: unitLabel(unit, value), text: String(value) };
			if (isDayLevel(unit)) blocks.push(entry);
			else trailing.push(entry);
		}
	}

	const ariaLabel = shown
		.map((unit) => `${valueOf(unit)} ${unitLabel(unit, valueOf(unit))}`)
		.join(', ');

	return {
		blocks,
		clock,
		trailing,
		ariaLabel: ariaLabel || '0',
		allZero: shown.every((unit) => valueOf(unit) === 0)
	};
}
