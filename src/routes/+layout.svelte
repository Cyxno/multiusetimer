<script lang="ts">
	import '@fontsource-variable/inter';
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { clock } from '$lib/stores/clock.svelte';
	import NoticeHost from '$lib/components/NoticeHost.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	$effect(() => {
		clock.start();

		// Service worker alleen in productie registreren (PWA-basis).
		if (import.meta.env.PROD && 'serviceWorker' in navigator) {
			navigator.serviceWorker.register('/sw.js').catch(() => {
				/* Offline-ondersteuning is optioneel; de app werkt ook zonder. */
			});
		}

		return () => clock.stop();
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#0a0d14" />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta
		name="description"
		content="MultiUseTimer — lokale countdown- en count-up-timers voor belangrijke momenten."
	/>
</svelte:head>

{@render children()}
<NoticeHost />
