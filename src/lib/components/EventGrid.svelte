<script lang="ts">
	import { dndzone, setAriaStrings, type DndEvent } from 'svelte-dnd-action';
	import { browser } from '$app/environment';
	import { eventStore } from '$lib/stores/events.svelte';
	import EventCard from '$lib/components/EventCard.svelte';
	import type { TimerEvent } from '$lib/types';

	/**
	 * Responsive grid met timerkaarten en drag-and-drop ordening
	 * (svelte-dnd-action). De lokale `items`-lijst volgt de store, behalve
	 * middenin een drag; na `finalize` wordt de nieuwe volgorde in de store —
	 * en daarmee persistent — vastgelegd.
	 */
	let {
		onEdit,
		onDelete
	}: {
		onEdit: (event: TimerEvent) => void;
		onDelete: (event: TimerEvent) => void;
	} = $props();

	let items = $state<TimerEvent[]>([]);
	let isDragging = $state(false);

	if (browser) {
		setAriaStrings({
			dragStarted: ({ itemLabel, position, count }) =>
				`${itemLabel} picked up. Position ${position} of ${count}. Use the arrow keys to move, space to drop, escape to cancel.`,
			movedToPosition: ({ itemLabel, position, count }) =>
				`${itemLabel} moved to position ${position} of ${count}.`,
			dropped: ({ itemLabel, position, count }) =>
				`${itemLabel} dropped at position ${position} of ${count}.`,
			zoneActiveInstruction:
				'Drop zone. Press space to pick up a card and move it with the arrow keys.'
		});
	}

	$effect(() => {
		if (isDragging) return;
		items = eventStore.sorted;
	});

	function handleConsider(event: CustomEvent<DndEvent<TimerEvent>>): void {
		isDragging = true;
		items = event.detail.items;
	}

	function handleFinalize(event: CustomEvent<DndEvent<TimerEvent>>): void {
		isDragging = false;
		items = event.detail.items;
		void eventStore.reorder(event.detail.items.map((item) => item.id));
	}

	function handleMove(id: string, direction: 'up' | 'down'): void {
		void eventStore.move(id, direction);
	}
</script>

<section class="grid-section" aria-label="Timers">
	<div
		class="grid"
		class:grid--dragging={isDragging}
		use:dndzone={{
			items,
			flipDurationMs: 200,
			dragDisabled: items.length < 2,
			centreDraggedOnCursor: true,
			delayTouchStart: 80,
			dropTargetStyle: {
				outline: '2px dashed rgba(108, 140, 255, 0.55)',
				'outline-offset': '10px',
				'border-radius': '24px'
			}
		}}
		onconsider={handleConsider}
		onfinalize={handleFinalize}
	>
		{#each items as event (event.id)}
			<div class="grid__cell" data-event-id={event.id}>
				<EventCard {event} {onEdit} {onDelete} onMove={handleMove} />
			</div>
		{/each}
	</div>
</section>

<style>
	.grid-section {
		min-width: 0;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(21rem, 100%), 1fr));
		gap: var(--space-5);
		align-items: stretch;
	}

	.grid--dragging {
		cursor: grabbing;
	}

	.grid__cell {
		display: flex;
		min-width: 0;
	}

	.grid__cell > :global(*) {
		flex: 1;
	}

	@media (max-width: 640px) {
		.grid {
			gap: var(--space-4);
			grid-template-columns: 1fr;
		}
	}
</style>
