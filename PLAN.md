# MultiUseTimer — plan en architectuur

Dit document beschrijft de architectuur, de belangrijke ontwerpkeuzes en de implementatiestatus
van MultiUseTimer. Het beschrijft wat er daadwerkelijk is gebouwd; alles hieronder is
geïmplementeerd en getest, tenzij expliciet anders vermeld.

## 1. Doel en scope

MultiUseTimer is een lokale dashboardapplicatie voor countdown- en count-up-timers. De
bewuste afbakening:

- **Geen backend, geen database-server, geen authenticatie, geen externe API's.** De applicatie
  is een statische site; alle logica draait in de browser.
- **Alle gegevens blijven lokaal** (IndexedDB via localForage, met localStorage als fallback).
- Externe afbeeldings-URL's zijn optioneel; lokale foto's worden als data-URL in de lokale
  opslag bewaard.

## 2. Technische stack

- **SvelteKit 2** (2.70.x) met **Svelte 5** (runes-mode wordt forcéér ingesteld voor alle
  projectcode) en **Vite 7**, TypeScript 5 (strict).
- **adapter-static**: het dashboard (één route, `/`) wordt prerenderd naar statische HTML en
  in de browser gehydrateerd. Daardoor is de site overal te hosten en is de eerste render snel.
- **localForage 1.10** uitsluitend in de opslaglaag (`src/lib/db/storage.ts`); componenten en
  stores spreken localForage nooit direct aan.
- **svelte-dnd-action 0.9.80** voor drag-and-drop, met de schermlezerteksten (Engels) van de
  library (`setAriaStrings`).
- **date-fns 4** voor kalenderberekeningen (maanden-anchoring, kalenderdagen).
- **Vitest 5** + **fake-indexeddb** voor unit- en integratietests zonder echte browser.

*Opmerking over versies:* de opdracht schrijft SvelteKit 2 voor; de huidige generatie is
SvelteKit 3. Deze build gebruikt de nieuwste 2.x (2.70.3) met onderling compatibele
versies van Vite, vite-plugin-svelte en TypeScript. De `npm audit`-waarschuwingen die
overblijven (URL-redirect via enhanced form submission, XSS via cache-control in prerendered
pages, prototype pollution in deepmerge) zijn alleen fixbaar in Kit 3 / vite-plugin-svelte 7 en
raken deze applicatie niet: er zijn géén server-endpoints of form actions (statische prerender),
en deepmerge wordt alleen tijdens de build gebruikt. De upgrade naar Kit 3 is de natuurlijke
volgende stap en ruimt deze waarschuwingen op.

## 3. Datamodel en validatie

`src/lib/types.ts` definieert `TimerEvent` (id, title, subtitle?, mode, targetDate, image?,
accentColor?, units, showSeconds, order, createdAt) zoals in de opdracht.

Alle gegevens die van buitenkomen — IndexedDB, importbestand, formulier — lopen door
`src/lib/utils/validation.ts`:

- `parseEvent` valideert en normaliseert elk veld afzonderlijk en weigert het event bij
  ongeldige kernvelden (id, titel, modus, targetDate, units, showSeconds, order, createdAt).
  Soft-velden worden genormaliseerd: eenheden worden geordend van groot naar klein en
  gedupliceerd, accentkleuren worden naar veilige hex genormaliseerd (`normalizeAccentColor`
  accepteert uitsluitend `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` — CSS-injectie via
  geïmporteerde kleuren is daarmee onmogelijk), en `image` moet een `data:image/…`-URL of een
  http(s)-URL zijn.
- `validateImportPayload` controleert de exportstructuur (app, versie, events) en telt
  ongeldige regels in plaats van het hele bestand te weigeren.
- Beschadigde losse records in IndexedDB worden door `getAllEvents` overgeslagen; één kapot
  event maakt de rest niet onbruikbaar.

## 4. Tijdzoneverwerking (ontwerpkeuze)

`src/lib/utils/date-time.ts` is het enige plaatst waar tijdzone-logica staat.

