<script lang="ts">
	import { clock } from '$lib/stores/clock.svelte';
	import { eventStore } from '$lib/stores/events.svelte';
	import { notify } from '$lib/stores/notify.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import ImagePicker from '$lib/components/ImagePicker.svelte';
	import DurationDisplay from '$lib/components/DurationDisplay.svelte';
	import {
		localToIsoOffset,
		isoToWallParts,
		sameWallParts
	} from '$lib/utils/date-time';
	import { computeDuration, buildDurationDisplay, resolveUnits } from '$lib/utils/duration';
	import { ALL_TIME_UNITS, DEFAULT_UNITS } from '$lib/types';
	import type { EventInput, TimerEvent, TimerMode, TimeUnit } from '$lib/types';

	/**
	 * Eén formulier voor toevoegen en bewerken.
	 *
	 * Datumverwerking: bij bewerken wordt de opgeslagen wandklok (datum/tijd in
	 * de opgeslagen offset) precies zo in het formulier getoond. Wijzigt de
	 * gebruiker datum of tijd niet, dan blijft het oorspronkelijke tijdstip
	 * exact behouden — ook als het apparaat inmiddels in een andere tijdzone
	 * staat. Wijzigt de gebruiker wél iets, dan wordt de nieuwe lokale datum/
	 * tijd geïnterpreteerd in de huidige tijdzone van het apparaat (met de
	 * offset die op die datum geldt).
	 */
	let {
		open,
		event = null,
		onclose
	}: {
		open: boolean;
		event?: TimerEvent | null;
		onclose: () => void;
	} = $props();

	const ACCENT_PRESETS = [
		'#6c8cff',
		'#22d3ee',
		'#34d399',
		'#fbbf24',
		'#f472b6',
		'#a78bfa',
		'#f87171'
	];

	let title = $state('');
	let subtitle = $state('');
	let mode = $state<TimerMode>('countdown');
	let dateValue = $state('');
	let timeValue = $state('');
	let image = $state<string | null>(null);
	let accentColor = $state<string | null>(null);
	let selectedUnits = $state<TimeUnit[]>([...DEFAULT_UNITS]);
	let showSeconds = $state(true);
	let busy = $state(false);
	let attemptedSubmit = $state(false);
	let originalIso = $state<string | null>(null);

	let lastInitKey = '';
	$effect(() => {
		const key = `${open}:${event?.id ?? 'new'}`;
		if (key === lastInitKey) return;
		lastInitKey = key;
		if (!open) return;

		if (event) {
			const wall = isoToWallParts(event.targetDate);
			title = event.title;
			subtitle = event.subtitle ?? '';
			mode = event.mode;
			dateValue = wall?.date ?? '';
			timeValue = wall ? wall.time.slice(0, 5) : '';
			image = event.image ?? null;
			accentColor = event.accentColor ?? null;
			selectedUnits = [...event.units];
			showSeconds = event.showSeconds;
			originalIso = event.targetDate;
		} else {
			title = '';
			subtitle = '';
			mode = 'countdown';
			dateValue = '';
			timeValue = '';
			image = null;
			accentColor = null;
			selectedUnits = [...DEFAULT_UNITS];
			showSeconds = true;
			originalIso = null;
		}
		attemptedSubmit = false;
		busy = false;
	});

	// "Seconden tonen" is dé schakelaar voor de seconden-eenheid; de
	// eenhedenkeuze loopt van maanden t/m minuten.
	const UNIT_CHECKBOXES: TimeUnit[] = ['months', 'weeks', 'days', 'hours', 'minutes'];

	const effectiveUnits = $derived(resolveUnits(selectedUnits, showSeconds));

	/**
	 * Het ISO-moment dat opslaan zou worden: ongewijzigde wandklok → het
	 * originele moment; gewijzigd → nieuwe interpretatie in lokale tijd.
	 */
	const previewIso = $derived.by(() => {
		if (!dateValue || !timeValue) return null;
		if (originalIso && sameWallParts(originalIso, dateValue, timeValue)) return originalIso;
		return localToIsoOffset(dateValue, timeValue);
	});

	const previewOffset = $derived(previewIso ? isoToWallParts(previewIso)?.offset ?? null : null);

	const previewWallText = $derived.by(() => {
		if (!dateValue || !timeValue) return null;
		try {
			const time = timeValue.length === 5 ? `${timeValue}:00` : timeValue;
			return new Intl.DateTimeFormat('en-GB', {
				weekday: 'long',
				day: 'numeric',
				month: 'long',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit',
				timeZone: 'UTC'
			}).format(new Date(`${dateValue}T${time}Z`));
		} catch {
			return null;
		}
	});

	const previewDisplay = $derived.by(() => {
		if (!clock.now || !previewIso) return null;
		const duration = computeDuration(clock.now, previewIso, effectiveUnits);
		return duration ? buildDurationDisplay(duration, effectiveUnits, showSeconds) : null;
	});

	const titleError = $derived(
		attemptedSubmit && !title.trim() ? 'Enter a title.' : title.trim().length > 120 ? 'Maximum 120 characters.' : ''
	);
	const dateError = $derived(
		attemptedSubmit && (!dateValue || !timeValue)
			? 'Enter a valid date and time.'
			: attemptedSubmit && !previewIso
				? "This date and time don't exist; adjust the input."
				: ''
	);
	const unitsError = $derived(
		attemptedSubmit && selectedUnits.length === 0 ? 'Select at least one time unit.' : ''
	);

	function toggleUnit(unit: TimeUnit): void {
		if (selectedUnits.includes(unit)) {
			selectedUnits = selectedUnits.filter((entry) => entry !== unit);
		} else {
			// Bewaar de volgorde van groot naar klein.
			selectedUnits = ALL_TIME_UNITS.filter(
				(entry) => entry === unit || selectedUnits.includes(entry)
			);
		}
	}

	async function handleSubmit(submitEvent: SubmitEvent): Promise<void> {
		submitEvent.preventDefault();
		attemptedSubmit = true;
		if (busy || titleError || dateError || unitsError || !previewIso) return;

		busy = true;
		const input: EventInput = {
			title: title.trim(),
			...(subtitle.trim() ? { subtitle: subtitle.trim() } : {}),
			mode,
			targetDate: previewIso,
			image,
			...(accentColor ? { accentColor } : {}),
			units: [...selectedUnits],
			showSeconds
		};

		try {
			if (event) {
				await eventStore.update(event.id, input);
				notify.success('Timer updated.');
			} else {
				await eventStore.add(input);
				notify.success('Timer added.');
			}
			onclose();
		} catch (error) {
			notify.error(error instanceof Error ? error.message : 'Saving failed.');
		} finally {
			busy = false;
		}
	}
