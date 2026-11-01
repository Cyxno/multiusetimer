<script lang="ts">
	import type { DurationDisplayModel } from '$lib/utils/duration';

	/**
	 * Presentatie van een berekende duur.
	 *
	 * - Dag-niveaueenheden (maanden/weken/dagen) als grote blokken met label.
	 * - Met de eenheid "uren" verschijnt een compacte digitale klok
	 *   ("08:42:15"); zonder uren verschijnen kleinere eenheden als tekst
	 *   ("12 minuten, 34 seconden").
	 * - `tabular-nums` voorkomt dat getallen verspringen in breedte.
	 */
	let {
		display,
		size = 'large'
	}: {
		display: DurationDisplayModel | null;
		size?: 'large' | 'small';
	} = $props();
</script>

{#if display}
	<div
		class="duration duration--{size}"
		role="timer"
		class:duration--zero={display.allZero}
		aria-label={display.ariaLabel}
	>
		{#each display.blocks as block (block.unit)}
			<span class="duration__block">
				<span class="duration__value tabular">{block.text}</span>
				<span class="duration__label">{block.label}</span>
			</span>
		{/each}

		{#if display.clock}
			<span class="duration__clock tabular" aria-hidden="true">{display.clock}</span>
		{/if}

		{#if display.trailing.length > 0}
			<span class="duration__prose tabular" aria-hidden="true">
				{#each display.trailing as block, index (block.unit)}
					<span class="duration__prose-item">
						{#if index > 0}<span class="duration__prose-sep">, </span>{/if}
						<span class="duration__prose-value">{block.text}</span>
						<span class="duration__prose-label"> {block.label}</span>
					</span>
				{/each}
			</span>
		{/if}
	</div>
{:else}
	<span class="duration duration--placeholder tabular" role="timer" aria-label="Tijd wordt geladen">
		--&colon;--
	</span>
{/if}

<style>
	.duration {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 0.35rem 1.4rem;
		min-width: 0;
	}

	.duration__block {
		display: inline-flex;
		align-items: baseline;
		gap: 0.4rem;
		min-width: 0;
	}

	.duration__value {
		font-size: clamp(1.7rem, 4.2vw, 2.5rem);
		font-weight: 800;
		letter-spacing: -0.02em;
		color: var(--card-accent, var(--accent));
		text-shadow: 0 0 24px color-mix(in srgb, var(--card-accent, var(--accent)) 35%, transparent);
	}

	.duration__label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.duration__clock {
		font-size: clamp(1.7rem, 4.2vw, 2.5rem);
		font-weight: 800;
		letter-spacing: 0.02em;
		color: var(--card-accent, var(--accent));
		text-shadow: 0 0 24px color-mix(in srgb, var(--card-accent, var(--accent)) 35%, transparent);
	}

	.duration--zero .duration__value,
	.duration--zero .duration__clock {
		opacity: 0.55;
	}

	.duration__prose {
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--card-accent, var(--accent));
	}

	.duration__prose-label {
		color: var(--text-muted);
		font-weight: 500;
	}

	.duration__prose-sep {
		color: var(--text-faint);
	}

	/* Compacte variant (o.a. voor het formulier-voorbeeld) */
	.duration--small {
		gap: 0.3rem 0.9rem;
	}

	.duration--small .duration__value,
	.duration--small .duration__clock {
		font-size: 1.15rem;
		font-weight: 700;
		text-shadow: none;
	}

	.duration--small .duration__label,
	.duration--small .duration__prose-label {
		font-size: 0.75rem;
	}

	.duration--small .duration__prose {
		font-size: 0.9rem;
	}

	.duration--placeholder {
		font-size: clamp(1.7rem, 4.2vw, 2.5rem);
		font-weight: 800;
		color: var(--text-faint);
	}
</style>
