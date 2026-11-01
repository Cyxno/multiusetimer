export type TimerMode = 'countdown' | 'countup';

export type TimeUnit =
	| 'months'
	| 'weeks'
	| 'days'
	| 'hours'
	| 'minutes'
	| 'seconds';

export const ALL_TIME_UNITS: readonly TimeUnit[] = [
	'months',
	'weeks',
	'days',
	'hours',
	'minutes',
	'seconds'
] as const;

export interface TimerEvent {
	id: string;
	title: string;
	subtitle?: string;
	mode: TimerMode;
	/** ISO 8601 met expliciete UTC-offset, bijv. "2027-04-01T09:00:00+02:00". */
	targetDate: string;
	image?: string | null;
	accentColor?: string;
	units: TimeUnit[];
	showSeconds: boolean;
	order: number;
	createdAt: string;
}

/** Velden die de gebruiker via het formulier invult (zonder door de app gegenereerde velden). */
export type EventInput = Pick<
	TimerEvent,
	| 'title'
	| 'subtitle'
	| 'mode'
	| 'targetDate'
	| 'image'
	| 'accentColor'
	| 'units'
	| 'showSeconds'
>;

export const DEFAULT_UNITS: readonly TimeUnit[] = ['days', 'hours', 'minutes'] as const;

/** Resultaat van een import-operatie. */
export interface ImportResult {
	imported: number;
	skippedExisting: number;
	invalid: number;
	mode: 'replace' | 'merge';
}

/** Versieerbaar exportformaat van een backup. */
export interface ExportPayload {
	app: string;
	version: number;
	exportedAt: string;
	events: TimerEvent[];
}
