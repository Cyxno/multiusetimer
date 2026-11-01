<script lang="ts">
	import { notify } from '$lib/stores/notify.svelte';
	import { eventStore } from '$lib/stores/events.svelte';
	import { validateImportPayload } from '$lib/utils/validation';
	import Modal from '$lib/components/Modal.svelte';

	/**
	 * Import-dialoog: JSON-backup kiezen, samenvatting tonen en een bewuste
	 * keuze vragen tussen vervangen en toevoegen (samenvoegen).
	 */
	let { open, onclose }: { open: boolean; onclose: () => void } = $props();

	let fileName = $state('');
	let fileText = $state<string | null>(null);
	let summary = $state<{ events: number; invalidCount: number } | null>(null);
	let parseError = $state('');
	let mode = $state<'merge' | 'replace'>('merge');
	let busy = $state(false);

	function reset(): void {
		fileName = '';
		fileText = null;
		summary = null;
		parseError = '';
		mode = 'merge';
		busy = false;
	}

	$effect(() => {
		if (!open) reset();
	});

	async function handleFile(event: Event): Promise<void> {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		parseError = '';
		summary = null;
		if (!file) return;

		if (file.size > 64 * 1024 * 1024) {
			parseError = 'Dit bestand is te groot (max. 64 MB).';
			input.value = '';
			return;
		}

		try {
			const text = await file.text();
			const validated = validateImportPayload(JSON.parse(text));
			if (!validated.ok) {
				parseError = validated.errors[0] ?? 'Ongeldig bestand.';
			} else if (validated.value) {
				fileName = file.name;
				fileText = text;
				summary = {
					events: validated.value.events.length,
					invalidCount: validated.value.invalidCount
				};
			}
		} catch {
			parseError = 'Ongeldig bestand: de inhoud is geen geldige JSON.';
		} finally {
			input.value = '';
		}
	}

	async function runImport(): Promise<void> {
		if (!fileText || busy) return;
		busy = true;
		try {
			const result = await eventStore.import(fileText, mode);
			if (result.mode === 'replace') {
				notify.success(
					`Import voltooid: ${result.imported} timer${result.imported === 1 ? '' : 's'} hersteld.`
				);
			} else {
				notify.success(
					`Import voltooid: ${result.imported} toegevoegd, ${result.skippedExisting} overgeslagen (bestonden al).`
				);
			}
			if (result.invalid > 0) {
				notify.info(`${result.invalid} ongeldige regel${result.invalid === 1 ? '' : 's'} overgeslagen.`);
			}
			onclose();
		} catch (error) {
			parseError = error instanceof Error ? error.message : 'De import is mislukt.';
			summary = null;
			fileText = null;
		} finally {
			busy = false;
		}
	}
</script>

<Modal {open} title="Timers importeren" onclose={onclose}>
	<div class="import">
		<p class="import__intro">
			Kies een MultiUseTimer-backup (.json). Bij <strong>Toevoegen</strong> blijven bestaande
			timers staan; bij <strong>Vervangen</strong> verdwijnen ze uit de huidige lijst.
		</p>

		{#if !summary}
			<label class="import__dropzone">
				<input
					type="file"
					accept="application/json,.json"
					aria-label="JSON-backupbestand kiezen"
					disabled={busy}
					onchange={handleFile}
				/>
				<span aria-hidden="true">📄</span>
				<span>Kies een .json-bestand</span>
			</label>
		{:else}
			<div class="import__summary">
				<p class="import__file">{fileName}</p>
				<p>
					{summary.events} geldige timer{summary.events === 1 ? '' : 's'}
					{#if summary.invalidCount > 0}
						· <span class="import__warn">{summary.invalidCount} ongeldige regel{summary.invalidCount === 1 ? '' : 's'} wordt overgeslagen</span>
					{/if}
				</p>

				<fieldset class="import__modes">
					<legend>Kies wat er met de geïmporteerde timers gebeurt</legend>
					<label class="import__mode">
						<input type="radio" bind:group={mode} value="merge" />
						<span>
							<strong>Toevoegen</strong>
							<small>Bestaande timers blijven staan; timers die al bestaan worden overgeslagen.</small>
						</span>
					</label>
					<label class="import__mode">
						<input type="radio" bind:group={mode} value="replace" />
						<span>
							<strong>Vervangen</strong>
							<small>De huidige lijst wordt volledig vervangen door dit bestand.</small>
						</span>
					</label>
				</fieldset>
			</div>
		{/if}

		{#if parseError}
			<p class="import__error" role="alert">{parseError}</p>
		{/if}
	</div>

	{#snippet footer()}
		<button type="button" class="btn" onclick={onclose} disabled={busy}>Annuleren</button>
		<button
			type="button"
			class="btn btn--primary"
			disabled={busy || !summary || summary.events === 0}
			onclick={runImport}
		>
			{busy ? 'Importeren…' : 'Importeren'}
		</button>
	{/snippet}
</Modal>

<style>
	.import {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.import__intro {
		color: var(--text-muted);
		font-size: 0.92rem;
		line-height: 1.6;
	}

	.import__dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: var(--space-6);
		text-align: center;
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.import__dropzone:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.import__dropzone input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}

	.import__dropzone:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.import__summary {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--bg-soft);
		font-size: 0.92rem;
	}

	.import__file {
		font-weight: 700;
		overflow-wrap: anywhere;
	}

	.import__warn {
		color: var(--warning);
	}

	.import__modes {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.import__modes legend {
		padding: 0 0 0.5rem;
		color: var(--text-muted);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.import__mode {
		display: flex;
		gap: 0.6rem;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid var(--border-strong);
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.import__mode:has(input:checked) {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.import__mode:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.import__mode small {
		display: block;
		color: var(--text-faint);
		font-size: 0.78rem;
	}

	.import__error {
		color: var(--danger);
		font-size: 0.88rem;
	}
</style>
