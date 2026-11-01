import { browser } from '$app/environment';

/**
 * Één centrale klok voor het volledige dashboard.
 *
 * - Update de reactieve `now`-waarde ongeveer eenmaal per seconde.
 * - Alle timerkaarten baseren hun berekening op deze gedeelde waarde; er is
 *   geen interval per kaart.
 * - De waarde wordt ieder tick opnieuw uit `Date.now()` gehaald, zodat de
 *   tellers correct blijven na browser-throttling op achtergrondtabbladen.
 * - Bij terugkeer op een zichtbaar tabblad wordt direct ververst.
 */
class Clock {
	#now = $state<Date | null>(null);
	#interval: ReturnType<typeof setInterval> | undefined = undefined;
	#onVisibility = () => {
		if (!document.hidden) this.#now = new Date();
	};

	/** Actuele tijd, of `null` tot de klok gestart is (SSR/ eerste render). */
	get now(): Date | null {
		return this.#now;
	}

	start(): void {
		if (!browser || this.#interval !== undefined) return;
		this.#now = new Date();
		this.#interval = setInterval(() => {
			this.#now = new Date();
		}, 1000);
		document.addEventListener('visibilitychange', this.#onVisibility);
	}

	stop(): void {
		if (this.#interval === undefined) return;
		clearInterval(this.#interval);
		this.#interval = undefined;
		document.removeEventListener('visibilitychange', this.#onVisibility);
		this.#now = null;
	}
}

export const clock = new Clock();
