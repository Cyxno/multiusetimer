<script lang="ts">
	import { clock } from '$lib/stores/clock.svelte';
	import { computeDuration, buildDurationDisplay, resolveUnits } from '$lib/utils/duration';
	import { fireConfetti } from '$lib/utils/confetti';
	import DurationDisplay from '$lib/components/DurationDisplay.svelte';
	import type { TimerEvent } from '$lib/types';

	let {
		event,
		onEdit,
		onDelete,
		onMove
	}: {
		event: TimerEvent;
		onEdit: (event: TimerEvent) => void;
		onDelete: (event: TimerEvent) => void;
		onMove: (id: string, direction: 'up' | 'down') => void;
	} = $props();

	const DEFAULT_ACCENT = '#6c8cff';

	let menuOpen = $state(false);
	let menuElement: HTMLDivElement | undefined = $state();
	let imageFailed = $state(false);

	const accent = $derived(event.accentColor ?? DEFAULT_ACCENT);
	const effectiveUnits = $derived(resolveUnits(event.units, event.showSeconds));

	const duration = $derived(clock.now ? computeDuration(clock.now, event.targetDate, effectiveUnits) : null);
	const display = $derived(
		duration ? buildDurationDisplay(duration, effectiveUnits, event.showSeconds) : null
	);

	const isFuture = $derived(duration?.direction === 'future');
	const isNow = $derived(duration?.direction === 'now');

	const badgeText = $derived(
		event.mode === 'countup' ? 'Sinds' : isNow ? 'Nu' : isFuture ? 'Aftellen' : 'Voorbij'
	);
	const badgeKind = $derived(
		event.mode === 'countup' ? 'past' : isNow ? 'now' : isFuture ? 'future' : 'past'
	);

	const targetText = $derived.by(() => {
		try {
			return new Intl.DateTimeFormat('nl-NL', {
				dateStyle: 'long',
				timeStyle: 'short'
			}).format(new Date(event.targetDate));
		} catch {
			return event.targetDate;
		}
	});

	// Confetti één keer bij de overgang naar nul, niet iedere seconde opnieuw.
	let previousDirection: string | null = null;
	$effect(() => {
		const direction = duration?.direction ?? null;
		if (
			event.mode === 'countdown' &&
			previousDirection === 'future' &&
			direction !== null &&
			direction !== 'future'
		) {
			const rect = menuElement?.getBoundingClientRect();
			fireConfetti(rect ? rect.left + rect.width / 2 : undefined, rect ? rect.top : undefined);
		}
		previousDirection = direction;
	});

	function toggleMenu(): void {
		menuOpen = !menuOpen;
	}

	function closeMenu(): void {
		menuOpen = false;
	}

	$effect(() => {
		if (!menuOpen) return;
		const onPointerDown = (pointerEvent: PointerEvent) => {
			if (!menuElement?.contains(pointerEvent.target as Node)) closeMenu();
		};
		window.addEventListener('pointerdown', onPointerDown);
		return () => window.removeEventListener('pointerdown', onPointerDown);
	});

	const showImage = $derived(Boolean(event.image) && !imageFailed);
</script>

<article
	class="card"
	class:card--past={badgeKind === 'past' && event.mode === 'countdown'}
	style="--card-accent: {accent}"
	aria-label="{event.title}, {badgeText}, {display?.ariaLabel ?? ''}"
