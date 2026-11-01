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
			parseError = 'This file is too large (max. 64 MB).';
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
			parseError = 'Invalid file: the content is not valid JSON.';
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
					`Import complete: ${result.imported} timer${result.imported === 1 ? '' : 's'} restored.`
				);
			} else {
				notify.success(
					`Import complete: ${result.imported} added, ${result.skippedExisting} skipped (already exist).`
				);
			}
			if (result.invalid > 0) {
				notify.info(`${result.invalid} invalid ${result.invalid === 1 ? 'entry' : 'entries'} skipped.`);
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

<Modal {open} title="Import timers" onclose={onclose}>
	<div class="import">
		<p class="import__intro">
			Choose a MultiUseTimer backup (.json). With <strong>Merge</strong>, existing timers are
			kept; with <strong>Replace</strong>, they are removed from the current list.
		</p>

		{#if !summary}
			<label class="import__dropzone">
				<input
					type="file"
					accept="application/json,.json"
					aria-label="Choose a JSON backup file"
					disabled={busy}
					onchange={handleFile}
				/>
				<span aria-hidden="true">📄</span>
				<span>Choose a .json file</span>
			</label>
		{:else}
			<div class="import__summary">
				<p class="import__file">{fileName}</p>
				<p>
					{summary.events} valid timer{summary.events === 1 ? '' : 's'}
					{#if summary.invalidCount > 0}
						· <span class="import__warn">{summary.invalidCount} invalid {summary.invalidCount === 1 ? 'entry' : 'entries'} will be skipped</span>
					{/if}
				</p>

				<fieldset class="import__modes">
					<legend>Choose what happens with the imported timers</legend>
					<label class="import__mode">
						<input type="radio" bind:group={mode} value="merge" />
						<span>
							<strong>Merge</strong>
							<small>Existing timers are kept; timers that already exist are skipped.</small>
						</span>
					</label>
					<label class="import__mode">
						<input type="radio" bind:group={mode} value="replace" />
						<span>
							<strong>Replace</strong>
							<small>The current list is fully replaced by this file.</small>
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
		<button type="button" class="btn" onclick={onclose} disabled={busy}>Cancel</button>
		<button
			type="button"
			class="btn btn--primary"
			disabled={busy || !summary || summary.events === 0}
			onclick={runImport}
		>
			{busy ? 'Importing…' : 'Import'}
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
