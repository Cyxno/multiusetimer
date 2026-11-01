<script lang="ts">
	import { normalizeImage, MAX_IMAGE_LENGTH } from '$lib/utils/validation';

	/**
	 * Afbeeldingskeuze met twee methoden:
	 *  1. Lokaal bestand → ingelezen via FileReader, waar nodig verkleind naar
	 *     max. 1920px en opgeslagen als data-URL (JPEG) in de browseropslag.
	 *  2. Externe URL → gevalideerd en met preview; externe afbeeldingen
	 *     kunnen offline verdwijnen, dat wordt duidelijk gemaakt.
	 */
	let {
		value,
		onchange
	}: {
		value: string | null;
		onchange: (value: string | null) => void;
	} = $props();

	const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
	const MAX_INPUT_BYTES = 8 * 1024 * 1024; // 8 MB
	const MAX_DIMENSION = 1920;
	const RESIZE_THRESHOLD_BYTES = 1_500_000; // ~1,5 MB
	const JPEG_QUALITY = 0.85;

	let tab = $state<'upload' | 'url'>('upload');
	let busy = $state(false);
	let error = $state('');
	let urlDraft = $state('');
	let urlError = $state('');
	let externalFailed = $state(false);

	$effect(() => {
		// Reset de externe-foutstatus zodra de waarde verandert.
		value;
		externalFailed = false;
	});

	$effect(() => {
		// Kies het tabblad dat past bij de huidige waarde.
		if (value && !value.startsWith('data:')) tab = 'url';
	});

	function apply(next: string | null): void {
		onchange(next);
	}

	function readFileAsDataUrl(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(new Error('read'));
			reader.readAsDataURL(file);
		});
	}

	function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();
			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error('decode'));
			image.src = src;
		});
	}

	/** Verkleint grote afbeeldingen; retourneert null als verkleinen niet helpt. */
	async function downscaleToDataUrl(dataUrl: string): Promise<string | null> {
		const image = await loadImage(dataUrl);
		const scale = Math.min(1, MAX_DIMENSION / Math.max(image.width, image.height));
		const isSmall = dataUrl.length <= RESIZE_THRESHOLD_BYTES;
		if (scale >= 1 && isSmall) return null;

		const canvas = document.createElement('canvas');
		canvas.width = Math.max(1, Math.round(image.width * scale));
		canvas.height = Math.max(1, Math.round(image.height * scale));
		const context = canvas.getContext('2d');
		if (!context) return null;
		context.drawImage(image, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
	}

	async function handleFile(file: File | undefined): Promise<void> {
		if (!file) return;
		error = '';
		if (!ALLOWED_TYPES.includes(file.type)) {
			error = 'Pick an image in PNG, JPEG, WebP or GIF format.';
			return;
		}
		if (file.size > MAX_INPUT_BYTES) {
			error = 'The image is too large. Choose a file of at most 8 MB.';
			return;
		}

		busy = true;
		try {
			const dataUrl = await readFileAsDataUrl(file);
			// GIF's niet via canvas halen (animatie gaat verloren).
			const resized = file.type === 'image/gif' ? null : await downscaleToDataUrl(dataUrl);
			const candidate = resized && resized.length < dataUrl.length ? resized : dataUrl;
			if (candidate.length > MAX_IMAGE_LENGTH) {
				error = 'The image is too large to store locally.';
				return;
			}
			apply(candidate);
			tab = 'upload';
		} catch {
			error = 'The image could not be read. Try another file.';
		} finally {
			busy = false;
		}
	}

	function applyUrl(): void {
		urlError = '';
		const candidate = urlDraft.trim();
		if (!candidate) {
			urlError = 'Enter an image URL.';
			return;
		}
		if (normalizeImage(candidate) !== candidate) {
			urlError = 'Enter a valid http(s) URL to an image.';
			return;
		}
		apply(candidate);
		urlDraft = '';
	}

	function removeImage(): void {
		urlDraft = '';
		urlError = '';
		error = '';
		apply(null);
	}
</script>

<div class="picker">
	<div class="picker__tabs" role="tablist" aria-label="Image source">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'upload'}
			class:picker__tab--active={tab === 'upload'}
			onclick={() => (tab = 'upload')}
		>
			Upload
		</button>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'url'}
			class:picker__tab--active={tab === 'url'}
			onclick={() => (tab = 'url')}
		>
			From URL
		</button>
	</div>

	{#if tab === 'upload'}
		<div class="picker__panel">
			<label class="picker__dropzone">
				<input
					type="file"
					accept="image/png,image/jpeg,image/webp,image/gif"
					aria-label="Choose an image file"
					disabled={busy}
					onchange={(event) => {
						const input = event.currentTarget;
						handleFile(input.files?.[0]);
						input.value = '';
					}}
				/>
				{#if busy}
					Processing…
				{:else}
					<span aria-hidden="true">📁</span>
					<span>Choose an image (PNG, JPEG, WebP or GIF, max. 8 MB)</span>
					<span class="picker__hint">Large images are resized automatically.</span>
				{/if}
			</label>
			{#if error}
				<p class="picker__error" role="alert">{error}</p>
			{/if}
		</div>
	{:else}
		<div class="picker__panel">
			<div class="picker__url-row">
				<input
					type="url"
					class="input"
					placeholder="https://voorbeeld.nl/foto.jpg"
					aria-label="External image URL"
					aria-invalid={urlError ? 'true' : undefined}
					bind:value={urlDraft}
					onkeydown={(event) => {
						if (event.key === 'Enter') {
							event.preventDefault();
							applyUrl();
						}
					}}
				/>
				<button type="button" class="btn btn--small" onclick={applyUrl}>Use</button>
			</div>
			{#if urlError}
				<p class="picker__error" role="alert">{urlError}</p>
			{:else}
				<p class="picker__hint">External images may disappear offline or when the source removes them.</p>
			{/if}
		</div>
	{/if}

	{#if value}
		<div class="picker__preview">
			<div class="picker__preview-media">
				<img
					src={value}
					alt="Preview"
					onerror={() => (externalFailed = !value.startsWith('data:'))}
				/>
				{#if externalFailed}
					<div class="picker__preview-fallback" role="status">
						The external image could not be loaded. The timer keeps working.
					</div>
				{/if}
			</div>
			<div class="picker__preview-meta">
				<span class="picker__preview-kind">
					{value.startsWith('data:') ? 'Locally stored image' : 'External URL'}
				</span>
				<button type="button" class="btn btn--small btn--ghost" onclick={removeImage}>
					Remove
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.picker__tabs {
		display: inline-flex;
		gap: 0.25rem;
		padding: 0.25rem;
		border-radius: var(--radius-md);
		background: var(--bg-soft);
		border: 1px solid var(--border);
		align-self: flex-start;
	}

	.picker__tabs button {
		padding: 0.4rem 0.85rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
	}

	.picker__tab--active {
		background: var(--surface-3);
		color: var(--text);
	}

	.picker__panel {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.picker__dropzone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: var(--space-5);
		text-align: center;
		border: 1.5px dashed var(--border-strong);
		border-radius: var(--radius-md);
		color: var(--text-muted);
		font-size: 0.9rem;
		cursor: pointer;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.picker__dropzone:hover {
		border-color: var(--accent);
		background: var(--accent-soft);
	}

	.picker__dropzone input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		overflow: hidden;
	}

	.picker__dropzone input:focus-visible + * ,
	.picker__dropzone:has(input:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	.picker__hint {
		font-size: 0.78rem;
		color: var(--text-faint);
	}

	.picker__error {
		font-size: 0.85rem;
		color: var(--danger);
	}

	.picker__url-row {
		display: flex;
		gap: var(--space-2);
	}

	.picker__url-row .input {
		flex: 1;
		min-width: 0;
	}

	.picker__preview {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: var(--space-3);
		border-radius: var(--radius-md);
		border: 1px solid var(--border);
		background: var(--bg-soft);
	}

	.picker__preview-media {
		position: relative;
		border-radius: var(--radius-sm);
		overflow: hidden;
		background: var(--surface);
	}

	.picker__preview-media img {
		width: 100%;
		max-height: 11rem;
		object-fit: cover;
	}

	.picker__preview-fallback {
		padding: var(--space-4);
		font-size: 0.85rem;
		color: var(--warning);
	}

	.picker__preview-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.picker__preview-kind {
		font-size: 0.8rem;
		color: var(--text-muted);
	}
</style>
