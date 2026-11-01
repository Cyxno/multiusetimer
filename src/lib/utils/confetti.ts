/**
 * Subtiele confetti wanneer een countdown nul bereikt.
 *
 * Zelfgebouwde canvas-variant zonder dependency: één overlay per afschot,
 * ruimt zichzelf na ~2,5 s weer op. Respecteert `prefers-reduced-motion`
 * (doet dan niets). De aanroepende code zorgt dat dit één keer per
 * overgang gebeurt, niet iedere seconde opnieuw.
 */

interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	size: number;
	rotation: number;
	rotationSpeed: number;
	color: string;
	shape: 0 | 1;
}

const COLORS = ['#6c8cff', '#22d3ee', '#34d399', '#fbbf24', '#f472b6', '#a78bfa'];
const DURATION_MS = 2500;

export function fireConfetti(originX?: number, originY?: number): void {
	if (typeof window === 'undefined' || typeof document === 'undefined') return;
	if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

	const canvas = document.createElement('canvas');
	canvas.setAttribute('aria-hidden', 'true');
	canvas.style.cssText =
		'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;';

	const context = canvas.getContext('2d');
	if (!context) return;

	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const width = window.innerWidth;
	const height = window.innerHeight;
	canvas.width = Math.floor(width * dpr);
	canvas.height = Math.floor(height * dpr);
	context.scale(dpr, dpr);
	document.body.appendChild(canvas);

	const origin = {
		x: originX ?? width / 2,
		y: originY ?? height * 0.35
	};

	const particles: Particle[] = [];
	const count = 90;
	for (let i = 0; i < count; i++) {
		const angle = Math.random() * Math.PI * 2;
		const speed = 220 + Math.random() * 320;
		particles.push({
			x: origin.x,
			y: origin.y,
			vx: Math.cos(angle) * speed,
			vy: Math.sin(angle) * speed - 160,
			size: 5 + Math.random() * 6,
			rotation: Math.random() * Math.PI * 2,
			rotationSpeed: (Math.random() - 0.5) * 12,
			color: COLORS[i % COLORS.length],
			shape: Math.random() > 0.5 ? 1 : 0
		});
	}

	const startedAt = performance.now();
	let previous = startedAt;

	const step = (time: number): void => {
		const elapsed = time - startedAt;
		const dt = Math.min((time - previous) / 1000, 0.05);
		previous = time;

		context.clearRect(0, 0, width, height);
		const fade = Math.max(0, 1 - elapsed / DURATION_MS);

		for (const particle of particles) {
			particle.vy += 620 * dt; // zwaartekracht
			particle.vx *= 0.985;
			particle.vy *= 0.995;
			particle.x += particle.vx * dt;
			particle.y += particle.vy * dt;
			particle.rotation += particle.rotationSpeed * dt;

			context.save();
			context.globalAlpha = fade;
			context.translate(particle.x, particle.y);
			context.rotate(particle.rotation);
			context.fillStyle = particle.color;
			if (particle.shape === 0) {
				context.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
			} else {
				context.beginPath();
				context.arc(0, 0, particle.size / 2.4, 0, Math.PI * 2);
				context.fill();
			}
			context.restore();
		}

		if (elapsed < DURATION_MS) {
			requestAnimationFrame(step);
		} else {
			canvas.remove();
		}
	};

	requestAnimationFrame(step);
}