**Opslagformaat.** `targetDate` wordt opgeslagen als ISO 8601 met expliciete offset, bijv.
`2027-04-01T09:00:00+02:00`. Een opgeslagen offset is geen tijdzone-identificatie, maar voor
het aftellen naar één vast moment is een ondubbelzinnig tijdstip voldoende: reizende
gebruikers zien dezelfde resterende tijd, want de berekening gebeurt op de UTC-tijdlijn.

**Invoer.** De formulierwaarden (datum + tijd) worden geïnterpreteerd als lokale kalenderdatum
en kloktijd. `localToIsoOffset` berekent de offset die op díé datum in de tijdzone van het
apparaat geldt, via `Intl.DateTimeFormat.formatToParts` (geen hardcoded `+01:00`/`+02:00`, en
geen `new Date().toISOString()`, die naar UTC zou converteren). Randgevallen:

- *Niet-bestaande tijden* (naar zomertijd): de invoer krijgt de vóór de overgang geldende
  offset en wordt daarmee een stabiel, ondubbelzinnig moment.
- *Dubbele tijden* (naar wintertijd): de invoer krijgt de ná de overgang geldende offset.
  Beide keuzes zijn deterministisch en stabiel bij herladen.

**Bewerken zonder verschuiven.** Bij het bewerken leest `isoToWallParts` de wandklok
(datum/tijd in de opgeslagen offset) rechtstreeks uit de string en precies dát staat in het
formulier — ook als het apparaat inmiddels in een andere tijdzone staat. Bij opslaan geldt:

- Datum/tijd ongewijzigd (`sameWallParts`, op minuutprecisie) → het **originele ISO-moment
  blijft exact behouden** (inclusief eventuele seconden).
- Datum/tijd gewijzigd → de nieuwe invoer wordt geïnterpreteerd in de huidige lokale tijdzone.

**Presentatie.** Kaarten tonen het doelmoment in de lokale tijdzone van het apparaat
(`Intl.DateTimeFormat('nl-NL')`); het formulier toont de gekozen wandklok met de bijbehorende
offset, zodat duidelijk is wat er opgeslagen wordt.

## 5. Duur- en tellerlogica (semantiek)

`src/lib/utils/duration.ts` bevat de volledige rekenlogica, onafhankelijk van de UI.

**Algemeen.** `computeDuration(now, targetDate, units)` rekent altijd van het eerdere naar het
latere moment; de richting (countdown/count-up) volgt uit `direction: 'future' | 'past' | 'now'`.
Het resultaat wordt ieder tik opnieuw berekend vanuit de actuele tijd — er wordt nooit één
seconde per seconde bijgeteld, zodat browser-throttling op achtergrondtabbladen geen invloed
heeft.

**Kalendersemantiek.**

- *Maanden* zijn kalendergebaseerd: een maand is vol wanneer `addMonths(start, n) ≤ einde`.
  `addMonths` klemt de dag van de maand (31 jan + 1 maand = 28 feb).
- *Weken en dagen* zijn kalendergebaseerd: vanaf het maand-anker tellen we kalenderdagen.
  "1 dag" betekent daardoor "hetzelfde lokale klokmoment de volgende dag", ook over een
  zomer-/wintertijdovergang (die dag duurt dan 23 of 25 echte uren). Weken = 7 kalenderdagen,
  het restant blijft als dagen over.
- *Uren, minuten en seconden* zijn het echte tijdsverschil (milliseconden) ná het anker van de
  grotere eenheden — de laatste fractie van een dag dus, die bij een DST-overgang 23 of 25
  uur kan bevatten.

**Doorstroming.** Eenheden die niet geselecteerd zijn "verliezen" geen tijd: het restant loopt
door in de kleinste geselecteerde eenheid. Voorbeelden: maanden + uren geselecteerd → de dagen
na de volledige maanden verschijnen als totaal aantal uren; alleen seconden → het totaal
aantal seconden. Dit is bewust gekozen en gedocumenteerd in de code.

