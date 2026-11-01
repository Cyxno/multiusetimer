/**
 * Genereert de PWA-pictogrammen (PNG) zonder externe dependencies:
 * een tweekleurig afgerond vlak met klok and handen, gepixeld berekend.
 *
 * Gebruik: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'static', 'icons');
mkdirSync(outDir, { recursive: true });

// ——— Minimale PNG-encoder (RGBA, 8 bit) ———

const CRC_TABLE = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		table[n] = c >>> 0;
	}
	return table;
})();

function crc32(buffer) {
	let crc = 0xffffffff;
	for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(typeAndData));
	return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(width, height, rgba) {
	const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;

	// Elke scanregel begint met filterbyte 0.
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}

	return Buffer.concat([
		signature,
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}

// ——— Tekenlogica ———

const TOP = [108, 140, 255]; // #6c8cff
const BOTTOM = [74, 99, 216]; // #4a63d8
const CLOCK = [11, 14, 23]; // #0b0e17
const DOT = [34, 211, 238]; // #22d3ee

function drawIcon(size, { maskable = false } = {}) {
	const rgba = Buffer.alloc(size * size * 4);
	const put = (x, y, [r, g, b], a = 255) => {
		if (x < 0 || y < 0 || x >= size || y >= size) return;
		const i = (y * size + x) * 4;
		rgba[i] = r;
		rgba[i + 1] = g;
		rgba[i + 2] = b;
		rgba[i + 3] = a;
	};

	const radius = size * (maskable ? 0 : 0.22);
	const inset = maskable ? 0 : 0;
	const artScale = maskable ? 0.72 : 1;

	const smooth = (edge0, edge1, value) => {
		const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
		return t * t * (3 - 2 * t);
	};

	const blend = (x, y, [r, g, b], alpha) => {
		const i = (y * size + x) * 4;
		const inv = 1 - alpha;
		rgba[i] = Math.round(rgba[i] * inv + r * alpha);
		rgba[i + 1] = Math.round(rgba[i + 1] * inv + g * alpha);
		rgba[i + 2] = Math.round(rgba[i + 2] * inv + b * alpha);
		rgba[i + 3] = 255;
	};

	const roundedRectAlpha = (px, py) => {
		const half = size / 2;
		const dx = Math.abs(px - half) - (half - radius - inset);
		const dy = Math.abs(py - half) - (half - radius - inset);
		const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0);
		return smooth(1.2, -0.2, outside);
	};

	// Achtergrond met verticale gradient.
	for (let y = 0; y < size; y++) {
		const t = y / (size - 1);
		const color = [
			Math.round(TOP[0] + (BOTTOM[0] - TOP[0]) * t),
			Math.round(TOP[1] + (BOTTOM[1] - TOP[1]) * t),
			Math.round(TOP[2] + (BOTTOM[2] - TOP[2]) * t)
		];
		for (let x = 0; x < size; x++) {
			put(x, y, color, maskable ? 255 : 0);
			if (!maskable) {
				const alpha = roundedRectAlpha(x + 0.5, y + 0.5);
				if (alpha > 0) {
					const i = (y * size + x) * 4;
					rgba[i + 3] = Math.round(alpha * 255);
				}
			}
		}
	}

	// Klok.
	const cx = size / 2;
	const cy = size / 2;
	const ringR = size * 0.265 * artScale;
	const ringW = size * 0.07 * artScale;
	const handW = ringW * 0.95;
	const dotR = size * 0.05 * artScale;
	const dotCx = size * (0.72 - 0.11 * (1 - artScale));
	const dotCy = size * (0.28 + 0.11 * (1 - artScale));

	const distToSegment = (px, py, ax, ay, bx, by) => {
		const abx = bx - ax;
		const aby = by - ay;
		const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby)));
		return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
	};

	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const px = x + 0.5;
			const py = y + 0.5;
			const d = Math.hypot(px - cx, py - cy);
			const ringAlpha = smooth(ringW * 0.55, -ringW * 0.2, Math.abs(d - ringR) - ringW * 0.15);

			// Wijzers: 12 uur → midden en midden → ±100 minuten.
			const minute = distToSegment(px, py, cx, cy, cx + ringR * 0.52, cy - ringR * 0.62);
			const hour = distToSegment(px, py, cx, cy, cx + ringR * 0.42, cy + ringR * 0.12);
			const handsAlpha = smooth(handW * 0.55, -handW * 0.2, Math.min(minute, hour) - handW * 0.15);

			const inkAlpha = Math.max(ringAlpha, handsAlpha);
			if (inkAlpha > 0) blend(x, y, CLOCK, inkAlpha);

			const dotDist = Math.hypot(px - dotCx, py - dotCy);
			const dotAlpha = smooth(dotR * 0.6, -dotR * 0.25, dotDist - dotR * 0.2);
			if (dotAlpha > 0) blend(x, y, DOT, dotAlpha);
		}
	}

	return encodePng(size, size, rgba);
}

const targets = [
	{ file: 'icon-192.png', size: 192 },
	{ file: 'icon-512.png', size: 512 },
	{ file: 'icon-maskable-512.png', size: 512, options: { maskable: true } }
];

for (const { file, size, options } of targets) {
	const png = drawIcon(size, options ?? {});
	writeFileSync(join(outDir, file), png);
	console.log(`${file}: ${png.length} bytes`);
}
