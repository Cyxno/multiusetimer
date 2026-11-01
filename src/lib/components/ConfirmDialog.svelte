<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Algemene bevestigingsdialoog voor bewuste acties (bijv. verwijderen).
	 * De veilige knop (Annuleren) krijgt standaard de focus.
	 */
	let {
		open,
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		danger = false,
		busy = false,
		onconfirm,
		oncancel
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		danger?: boolean;
		busy?: boolean;
		onconfirm: () => void;
		oncancel: () => void;
	} = $props();
</script>

<Modal {open} {title} onclose={oncancel} variant={danger ? 'danger' : 'default'}>
	<p class="confirm__message">{message}</p>
	{#snippet footer()}
		<button type="button" class="btn" onclick={oncancel} disabled={busy}>
			{cancelLabel}
		</button>
		<button
			type="button"
			class="btn"
			class:btn--danger={danger}
			class:btn--primary={!danger}
			data-autofocus-skip
			onclick={onconfirm}
			disabled={busy}
		>
			{busy ? 'Working…' : confirmLabel}
		</button>
	{/snippet}
</Modal>

<style>
	.confirm__message {
		color: var(--text-muted);
		line-height: 1.6;
	}
</style>