**`showSeconds`** bepaalt of de seconden-eenheid überhaupt meedoet
(`resolveUnits`): zonder die schakelaar verdwijnen seconden volledig, met de schakelaar
participeren ze in de digitale klok. Zo blijft de klok nooit "hangen" op `:00`.

**Presentatie** (`buildDurationDisplay`):

- Alleen geselecteerde eenheden, van groot naar klein; nulwaarden worden onderdrukt.
- Alle waarden nul → de kleinste geselecteerde eenheid blijft zichtbaar ("0 dagen",
  "0 seconden", "00:00:00") zodat de nulstatus expliciet is; er worden nooit negatieve of
  tijdelijk foutieve waarden getoond.
- Met de eenheid "uren" verschijnt een compacte digitale klok (`4 dagen, 08:42:15`, of
  `08:42` zonder seconden); zonder de eenheid uren verschijnen kleinere eenheden als tekst
  (`12 minuten, 34 seconden`). Het digitale deel gebruikt `tabular-nums` en 2-cijferige
  padding zodat getallen niet verspringen.
- Het `aria-label` bevat de volledige duur in woorden; de visuele blokken zijn daaraan
  ondergeschikt voor schermlezers (`role="timer"`).

## 6. Centrale klok en reactiviteit

`src/lib/stores/clock.svelte.ts` houdt één `now`-waarde bij ($state rune), bijgewerkt door
**één** `setInterval` (1000 ms) voor het hele dashboard. Kaarten lezen `clock.now` en
berekenen hun duur via `$derived`; door Svelte 5's fine-grained reactivity gaat alleen de
veranderende tekstfiche mee. Op `visibilitychange` wordt direct ververst. De klok start in een
`$effect` in de layout en ruimt interval en listener zelf op; tijdens SSR/before-hydration is
`now` null en tonen kaarten een neutrale placeholder (geen hydration mismatch).

De events-store (`src/lib/stores/events.svelte.ts`) beheert de lijst, de laadstatus
(`idle/loading/ready/error`, gescheiden van de opslagstatus) en alle mutaties. Mutaties zijn
optimistisch in het geheugen en worden daarna gepersisteerd; een opslagfout leidt tot een
zichtbare melding (banner + toast) en wordt gewist na de eerste geslaagde schrijfactie —
gegevens worden nooit stilzwijgend weggegooid.

## 7. Opslaglaag

`src/lib/db/storage.ts` (localForage):

- Sleutels: `event:<id>` per event en `events:index` als index van id's. Een ontbrekende index
  wordt gereconstrueerd via een sleutelscan.
- **Alle operaties lopen via een seriële wachtrij** (`enqueue`): snelle opeenvolgende
  schrijfacties (bijv. reageren op drag-events) overschrijven elkaar nooit in verkeerde
  volgorde; oudere asynchrone operaties kunnen nieuwere gegevens niet overschrijven.
- `saveEvent` / `updateEvent` / `deleteEvent` / `saveAllEvents` (voor vervangen-import) /
  `reorderEvents` / `exportEvents` / `importEvents` zijn de publieke API.
- `importEvents` ondersteunt `replace` (volledige vervanging) en `merge` (toevoegen; events met
  een bestaand id worden overgeslagen zodat bestaande gegevens behouden blijven) en is
  transactie-achtig: bij een fout vóór het wegschrijven verandert er niets.
- Quota-fouten worden herkend (`isQuotaError`) en in begrijpelijke Engelse meldingen aan de gebruiker gerapporteerd.

**Afbeeldingen** worden als data-URL in het event bewaard. `ImagePicker` begrenst de invoer
(8 MB, MIME-types PNG/JPEG/WebP/GIF), verkleint grote afbeeldingen via canvas naar max. 1920 px
(JPEG, kwaliteit 0,85 — kleine en niet-verkleinbare bestanden blijven onaangetast; GIF's gaan
niet door het canvas zodat animatie behouden blijft) en controleert het eindresultaat tegen de
opslaglimiet van de validatielaag.

## 8. Interface

