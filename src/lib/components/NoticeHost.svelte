<script lang="ts">
	import { notify } from '$lib/stores/notify.svelte';

	/** Kortstondige status- en foutmeldingen, onderin het scherm. */
</script>

<div class="notices" aria-live="polite" aria-label="Meldingen">
	{#each notify.list as notice (notice.id)}
		<div class="notice notice--{notice.kind}" role="status">
			<p class="notice__message">{notice.message}</p>
			<button
				type="button"
				class="notice__close"
				aria-label="Melding sluiten"
				onclick={() => notify.dismiss(notice.id)}
			>
				<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true">
					<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				</svg>
			</button>
		</div>
	{/each}
</div>

<style>
	.notices {
		position: fixed;
		bottom: var(--space-4);
		left: 50%;
		transform: translateX(-50%);
		z-index: 200;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: min(30rem, calc(100vw - 2rem));
		pointer-events: none;
	}

	.notice {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		padding: 0.7rem 0.9rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		background: var(--surface-2);
		box-shadow: var(--shadow-modal);
		font-size: 0.9rem;
		animation: pop-in 0.18s ease;
		pointer-events: auto;
	}

	.notice--success {
		border-color: rgba(52, 211, 153, 0.45);
	}

	.notice--error {
		border-color: rgba(248, 113, 113, 0.5);
	}

	.notice__message {
		min-width: 0;
		overflow-wrap: anywhere;
	}

	.notice__close {
		flex-shrink: 0;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.notice__close:hover {
		background: var(--surface-3);
		color: var(--text);
	}
</style>
