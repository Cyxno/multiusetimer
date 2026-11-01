/**
 * Generatie van unieke ID's.
 *
 * Gebruikt `crypto.randomUUID()` wanneer beschikbaar, met een fallback op
 * een v4-achtig UUID-formaat via `crypto.getRandomValues()` of als laatste
 * redmiddel `Math.random()` (bijv. in oudere omgevingen).
 */
export function createId(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	const bytes = new Uint8Array(16);
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		crypto.getRandomValues(bytes);
	} else {
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = Math.floor(Math.random() * 256);
		}
	}

	// UUID versie 4 en variant-bit zetten.
	bytes[6] = (bytes[6] & 0x0f) | 0x40;
	bytes[8] = (bytes[8] & 0x3f) | 0x80;

	const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
	const h = (from: number, to: number) => hex.slice(from, to).join('');
	return `${h(0, 4)}-${h(4, 6)}-${h(6, 8)}-${h(8, 10)}-${h(10, 16)}`;
}
