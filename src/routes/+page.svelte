<script lang="ts">
	import { format } from 'date-fns';
	import { eventStore } from '$lib/stores/events.svelte';
	import { notify } from '$lib/stores/notify.svelte';
	import EventGrid from '$lib/components/EventGrid.svelte';
	import EventForm from '$lib/components/EventForm.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ImportDialog from '$lib/components/ImportDialog.svelte';
	import { describeStorageError } from '$lib/db/storage';
	import type { TimerEvent } from '$lib/types';

	let formOpen = $state(false);
	let editingEvent = $state<TimerEvent | null>(null);
	let deleteTarget = $state<TimerEvent | null>(null);
	let deleteBusy = $state(false);
	let importOpen = $state(false);
	let exportBusy = $state(false);
	let storageBannerDismissed = $state(false);

	// Herstelt opgeslagen timers bij het laden (client-side; de store negeert
	// herhaalde aanroepen zelf).
	$effect(() => {
		void eventStore.load();
	});

	const storageBannerVisible = $derived(
		Boolean(eventStore.storageError) && !storageBannerDismissed
	);

	function openNewTimer(): void {
		editingEvent = null;
		formOpen = true;
	}

	function openEditTimer(event: TimerEvent): void {
		editingEvent = event;
		formOpen = true;
	}

	function closeForm(): void {
		formOpen = false;
		editingEvent = null;
	}

	async function confirmDelete(): Promise<void> {
		if (!deleteTarget || deleteBusy) return;
		deleteBusy = true;
		const title = deleteTarget.title;
		try {
			await eventStore.remove(deleteTarget.id);
			notify.success(`"${title}" verwijderd.`);
		} catch (error) {
			notify.error(error instanceof Error ? error.message : 'Verwijderen is mislukt.');
		} finally {
			deleteBusy = false;
			deleteTarget = null;
		}
	}

	async function downloadExport(): Promise<void> {
		if (exportBusy) return;
		exportBusy = true;
		try {
			const payload = await eventStore.export();
			const json = JSON.stringify(payload, null, '\t');
			const blob = new Blob([json], { type: 'application/json' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `multiusetimer-backup-${format(new Date(), 'yyyy-MM-dd')}.json`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
			notify.success(`Backup gedownload (${payload.events.length} timer${payload.events.length === 1 ? '' : 's'}).`);
		} catch (error) {
			notify.error(`Export mislukt. ${describeStorageError(error)}`);
		} finally {
			exportBusy = false;
		}
	}
</script>

<div class="app">
	<header class="header">
		<div class="header__inner">
			<div class="brand">
				<span class="brand__mark" aria-hidden="true">
					<svg viewBox="0 0 24 24" width="22" height="22">
						<circle
							cx="12"
							cy="12"
							r="9"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
						<path
							d="M12 7.5V12l3 2"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
				<span class="brand__name">MultiUseTimer</span>
			</div>

			<div class="header__actions">
				<button
					type="button"
					class="btn btn--ghost btn--small header__action"
					onclick={() => (importOpen = true)}
				>
					<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
						<path
							d="M10 3v9m0 0l-3.5-3.5M10 12l3.5-3.5M4 16h12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Importeren
				</button>
				<button
					type="button"
					class="btn btn--ghost btn--small header__action"
					onclick={downloadExport}
					disabled={exportBusy}
				>
					<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
						<path
							d="M10 3v9m0 0L6.5 8.5M10 12l3.5-3.5M4 16h12"
							fill="none"
							stroke="currentColor"
							stroke-width="1.8"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{exportBusy ? 'Bezig…' : 'Exporteren'}
				</button>
				<button type="button" class="btn btn--primary btn--small" onclick={openNewTimer}>
					<svg viewBox="0 0 20 20" width="15" height="15" aria-hidden="true">
						<path
							d="M10 4v12M4 10h12"
							fill="none"
							stroke="currentColor"
							stroke-width="2.2"
							stroke-linecap="round"
						/>
					</svg>
					Nieuwe timer
				</button>
			</div>
		</div>
	</header>

	<main class="main">
		{#if storageBannerVisible}
			<div class="storage-banner" role="alert">
				<span>{eventStore.storageError}</span>
				<button
					type="button"
					class="storage-banner__close"
					aria-label="Melding sluiten"
					onclick={() => (storageBannerDismissed = true)}
				>
					×
				</button>
			</div>
		{/if}

		{#if eventStore.status === 'loading'}
			<div class="skeleton-grid" aria-hidden="true">
				{#each Array(3) as _, index (index)}
					<div class="skeleton-card"></div>
				{/each}
			</div>
		{:else if eventStore.status === 'error'}
			<div class="error-panel">
				<h1>Timers konden niet worden geladen</h1>
				<p>
					{eventStore.storageError ?? 'Er is een onbekende fout opgetreden bij het lezen van de browseropslag.'}
				</p>
				<button type="button" class="btn btn--primary" onclick={() => void eventStore.retryLoad()}>
					Opnieuw proberen
				</button>
			</div>
		{:else if eventStore.events.length === 0}
			<div class="empty">
				<div class="empty__art" aria-hidden="true">
					<svg viewBox="0 0 96 96" width="120" height="120">
						<circle cx="48" cy="50" r="34" fill="none" stroke="var(--border-strong)" stroke-width="3" stroke-dasharray="4 7" stroke-linecap="round" />
						<circle cx="48" cy="50" r="24" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" />
						<path d="M48 38v12l8.5 5.5" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
						<circle cx="78" cy="26" r="5" fill="var(--accent)" opacity="0.55" />
						<circle cx="20" cy="30" r="3.5" fill="var(--accent)" opacity="0.35" />
					</svg>
				</div>
				<h1>Nog geen timers</h1>
				<p>
					Maak een aftelling naar een vakantie, verjaardag of feestdag — of leg vast hoe lang
					geleden iets heeft plaatsgevonden. Alles blijft lokaal in je browser bewaard.
				</p>
				<button type="button" class="btn btn--primary" onclick={openNewTimer}>
					Timer toevoegen
				</button>
			</div>
		{:else}
			<EventGrid onEdit={openEditTimer} onDelete={(event) => (deleteTarget = event)} />
		{/if}
	</main>
</div>

<EventForm open={formOpen} event={editingEvent} onclose={closeForm} />

<ConfirmDialog
	open={deleteTarget !== null}
	title="Timer verwijderen"
	message={'Weet je zeker dat je "' + (deleteTarget?.title ?? '') + '" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.'}
	confirmLabel="Verwijderen"
	danger
	busy={deleteBusy}
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
/>

<ImportDialog open={importOpen} onclose={() => (importOpen = false)} />

<style>
	.app {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	.header {
		position: sticky;
		top: 0;
		z-index: 50;
		height: var(--header-height);
		display: flex;
		align-items: center;
		border-bottom: 1px solid var(--border);
		background: color-mix(in srgb, var(--bg) 78%, transparent);
		backdrop-filter: blur(14px);
	}

	.header__inner {
		width: min(var(--container), calc(100% - 2 * var(--space-5)));
		margin-inline: auto;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	.brand__mark {
		display: grid;
		place-items: center;
		width: 2.2rem;
		height: 2.2rem;
		border-radius: var(--radius-md);
		color: #0b0e17;
		background: linear-gradient(135deg, var(--accent), #5871e8);
		box-shadow: 0 6px 18px -6px rgba(108, 140, 255, 0.55);
	}

	.brand__name {
		font-weight: 800;
		font-size: 1.08rem;
		letter-spacing: -0.02em;
	}

	.header__actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.main {
		flex: 1;
		width: min(var(--container), calc(100% - 2 * var(--space-5)));
		margin-inline: auto;
		padding: var(--space-6) 0 var(--space-7);
	}

	.storage-banner {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
		padding: 0.8rem 1rem;
		border-radius: var(--radius-md);
		border: 1px solid rgba(248, 113, 113, 0.45);
		background: var(--danger-soft);
		color: var(--text);
		font-size: 0.92rem;
	}

	.storage-banner__close {
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.2rem;
	}

	/* Laadstatus */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(21rem, 100%), 1fr));
		gap: var(--space-5);
	}

	.skeleton-card {
		height: 13rem;
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		background: linear-gradient(100deg, var(--surface) 40%, var(--surface-2) 50%, var(--surface) 60%);
		background-size: 200% 100%;
		animation: shimmer 1.4s linear infinite;
	}

	@keyframes shimmer {
		to {
			background-position: -200% 0;
		}
	}

	.error-panel {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		text-align: center;
		padding: var(--space-7) var(--space-4);
		margin-top: var(--space-6);
		border-radius: var(--radius-lg);
		border: 1px solid var(--border);
		background: var(--surface);
	}

	.error-panel h1 {
		font-size: 1.3rem;
	}

	.error-panel p {
		color: var(--text-muted);
		max-width: 34rem;
	}

	/* Empty state */
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-4);
		text-align: center;
		padding: var(--space-7) var(--space-4);
		margin-top: var(--space-6);
		border-radius: var(--radius-xl);
		border: 1px dashed var(--border-strong);
		background: linear-gradient(180deg, rgba(108, 140, 255, 0.05), transparent 60%);
	}

	.empty__art {
		opacity: 0.95;
	}

	.empty h1 {
		font-size: 1.45rem;
		letter-spacing: -0.02em;
	}

	.empty p {
		color: var(--text-muted);
		max-width: 32rem;
		line-height: 1.65;
	}

	@media (max-width: 640px) {
		.header__action {
			display: none;
		}

		.main {
			padding-top: var(--space-5);
		}
	}
</style>