>
	{#if showImage && event.image}
		<div class="card__media" aria-hidden="true">
			<img
				src={event.image}
				alt=""
				loading="lazy"
				draggable="false"
				onerror={() => (imageFailed = true)}
			/>
			<div class="card__media-overlay"></div>
		</div>
	{/if}

	<header class="card__header">
		<div class="card__heading">
			<span class="card__badge card__badge--{badgeKind}">
				<span class="card__badge-dot" aria-hidden="true"></span>
				{badgeText}
			</span>
			<h2 class="card__title">{event.title}</h2>
			{#if event.subtitle}
				<p class="card__subtitle">{event.subtitle}</p>
			{/if}
		</div>

		<div class="card__menu" bind:this={menuElement}>
			<button
				type="button"
				class="card__menu-button"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				aria-label="Acties voor {event.title}"
				onclick={toggleMenu}
			>
				<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
					<circle cx="10" cy="4" r="1.7" fill="currentColor" />
					<circle cx="10" cy="10" r="1.7" fill="currentColor" />
					<circle cx="10" cy="16" r="1.7" fill="currentColor" />
				</svg>
			</button>
			{#if menuOpen}
				<div class="card__menu-list" role="menu" aria-label="Acties voor {event.title}">
					<button type="button" role="menuitem" onclick={() => { closeMenu(); onEdit(event); }}>
						Bewerken
					</button>
					<button
						type="button"
						role="menuitem"
						onclick={() => { closeMenu(); onMove(event.id, 'up'); }}
					>
						<span aria-hidden="true">↑</span> Omhoog verplaatsen
					</button>
					<button
						type="button"
						role="menuitem"
						onclick={() => { closeMenu(); onMove(event.id, 'down'); }}
					>
						<span aria-hidden="true">↓</span> Omlaag verplaatsen
					</button>
					<button
						type="button"
						role="menuitem"
						class="card__menu-danger"
						onclick={() => { closeMenu(); onDelete(event); }}
					>
						Verwijderen
					</button>
				</div>
			{/if}
		</div>
	</header>

	<div class="card__duration">
		<DurationDisplay {display} />
	</div>

	<footer class="card__footer">
		<span class="card__date">{event.mode === 'countup' ? 'Sinds' : 'Doel'}: {targetText}</span>
	</footer>
</article>

<style>
	.card {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		padding: var(--space-5);
		min-height: 13rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		background:
			linear-gradient(160deg, color-mix(in srgb, var(--card-accent) 9%, var(--surface)), var(--surface) 55%);
		box-shadow: var(--shadow-card);
		overflow: hidden;
		transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease;
	}

	.card::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 3px;
		background: linear-gradient(180deg, var(--card-accent), transparent 85%);
		opacity: 0.9;
	}

	.card:hover {
		transform: translateY(-3px);
		box-shadow: var(--shadow-card-hover);
		border-color: color-mix(in srgb, var(--card-accent) 45%, var(--border));
	}

	.card--past {
		opacity: 0.88;
	}

	.card__media {
		position: absolute;
		inset: 0;
		z-index: 0;
	}

	.card__media img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card__media-overlay {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(180deg, rgba(10, 13, 20, 0.82) 0%, rgba(10, 13, 20, 0.55) 45%, rgba(10, 13, 20, 0.88) 100%),
			linear-gradient(90deg, rgba(10, 13, 20, 0.9), rgba(10, 13, 20, 0.25));
	}

	.card__media + .card__header,
	.card__media ~ .card__duration,
	.card__media ~ .card__footer {
		position: relative;
		z-index: 1;
	}

	.card__header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.card__heading {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.card__badge {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		align-self: flex-start;
		padding: 0.18rem 0.6rem;
		border-radius: 999px;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--card-accent);
		background: color-mix(in srgb, var(--card-accent) 14%, transparent);
		border: 1px solid color-mix(in srgb, var(--card-accent) 30%, transparent);
	}

	.card__badge-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: currentColor;
	}

	.card__badge--future .card__badge-dot {
		animation: pulse 2.4s ease-in-out infinite;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	.card__title {
		font-size: 1.15rem;
		font-weight: 700;
		letter-spacing: -0.01em;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.card__subtitle {
		font-size: 0.9rem;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}

	.card__menu {
		position: relative;
		flex-shrink: 0;
	}

	.card__menu-button {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border: none;
		border-radius: var(--radius-sm);
		background: color-mix(in srgb, var(--bg) 45%, transparent);
		color: var(--text-muted);
		cursor: pointer;
	}

	.card__menu-button:hover,
	.card__menu-button[aria-expanded='true'] {
		background: var(--surface-3);
		color: var(--text);
	}

	.card__menu-list {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		z-index: 20;
		display: flex;
		flex-direction: column;
		min-width: 13rem;
		padding: 0.3rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		box-shadow: var(--shadow-modal);
		animation: fade-in 0.12s ease;
	}

	.card__menu-list button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.65rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text);
		font-size: 0.9rem;
		text-align: left;
		cursor: pointer;
		white-space: nowrap;
	}

	.card__menu-list button:hover {
		background: var(--surface-3);
	}

	.card__menu-danger {
		color: var(--danger) !important;
	}

	.card__menu-danger:hover {
		background: var(--danger-soft) !important;
	}

	.card__duration {
		flex: 1;
		display: flex;
		align-items: center;
	}

	.card__footer {
		font-size: 0.82rem;
		color: var(--text-muted);
	}

	.card__date {
		overflow-wrap: anywhere;
	}

	@media (max-width: 520px) {
		.card {
			padding: var(--space-4);
			min-height: 11rem;
		}

		.card__menu-list {
			min-width: 11rem;
		}
	}
</style>
