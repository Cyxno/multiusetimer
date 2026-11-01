/*
 * MultiUseTimer — eenvoudige, betrouwbare service worker (PWA-basis).
 *
 * Strategie:
 * - Navigaties (de pagina zelf): netwerk eerst, met cache als fallback. Een
 *   update van de applicatie wordt daardoor nooit geblokkeerd door oude
 *   gecachete assets; offline start de laatst opgeslagen pagina gewoon.
 * - /_app/immutable/ (gehashte build-assets: JS, CSS, fonts): cache eerst —
 *   de bestandsnaam verandert bij elke release, dus cache kan nooit verouderen.
 * - Overige verzoeken (bijv. externe afbeeldingen) worden niet gecachet;
 *   externe afbeeldingen zijn optioneel en mogen offline verdwijnen.
 */

const CACHE_NAME = 'multiusetimer-v1';
const PRECACHE = ['/', '/manifest.webmanifest'];
const IMMUTABLE_PREFIX = '/_app/immutable/';

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE_NAME)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;

	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					const cache = await caches.open(CACHE_NAME);
					cache.put('/', response.clone());
					return response;
				} catch {
					const cached = await caches.match('/');
					return cached || Response.error();
				}
			})()
		);
		return;
	}

	if (url.pathname.startsWith(IMMUTABLE_PREFIX)) {
		event.respondWith(
			(async () => {
				const cached = await caches.match(request);
				if (cached) return cached;
				const response = await fetch(request);
				if (response.ok) {
					const cache = await caches.open(CACHE_NAME);
					cache.put(request, response.clone());
				}
				return response;
			})()
		);
	}
});