- **Design system** in `src/app.css`: donker thema (standaard), CSS-variabelen voor kleuren,
  radii, schaduwen en spacing; herbruikbare knop-, veld- en schuifstijlen; zichtbare
  focusstijlen; `prefers-reduced-motion` wordt gerespecteerd (ook in confetti).
- **Kaarten** (`EventCard`) tonen badge (Aftellen/Nu/Voorbij/Sinds), titel, subtitel, de duur,
  het doelmoment en een actiemenu (bewerken, omhoog, omlaag, verwijderen). Foto's liggen onder
  een donkere gradient-overlay zodat tekst leesbaar blijft; accentkleur gaat via
  `--card-accent`.
- **Grid** (`EventGrid`) is responsive (`auto-fill, minmax(21rem, 1fr)`) en zonder
  horizontale overflow op mobiel; drag-and-drop via svelte-dnd-action met eigen
  drop-target-stijl. Verplaatsen kan ook via het kaartmenu (toegankelijk alternatief).
- **Formulier** (`EventForm`, modal) met live voorbeeldweergave van de opgeslagen wandklok
  (inclusief UTC-offset) en van de duur met de gekozen eenheden; veldvalidatie met Engelse
  meldingen, `aria-invalid`/`aria-describedby`, dubbele submits geblokkeerd, Escape/sluitknop
  en focusval in `Modal`.
- **Verwijderen** gaat via een bevestigingsdialoog (`ConfirmDialog`); er worden geen
  `alert()`/`prompt()` gebruikt.
- **Empty state**, laadskeletten en een foutpaneel met "Opnieuw proberen" zijn geïmplementeerd.
- **Confetti** (`src/lib/utils/confetti.ts`, dependency-vrij canvas) vuurt één keer bij de
  overgang van "toekomst" naar nul terwijl de kaart zichtbaar is (de overgang wordt per kaart
  bijgehouden, dus er is geen herhaling per seconde) en doet niets bij
  `prefers-reduced-motion`.

## 9. PWA en offline

Bewust klein gehouden (geen extra dependency):

- `static/manifest.webmanifest` (naam, kleuren, iconen — gegenereerd met
  `scripts/generate-icons.mjs`, een dependency-vrij Node-script) en een favicon.
- `static/sw.js`: navigaties zijn **network-first met cache-fallback** (updates worden nooit
  geblokkeerd door oude assets), gehashte build-assets onder `/_app/immutable/` zijn
  **cache-first** (bestandsnaam verandert per release, dus de cache kan niet verouderen),
  externe verzoeken worden niet gecachet. Oude caches worden bij activatie verwijderd.
- De applicatie werkt na het eerste laden offline voor de kern (opgeslagen timers tonen en
  bijwerken); externe afbeeldingen zijn optioneel en mogen offline verdwijnen.
- De service worker wordt alleen in productie geregistreerd.

## 10. Tests en kwaliteitscontrole (uitgevoerd)

- **92 unit- en integratietests** (Vitest, `npm test`), verdeeld over:
  - `tests/duration.test.ts` — countdown/count-up, exact nul, sub-seconde, maandlengtes,
    schrikkeljaren, weken/dagen, DST-overgangen (naar zomer- én wintertijd), doorstroming
    naar kleinste eenheden, en de presentatieregels van `buildDurationDisplay`.
  - `tests/date-time.test.ts` — offsets per seizoen, niet-bestaande en dubbele tijden,
    invalidatie, wandklok-parsing, roundtrip-stabiliteit.
  - `tests/validation.test.ts` — event-parse, accentkleur-normalisatie, formulierinvoer,
    importpayload (verkeerde app, nieuwere versie, ongeldige regels).
  - `tests/storage.test.ts` — opslagroundtrips (met fake-indexeddb), index-reconstructie,
    beschadigde records, seriële wachtrij bij gelijktijdige schrijfacties, vervangen,
    herordenen, exportformaat, import merge/replace, id-conflicten.
  - `tests/events-store.test.ts` — store-mutaties (toevoegen/bewerken/verwijderen/volgorde)
    in het geheugen.
