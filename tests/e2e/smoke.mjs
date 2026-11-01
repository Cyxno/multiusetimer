/**
 * Optionele E2E-rooktest (vereist een apart geïnstalleerde Playwright + Chromium,
 * zie README.md). Draait tegen de productiebuild via `npm run preview`.
 *
 * E2E-rooktest voor MultiUseTimer (productiebuild via vite preview).
 * Loopt de volledige gebruikersflow door: lege staat → aanmaken → tellen →
 * bewerken → volgorde → herladen (persistentie) → export → import → verwijderen.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = 'http://localhost:4173/';
const results = [];
const consoleErrors = [];

function check(name, condition, extra = '') {
	results.push({ name, pass: Boolean(condition), extra });
	console.log(`${condition ? '✓' : '✗'} ${name}${extra ? ' — ' + extra : ''}`);
}

// Optioneel: pad naar libnss3/libnspr4 wanneer het systeem die niet standaard bevat.
const NSS_LIBS = process.env.CHROMIUM_LD_LIBRARY_PATH || '';
const browser = await chromium.launch({
	env: NSS_LIBS ? { ...process.env, LD_LIBRARY_PATH: NSS_LIBS } : process.env
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
page.on('console', (msg) => {
	if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => consoleErrors.push(String(err)));

// 1. Lege staat
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'No timers yet' }).waitFor({ timeout: 8000 });
await page.waitForTimeout(900); // hydratatie voltooien
check('lege staat wordt getoond', true);

// 2. Timer aanmaken
await page.getByRole('button', { name: 'New timer' }).click();
await page.locator('#event-title').waitFor({ timeout: 5000 });
await page.locator('#event-title').fill('Holiday Portugal');
await page.getByLabel('Subtitle').fill('The whole family');
const dateInput = page.locator('#event-date');
await dateInput.fill('2027-04-01');
await page.locator('#event-time').fill('09:00');
await page.screenshot({ path: '/tmp/e2e/form.png' });
await page.getByRole('dialog', { name: 'New timer' }).getByRole('button', { name: 'Add timer' }).click();
await page.getByRole('heading', { name: 'Holiday Portugal' }).waitFor({ timeout: 5000 });
check('timer aanmaken werkt', true);

// 3. Teller loopt (seconden veranderen)
const durationText = page.locator('[role="timer"]').first();
const first = await durationText.textContent();
await page.waitForTimeout(1500);
const second = await durationText.textContent();
check('centrale klok laat de teller lopen', first !== second, `"${first?.trim()}" → "${second?.trim()}"`);

// 4. Bewerken
await page.getByRole('button', { name: 'Actions for Holiday Portugal' }).click();
await page.getByRole('menuitem', { name: 'Edit' }).click();
await page.locator('#event-title').fill('Holiday Algarve');
await page.getByRole('button', { name: 'Save changes' }).click();
await page.getByRole('heading', { name: 'Holiday Algarve' }).waitFor({ timeout: 5000 });
check('timer bewerken werkt', true);

// 5. Tweede timer + volgorde via toegankelijk verplaatsen
await page.getByRole('button', { name: 'New timer' }).click();
await page.locator('#event-title').waitFor({ timeout: 5000 });
await page.locator('#event-title').fill('Count-up test');
await page.locator('#event-date').fill('2024-01-01');
await page.locator('#event-time').fill('12:00');
await page.getByRole('dialog', { name: 'New timer' }).getByRole('button', { name: 'Add timer' }).click();
await page.getByRole('heading', { name: 'Count-up test' }).waitFor({ timeout: 5000 });
check('count-up timer (verleden) aangemaakt', true);

const titles = () => page.locator('.grid__cell h2').allTextContents();
let order = await titles();
check('volgorde initieel', JSON.stringify(order) === JSON.stringify(['Holiday Algarve', 'Count-up test']), JSON.stringify(order));

await page.getByRole('button', { name: 'Actions for Holiday Algarve' }).click();
await page.getByRole('menuitem', { name: 'Move down' }).click();
await page.waitForTimeout(400);
order = await titles();
check('omlaag verplaatsen werkt', JSON.stringify(order) === JSON.stringify(['Count-up test', 'Holiday Algarve']), JSON.stringify(order));

// 6. Persistentie na herladen
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('heading', { name: 'Count-up test' }).waitFor({ timeout: 6000 });
order = await titles();
check('volgorde blijft behouden na herladen', JSON.stringify(order) === JSON.stringify(['Count-up test', 'Holiday Algarve']), JSON.stringify(order));
const persisted = await page.locator('[role="timer"]').first().textContent();
check('teller herstelt na herladen', Boolean(persisted && /\d/.test(persisted)), persisted?.trim());

// 7. Export downloaden
const downloadPromise = page.waitForEvent('download');
await page.getByRole('button', { name: /Export/ }).click();
const download = await downloadPromise;
const exportPath = '/tmp/e2e/backup.json';
await download.saveAs(exportPath);
const exported = JSON.parse(readFileSync(exportPath, 'utf8'));
check(
	'JSON-export werkt',
	exported.app === 'MultiUseTimer' && exported.version === 1 && exported.events.length === 2,
	`${exported.events.length} events`
);

// 8. Importeren (toevoegen) met een bestand met één nieuwe en één dubbele timer
const importPayload = {
	app: 'MultiUseTimer',
	version: 1,
	exportedAt: new Date().toISOString(),
	events: [
		...exported.events,
		{
			id: 'imported-1111-2222-4333-8444',
			title: 'Imported timer',
			mode: 'countdown',
			targetDate: '2028-01-01T00:00:00+01:00',
			image: null,
			units: ['months', 'days'],
			showSeconds: false,
			order: 0,
			createdAt: '2026-11-01T00:00:00.000Z'
		}
	]
};
const importPath = '/tmp/e2e/import.json';
writeFileSync(importPath, JSON.stringify(importPayload, null, 2));

await page.getByRole('button', { name: 'Import', exact: true }).click();
const fileInput = page.locator('input[type="file"]');
await fileInput.setInputFiles(importPath);
await page.getByText('valid timer').waitFor({ timeout: 5000 });
await page.getByRole('button', { name: 'Import', exact: true }).last().click();
await page.getByRole('heading', { name: 'Imported timer' }).waitFor({ timeout: 6000 });
check('JSON-import (toevoegen) werkt', (await titles()).length === 3, JSON.stringify(await titles()));

// 9. Ongeldige import wordt geweigerd
const badPath = '/tmp/e2e/bad.json';
writeFileSync(badPath, JSON.stringify({ app: 'AndereApp', version: 1, events: [] }));
await page.getByRole('button', { name: 'Import', exact: true }).click();
await page.locator('input[type="file"]').setInputFiles(badPath);
await page.getByRole('alert').filter({ hasText: 'not a MultiUseTimer backup' }).waitFor({ timeout: 5000 });
check('ongeldige import wordt afgewezen', true);
await page.getByRole('button', { name: 'Cancel' }).click();

// 10. Verwijderen met bevestiging
await page.getByRole('button', { name: 'Actions for Imported timer' }).click();
await page.getByRole('menuitem', { name: 'Delete' }).click();
await page.getByRole('button', { name: 'Delete', exact: true }).last().click();
await page.waitForTimeout(500);
check('verwijderen met bevestiging werkt', (await titles()).length === 2, JSON.stringify(await titles()));

// 11. Screenshots desktop + mobiel
await page.screenshot({ path: '/tmp/e2e/dashboard-desktop.png', fullPage: true });
const mobile = await context.newPage();
await mobile.setViewportSize({ width: 390, height: 844 });
await mobile.goto(BASE, { waitUntil: 'networkidle' });
await mobile.getByRole('heading', { name: 'Count-up test' }).waitFor({ timeout: 6000 });
await mobile.screenshot({ path: '/tmp/e2e/dashboard-mobile.png', fullPage: true });
const hasHorizontalOverflow = await mobile.evaluate(
	() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
);
check('geen horizontale overflow op mobiel', !hasHorizontalOverflow);

// 12. Consolefouten
check('geen consolefouten', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks geslaagd`);
process.exit(failed.length > 0 ? 1 : 0);