</script>

<Modal {open} title={event ? 'Edit timer' : 'New timer'} {onclose}>
	<form class="form" id="event-form" onsubmit={handleSubmit} novalidate>
		<div class="form__grid">
			<div class="field form__span">
				<label class="field__label" for="event-title">
					Title <span class="field__required" aria-hidden="true">*</span>
				</label>
				<input
					id="event-title"
					class="input"
					class:input--error={Boolean(titleError)}
					type="text"
					maxlength="120"
					bind:value={title}
					aria-invalid={titleError ? 'true' : undefined}
					aria-describedby={titleError ? 'event-title-error' : undefined}
					placeholder="e.g. Holiday in Portugal"
				/>
				{#if titleError}
					<p class="field__error" id="event-title-error">{titleError}</p>
				{/if}
			</div>

			<div class="field form__span">
				<label class="field__label" for="event-subtitle">Subtitle <span class="field__hint-inline">(optional)</span></label>
				<input
					id="event-subtitle"
					class="input"
					type="text"
					maxlength="200"
					bind:value={subtitle}
					placeholder="e.g. The whole family"
				/>
			</div>

			<fieldset class="field form__span form__fieldset">
				<legend class="field__label">Mode</legend>
				<div class="form__modes">
					<label class="form__mode" class:form__mode--active={mode === 'countdown'}>
						<input type="radio" name="mode" value="countdown" bind:group={mode} />
						<span>Countdown</span>
						<small>to a future moment</small>
					</label>
					<label class="form__mode" class:form__mode--active={mode === 'countup'}>
						<input type="radio" name="mode" value="countup" bind:group={mode} />
						<span>Count-up</span>
						<small>since a past moment</small>
					</label>
				</div>
			</fieldset>

			<div class="field">
				<label class="field__label" for="event-date">
					Date <span class="field__required" aria-hidden="true">*</span>
				</label>
				<input
					id="event-date"
					class="input"
					class:input--error={Boolean(dateError)}
					type="date"
					bind:value={dateValue}
					aria-invalid={dateError ? 'true' : undefined}
					aria-describedby={dateError ? 'event-date-error' : 'event-date-preview'}
				/>
			</div>

			<div class="field">
				<label class="field__label" for="event-time">
					Time <span class="field__required" aria-hidden="true">*</span>
				</label>
				<input
					id="event-time"
					class="input"
					class:input--error={Boolean(dateError)}
					type="time"
					bind:value={timeValue}
					aria-invalid={dateError ? 'true' : undefined}
					aria-describedby={dateError ? 'event-date-error' : 'event-date-preview'}
				/>
			</div>

			<div class="field form__span" id="event-date-preview" aria-live="polite">
				{#if previewWallText}
					<p class="form__preview-text">
						{previewWallText}
						{#if previewOffset}
							<span class="form__preview-offset">({previewOffset === '+00:00' ? 'UTC+00:00' : `UTC${previewOffset}`})</span>
						{/if}
					</p>
				{:else}
					<p class="field__hint">Pick a date and time; input is interpreted as local time.</p>
				{/if}
				{#if previewDisplay}
					<div class="form__preview-duration">
						<DurationDisplay display={previewDisplay} size="small" />
					</div>
				{/if}
				{#if dateError}
					<p class="field__error" id="event-date-error">{dateError}</p>
				{/if}
			</div>

			<div class="field form__span">
				<span class="field__label" id="units-label">Time units</span>
				<div class="form__units" role="group" aria-labelledby="units-label">
					{#each UNIT_CHECKBOXES as unit (unit)}
						<label class="form__unit" class:form__unit--active={selectedUnits.includes(unit)}>
							<input
								type="checkbox"
								checked={selectedUnits.includes(unit)}
								onchange={() => toggleUnit(unit)}
							/>
							{unit === 'months'
								? 'Months'
								: unit === 'weeks'
									? 'Weeks'
									: unit === 'days'
										? 'Days'
										: unit === 'hours'
											? 'Hours'
											: unit === 'minutes'
												? 'Minutes'
												: 'Seconds'}
						</label>
					{/each}
				</div>
				{#if unitsError}
					<p class="field__error">{unitsError}</p>
				{:else}
					<p class="field__hint">
						Units you leave out roll up into the smallest selected unit.
					</p>
				{/if}
			</div>

			<div class="field form__span">
				<span class="switch">
					<input type="checkbox" id="event-show-seconds" bind:checked={showSeconds} />
					<span class="switch__track" aria-hidden="true"></span>
					<span class="switch__text">Show seconds</span>
				</span>
			</div>

			<div class="field form__span">
				<span class="field__label" id="accent-label">Accent color</span>
				<div class="form__colors" role="group" aria-labelledby="accent-label">
					<button
						type="button"
						class="form__color form__color--none"
						class:form__color--active={accentColor === null}
						aria-label="No accent color"
						aria-pressed={accentColor === null}
						onclick={() => (accentColor = null)}
					>
						—
					</button>
					{#each ACCENT_PRESETS as preset (preset)}
						<button
							type="button"
							class="form__color"
							class:form__color--active={accentColor?.toLowerCase() === preset}
							style="background: {preset}"
							aria-label="Accent color {preset}"
							aria-pressed={accentColor?.toLowerCase() === preset}
							onclick={() => (accentColor = preset)}
						></button>
					{/each}
					<label
						class="form__color form__color--custom"
						style="background: {accentColor ?? 'var(--surface-3)'}"
						title="Pick a custom color"
					>
						<input
							type="color"
							aria-label="Pick a custom accent color"
							value={accentColor ?? '#6c8cff'}
							oninput={(event) => (accentColor = event.currentTarget.value)}
						/>
					</label>
				</div>
			</div>

			<div class="field form__span">
				<span class="field__label">Image <span class="field__hint-inline">(optional)</span></span>
				<ImagePicker value={image} onchange={(next) => (image = next)} />
			</div>
		</div>

		<!-- Verzenden via de modaalvoettekst hieronder -->
		<button type="submit" class="visually-hidden" tabindex="-1">Save</button>
	</form>

	{#snippet footer()}
		<button type="button" class="btn" onclick={onclose} disabled={busy}>Cancel</button>
		<button type="submit" form="event-form" class="btn btn--primary" disabled={busy}>
			{busy ? 'Saving…' : event ? 'Save changes' : 'Add timer'}
		</button>
	{/snippet}
</Modal>

<style>
	.form__grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4) var(--space-4);
	}

	.form__span {
		grid-column: 1 / -1;
	}

	.form__fieldset {
		border: none;
		padding: 0;
		margin: 0;
	}

	.form__modes {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-3);
	}

	.form__mode {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.65rem 0.9rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: var(--bg-soft);
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.form__mode input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.form__mode span {
		font-weight: 700;
		font-size: 0.95rem;
	}

	.form__mode small {
		color: var(--text-faint);
		font-size: 0.78rem;
	}

	.form__mode--active {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.form__mode:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.form__preview-text {
		font-size: 0.92rem;
		color: var(--text);
		font-weight: 600;
	}

	.form__preview-offset {
		color: var(--text-faint);
		font-weight: 500;
		font-size: 0.85rem;
	}

	.form__preview-duration {
		margin-top: 0.5rem;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--bg-soft);
		border: 1px solid var(--border);
	}

	.form__units {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.form__unit {
		display: inline-flex;
		align-items: center;
		padding: 0.4rem 0.8rem;
		border-radius: 999px;
		border: 1px solid var(--border-strong);
		background: var(--bg-soft);
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
		transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
	}

	.form__unit input {
		position: absolute;
		opacity: 0;
		width: 1px;
		height: 1px;
	}

	.form__unit--active {
		border-color: var(--accent);
		background: var(--accent-soft);
		color: var(--text);
	}

	.form__unit:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.form__colors {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.form__color {
		width: 2rem;
		height: 2rem;
		border-radius: 50%;
		border: 2px solid transparent;
		cursor: pointer;
		display: grid;
		place-items: center;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 700;
		transition: transform 0.12s ease, border-color 0.12s ease;
	}

	.form__color:hover {
		transform: scale(1.08);
	}

	.form__color--active {
		border-color: var(--text);
		box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--border-strong);
	}

	.form__color--none {
		background: var(--surface-2);
		border-color: var(--border-strong);
	}

	.form__color--custom {
		position: relative;
		overflow: hidden;
		background: conic-gradient(red, yellow, lime, cyan, blue, magenta, red);
	}

	.form__color--custom input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}

	.field__hint-inline {
		color: var(--text-faint);
		font-weight: 400;
		font-size: 0.8rem;
	}

	@media (max-width: 560px) {
		.form__grid {
			grid-template-columns: 1fr;
		}

		.form__modes {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
