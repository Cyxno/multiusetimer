# MultiUseTimer

MultiUseTimer is a local web application for managing **countdown and count-up timers** for
important moments: counting down to a holiday, birthday or party, or tracking how long ago
something happened. Every timer can have its own photo, accent color, subtitle and time units,
and the dashboard can be ordered with drag-and-drop.

The application is **fully client-side**: there is no backend, no account, and no data is sent
to external servers. All timers are stored locally in the browser (IndexedDB, with a
localStorage fallback).

**Live:** <https://cyxno.eu/multiusetimer/>

## Key features

- **Countdown** to a future moment and **count-up** from a moment in the past.
- A single central clock updates all cards at once (no interval per card).
- Calendar-based calculation of months, weeks and days, including leap years and
  daylight-saving-time transitions (see `PLAN.md` for the exact semantics — written in Dutch).
- Timezone-aware storage: the chosen date/time is stored as ISO 8601 with an explicit UTC
  offset, so the moment is unambiguous even if the device later moves to a different timezone.
- Selectable time units (months down to minutes) and a seconds toggle.
- Custom photo (upload, stored locally as a data URL) or an external image URL.
- Per-card accent color.
- Drag-and-drop ordering plus an accessible alternative (move up/down in the card menu).
- JSON export and validated JSON import (replace or merge) as a backup.
- Subtle confetti when a countdown reaches zero (respects `prefers-reduced-motion`).
- PWA basics: manifest, installable, service worker with cache-first assets and network-first
  navigation, so the application keeps working offline once loaded.

## Tech stack

| Part | Choice |
| --- | --- |
| Framework | [SvelteKit 2](https://svelte.dev/docs/kit) with [Svelte 5](https://svelte.dev/docs/svelte) (runes) |
| Build tool | Vite 7 |
| Language | TypeScript (strict) |
| Storage | [localForage](https://github.com/localForage/localForage) (IndexedDB, localStorage fallback) |
| Drag-and-drop | [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) |
| Dates | [date-fns](https://date-fns.org/) |
| Fonts | Inter (via `@fontsource-variable/inter`, bundled locally) |
| Tests | [Vitest](https://vitest.dev/) with [fake-indexeddb](https://github.com/indexeddbshim/IndexedDB-shim) for storage integration tests |
| Hosting | Static site via `@sveltejs/adapter-static` |

## Requirements

- Node.js 20 or newer
- npm

## Installation

```bash
npm install
```

## Development

```bash
npm run dev -- --open
```

The development server runs at <http://localhost:5173> by default.

## Production build

```bash
npm run build
npm run preview
```

`npm run build` writes the complete static site to `build/`. That folder can be deployed to any
static host (GitHub Pages, Netlify, a plain web server, …). `npm run preview` serves the build
locally so you can check it.

## Tests

```bash
npm test            # run once (unit + integration)
npm run test:watch  # watch mode
npm run check       # svelte-check + TypeScript
```

The unit and integration tests live in `tests/` and run deterministically in the
Europe/Amsterdam timezone (including the 2026 daylight-saving transitions), so the calendar
calculations are reproducible.

There is also an optional end-to-end smoke test in `tests/e2e/smoke.mjs` that walks the entire
user flow in a real browser (create, ticking, edit, ordering, reload, export, import, delete).
It requires a separate installation of [Playwright](https://playwright.dev/) and a running
preview server:

```bash
npm run build
npm run preview -- --port 4173 &
npm i --no-save playwright && npx playwright install chromium
node tests/e2e/smoke.mjs
```

## Storage and privacy

- Timers are stored in **IndexedDB** (database `multiusetimer`, store `events`) via localForage.
  When IndexedDB is unavailable, localForage falls back to localStorage.
- Uploaded photos are kept as a **data URL** in the same local storage; nothing is uploaded to
  a server.
- External image URLs are loaded by the browser itself; those images may disappear offline or
  after removal, the rest of the timer keeps working.
- All data coming out of storage or an import file is validated; corrupt records are skipped
  instead of crashing the application.

Limitations of local browser storage:

- Storage is per browser and per device. Data disappears when the browser's site data is
  cleared (or in private windows without storage).
- The browser enforces a quota (usually several hundred megabytes). When it is reached, the
  application shows a clear error message; make regular JSON backups.
- A JSON backup includes the photos (data URLs) and can therefore be large.

## JSON backups

**Exporting** (the "Exporteren" button) downloads a single JSON file
(`multiusetimer-backup-YYYY-MM-DD.json`):

```json
{
	"app": "MultiUseTimer",
	"version": 1,
	"exportedAt": "2026-11-01T19:00:00.000Z",
	"events": [ "… all timers, including local image data URLs …" ]
}
```

**Importing** (the "Importeren" button) validates the file first and shows a summary. You then
choose:

- **Merge** — existing timers stay in place; timers that already exist (same id) are skipped,
  invalid entries are skipped and reported.
- **Replace** — the current list is fully replaced by the file.

If the file is invalid or created with a newer export format, the import is rejected and the
existing data is left untouched.

> Note: the application's UI is in Dutch ("Exporteren" = Export, "Importeren" = Import).

## Setting the application up locally again

```bash
git clone https://github.com/Cyxno/multiusetimer.git
cd multiusetimer
npm install
npm run dev -- --open
```

Because all data lives in the user's browser, there is no migration or server configuration
needed: a fresh install starts with an empty dashboard, and the existing timers of that browser
reappear as soon as the same site is opened on the same origin.

## Project structure

See [`PLAN.md`](./PLAN.md) for the architecture, the design decisions (among others the
semantics of months/weeks and timezone handling — written in Dutch) and the implementation
status.
