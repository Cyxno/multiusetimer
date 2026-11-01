/// <reference types="vitest/config" />
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// MultiUseTimer is volledig client-side; adapter-static levert de
			// prerenderde dashboardpagina als statische site (één route, geen fallback).
			adapter: adapter()
		})
	],

	test: {
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		// Kalenderberekeningen (maanden/dagen) zijn tijdzone-afhankelijk; de
		// tests draaien deterministisch in Europe/Amsterdam (incl. DST-overgangen).
		env: { TZ: 'Europe/Amsterdam' }
	}
});
