<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Toegankelijke modale dialoog: focusval, Escape, sluitknop,
	 * achtergrondklik en schuifvergrendeling.
	 */
	let {
		open,
		title,
		onclose,
		children,
		footer,
		variant = 'default'
	}: {
		open: boolean;
		title: string;
		onclose: () => void;
		children: Snippet;
		footer?: Snippet;
		variant?: 'default' | 'danger';
	} = $props();

	let dialogElement: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	function focusables(): HTMLElement[] {
		if (!dialogElement) return [];
		return Array.from(
			dialogElement.querySelectorAll<HTMLElement>(
				'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			)
		).filter((element) => element.offsetParent !== null);
	}

	$effect(() => {
		if (!open) return;
		previouslyFocused = document.activeElement as HTMLElement | null;
		const { style } = document.body;
		const previousOverflow = style.overflow;
		style.overflow = 'hidden';

		const timer = setTimeout(() => {
			const first = focusables().find((el) => !el.hasAttribute('data-autofocus-skip'));
			first?.focus();
		}, 0);

		return () => {
			clearTimeout(timer);
			style.overflow = previousOverflow;
			previouslyFocused?.focus?.();
		};
	});

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === 'Escape') {
			event.stopPropagation();
			onclose();
			return;
		}
		if (event.key === 'Tab') {
			const elements = focusables();
			if (elements.length === 0) return;
			const first = elements[0];
			const last = elements[elements.length - 1];
			const active = document.activeElement;
			if (event.shiftKey && (active === first || !dialogElement?.contains(active))) {
				event.preventDefault();
				last.focus();
			} else if (!event.shiftKey && active === last) {
				event.preventDefault();
				first.focus();
			}
		}
	}

	function handleBackdropClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) onclose();
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<!-- Escape en Tab worden afgehandeld via de window/dialog keydown-handler hierboven. -->
	<div class="overlay" onclick={handleBackdropClick}>
		<div
			class="dialog dialog--{variant}"
			role="dialog"
			aria-modal="true"
			aria-label={title}
			bind:this={dialogElement}
		>
			<header class="dialog__header">
				<h2 class="dialog__title">{title}</h2>
				<button type="button" class="dialog__close" aria-label="Close" onclick={onclose}>
					<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
						<path
							d="M5 5l10 10M15 5L5 15"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
				</button>
			</header>
			<div class="dialog__body">
				{@render children()}
			</div>
			{#if footer}
				<footer class="dialog__footer">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: var(--space-4);
		background: rgba(5, 7, 12, 0.66);
		backdrop-filter: blur(6px);
		animation: fade-in 0.18s ease;
	}

	.dialog {
		width: 100%;
		max-width: 34rem;
		max-height: min(90dvh, 46rem);
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-modal);
		animation: pop-in 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.2);
		overflow: hidden;
	}

	.dialog--danger {
		max-width: 26rem;
	}

	.dialog__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-bottom: 1px solid var(--border);
	}

	.dialog__title {
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.dialog__close {
		display: grid;
		place-items: center;
		width: 2.1rem;
		height: 2.1rem;
		border: none;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-muted);
		cursor: pointer;
	}

	.dialog__close:hover {
		background: var(--surface-2);
		color: var(--text);
	}

	.dialog__body {
		padding: var(--space-5);
		overflow-y: auto;
	}

	.dialog__footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-3);
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--border);
		background: var(--bg-soft);
	}

	@media (max-width: 480px) {
		.overlay {
			padding: var(--space-2);
			align-items: flex-end;
		}

		.dialog {
			max-height: 94dvh;
			border-radius: var(--radius-xl) var(--radius-xl) var(--radius-lg) var(--radius-lg);
		}

		.dialog__body {
			padding: var(--space-4);
		}

		.dialog__footer {
			padding: var(--space-3) var(--space-4);
		}
	}
</style>
