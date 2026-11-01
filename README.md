# MultiUseTimer

MultiUseTimer is een lokale webapplicatie om **countdown- en count-up-timers** te beheren voor
belangrijke momenten: het aftellen naar een vakantie, verjaardag of feestdag, of het bijhouden
hoe lang geleden iets heeft plaatsgevonden. Elke timer kan worden voorzien van een eigen foto,
accentkleur, subtitel en eigen tijdseenheden, en het dashboard kan met drag-and-drop worden
geordend.

De applicatie is **volledig client-side**: er is geen backend, geen account en er worden geen
gegevens naar externe servers verstuurd. Alle timers worden lokaal in de browser opgeslagen
(IndexedDB, met localStorage als fallback).

## Belangrijkste functionaliteit

- **Countdown** naar een toekomstig moment en **count-up** vanaf een moment in het verleden.
- Één centrale klok die alle kaarten tegelijk bijwerkt (geen interval per kaart).
- Kalendergebaseerde berekening van maanden, weken en dagen, inclusief schrikkeljaren en
  zomer-/wintertijdovergangen (zie `PLAN.md` voor de exacte semantiek).
- Tijdzonebewuste opslag: de gekozen datum/tijd wordt opgeslagen als ISO 8601 met expliciete
  offset, zodat het moment ondubbelzinnig is, ook als het apparaat later in een andere
  tijdzone staat.
- Instelbare tijdseenheden (maanden t/m minuten) en een schakelaar voor seconden.
- Eigen foto (upload, lokaal opgeslagen als data-URL) of externe afbeeldings-URL.
- Accentkleur per kaart.
- Drag-and-drop ordening plus een toegankelijk alternatief (omhoog/omlaag in het kaartmenu).
- JSON-export en gecontroleerde JSON-import (vervangen of toevoegen) als backup.
- Subtiele confetti wanneer een countdown nul bereikt (respecteert `prefers-reduced-motion`).
- PWA-basis: manifest, installeerbaar, service worker met cache-first assets en
  network-first navigatie, zodat de applicatie na het laden offline blijft werken.

## Gebruikte technologieën

| Onderdeel | Keuze |
| --- | --- |
| Framework | [SvelteKit 2](https://svelte.dev/docs/kit) met [Svelte 5](https://svelte.dev/docs/svelte) (runes) |
| Buildtool | Vite 7 |
| Taal | TypeScript (strict) |
| Opslag | [localForage](https://github.com/localForage/localForage) (IndexedDB, fallback localStorage) |
| Drag-and-drop | [svelte-dnd-action](https://github.com/isaacHagoel/svelte-dnd-action) |
| Datums | [date-fns](https://date-fns.org/) |
| Fonts | Inter (via `@fontsource-variable/inter`, lokaal gebundeld) |
| Tests | [Vitest](https://vitest.dev/) met [fake-indexeddb](https://github.com/indexeddbshim/IndexedDB-shim) voor opslagintegratietests |
| Hosting | Statische site via `@sveltejs/adapter-static` |

## Vereisten

- Node.js 20 of nieuwer
- npm

## Installatie

```bash
npm install
```

## Development

```bash
npm run dev -- --open
```

De developmentserver staat standaard op <http://localhost:5173>.

## Productiebuild

```bash
npm run build
npm run preview
```

`npm run build` schrijft de volledige statische site naar `build/`. Die map kan op elke
statische host worden neergezet (GitHub Pages, Netlify, een webserver, …). `npm run preview`
serveert de build lokaal om te controleren.

## Tests

```bash
npm test            # éénmalig draaien (unit + integratie)
npm run test:watch  # in watch-modus
npm run check       # svelte-check + TypeScript
```

De unit- en integratietests staan in `tests/` en draaien deterministisch in de tijdzone
Europe/Amsterdam (inclusief de zomer-/wintertijdovergangen van 2026), zodat de
kalenderberekeningen reproduceerbaar zijn.

Daarnaast staat er een optionele end-to-end rooktest in `tests/e2e/smoke.mjs` die de volledige
gebruikersflow in een echte browser doorloopt (aanmaken, tellen, bewerken, ordenen, herladen,
exporteren, importeren, verwijderen). Deze vereist een aparte installatie van
[Playwright](https://playwright.dev/) en een draaiende preview-server:

```bash
npm run build
npm run preview -- --port 4173 &
npm i --no-save playwright && npx playwright install chromium
node tests/e2e/smoke.mjs
```

## Opslag en privacy

- Timers worden opgeslagen in **IndexedDB** (database `multiusetimer`, store `events`) via
  localForage. Wanneer IndexedDB niet beschikbaar is, valt localForage terug op localStorage.
- Geüploade foto's worden als **data-URL** in dezelfde lokale opslag bewaard; er wordt niets
  geüpload naar een server.
- Externe afbeeldings-URL's worden door de browser zelf geladen; die afbeeldingen kunnen
  offline of na verwijdering verdwijnen, de rest van de timer blijft gewoon werken.
- Alle gegevens die uit de opslag of uit een importbestand komen worden gevalideerd;
  beschadigde records worden overgeslagen in plaats van de applicatie te laten crashen.

Beperkingen van lokale browseropslag:

- De opslag is per browser en per apparaat. Gegevens verdwijnen wanneer de sitegegevens van
  de browser worden gewist (of bij privévensters zonder opslag).
- De browser stelt een quota in (meestal enkele honderden MB's). Bij het bereiken daarvan
  geeft de applicatie een duidelijke foutmelding; maak regelmatig een JSON-backup.
- Een JSON-backup bevat ook de foto's (data-URL's) en kan daardoor groot zijn.

## JSON-backups

**Exporteren** (knop "Exporteren") downloadt één JSON-bestand (`multiusetimer-backup-JJJJ-MM-DD.json`):

```json
{
	"app": "MultiUseTimer",
	"version": 1,
	"exportedAt": "2026-11-01T19:00:00.000Z",
	"events": [ "… alle timers, inclusief lokale afbeeldingsdata-URL's …" ]
}
```

**Importeren** (knop "Importeren") valideert het bestand eerst en toont een samenvatting.
Daarna kies je zelf:

- **Toevoegen** — bestaande timers blijven staan; timers die al bestaan (zelfde id) worden
  overgeslagen, ongeldige regels worden overgeslagen en gemeld.
- **Vervangen** — de huidige lijst wordt volledig vervangen door het bestand.

Bij een ongeldig of te nieuw bestandsformaat wordt de import geweigerd en blijven de
bestaande gegevens onaangetast.

## Applicatie lokaal opnieuw opzetten

```bash
git clone https://github.com/Cyxno/multiusetimer.git
cd multiusetimer
npm install
npm run dev -- --open
```

Omdat alle gegevens in de browser van de gebruiker staan, is er geen migratie of
serverconfiguratie nodig: een verse installatie start met een leeg dashboard en de bestaande
timers van die browser komen terug zodra dezelfde site op hetzelfde origin wordt geopend.

## Projectstructuur

Zie [`PLAN.md`](./PLAN.md) voor de architectuur, de ontwerpkeuzes (o.a. de semantiek van
maanden/weken en tijdzoneverwerking) en de implementatiestatus.