- De tests draaien deterministisch in `TZ=Europe/Amsterdam`.
- `npm run check` (svelte-check + TypeScript): **0 fouten, 0 waarschuwingen**.
- `npm run build` (productie, adapter-static): **geslaagd**; de site wordt prerenderd naar
  `build/`.
- **End-to-end rooktest** (`tests/e2e/smoke.mjs`, Playwright + Chromium, handmatig uitvoerbaar):
  15/15 controles geslaagd op de productiebuild — lege staat, timer aanmaken, live seconden,
  bewerken, count-up, verplaatsen (menu én echte mouse-drag), volgorde na herladen, export
  (formaat + inhoud), import (toevoegen), ongeldige import geweigerd, verwijderen met
  bevestiging, afbeelding die na herladen terugkomt, confetti bij nul, mobiele viewport zonder
  horizontale overflow, en geen consolefouten.

## 11. Bestandsstructuur

```text
multiusetimer/
├── scripts/generate-icons.mjs      # dependency-vrije PNG-icoongenerator (Node)
├── src/
│   ├── lib/
│   │   ├── types.ts                # centrale types + exportformaat
│   │   ├── stores/
│   │   │   ├── clock.svelte.ts     # centrale klok (1 interval voor alles)
│   │   │   ├── events.svelte.ts    # reactieve applicatiestatus (runes)
│   │   │   └── notify.svelte.ts    # toasts
│   │   ├── db/storage.ts           # localForage, wachtrij, import/export
│   │   ├── utils/
│   │   │   ├── date-time.ts        # tijdzonebewuste parsing/formatting
│   │   │   ├── duration.ts         # duurberekening + presentatiemodel
│   │   │   ├── validation.ts       # validatie/normalisatie van alle input
│   │   │   ├── id.ts               # crypto.randomUUID + fallback
│   │   │   └── confetti.ts         # confetti bij nul
│   │   ├── components/
│   │   │   ├── EventCard.svelte
│   │   │   ├── EventGrid.svelte
│   │   │   ├── EventForm.svelte
│   │   │   ├── DurationDisplay.svelte
│   │   │   ├── ImagePicker.svelte
│   │   │   ├── Modal.svelte
│   │   │   ├── ConfirmDialog.svelte
│   │   │   ├── ImportDialog.svelte
│   │   │   └── NoticeHost.svelte
│   │   └── assets/favicon.svg
│   ├── routes/
│   │   ├── +layout.svelte          # fonts, klok-start, SW-registratie
│   │   ├── +layout.ts              # prerender
│   │   └── +page.svelte            # dashboard + samenstelling
│   ├── app.css                     # design tokens en basisstijlen
│   └── app.html
├── static/
│   ├── manifest.webmanifest
│   ├── sw.js                       # service worker (PWA-basis)
│   └── icons/                      # gegenereerde PNG-iconen
├── tests/                          # Vitest unit + integratie
│   └── e2e/smoke.mjs               # optionele browser-rooktest
├── README.md
└── PLAN.md
```

## 12. Bekende beperkingen en bewuste keuzes

- **Opslag is per browser/profiel.** Wissen van sitegegevens, privévensters en andere
  apparaten hebben elk hun eigen lege opslag; JSON-backups zijn de overbrugging.
- **Data-URL-foto's** vergroten de opslag en de exportbestanden; het uploadoptie is daarom
  begrensd en verkleint grote afbeeldingen automatisch.
- **Tijden die niet bestaan** (naar zomertijd) en **dubbele tijden** (naar wintertijd) krijgen
  een deterministische, ondubbelzinnige interpretatie (zie §4); de exacte offset staat zichtbaar
  in het formulier.
- **npm audit** meldt een handvol advisories die alleen met SvelteKit 3 op te lossen zijn; deze
  raken de statische, serverloze deployment niet (zie §2).
- De teller loopt op secondenprecisie; de invoer van het doelmoment is op minuutprecisie.
- PWA-ondersteuning is bewust minimaal en eerlijk: cache van eigen build-assets en navigaties;
  er worden geen claims gemaakt over volledige offline dekking van externe afbeeldingen.
