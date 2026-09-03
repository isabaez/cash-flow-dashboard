/**
 * Colour helpers for user-chosen values.
 *
 * Category colours come from a `<input type="color">` on the Categories page, so
 * they are completely unconstrained — a user can pick #000000 and make the tag
 * unreadable on the dark theme, or #FFFF00 and make it unreadable on the light one.
 * `readableOn` keeps the hue and chroma the user chose (so the tag still reads as
 * "their" colour) and moves only lightness, the minimum distance needed to clear
 * 4.5:1 against the card it sits on.
 */

import type { ResolvedTheme } from '$lib/theme.svelte';

/** Mirrors --surface-1 in _tokens.scss for each theme. Keep in step with it. */
const SURFACE_1: Record<ResolvedTheme, [number, number, number]> = {
	dark: [0.205, 0.011, 258],
	light: [1, 0, 0]
};

const TARGET_CONTRAST = 4.5;

const encode = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const decode = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

function oklchToLinear(L: number, C: number, hDeg: number): [number, number, number] {
	const h = (hDeg * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
}

/** WCAG relative luminance of an OKLCH triple, clamped into the sRGB gamut. */
function luminanceOf(L: number, C: number, h: number): number {
	const [r, g, b] = oklchToLinear(L, C, h).map((v) =>
		decode(Math.min(1, Math.max(0, encode(v))))
	);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: number, b: number) =>
	(Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** #RRGGBB (or #RGB) to OKLCH. Returns null for anything unparseable. */
export function hexToOklch(hex: string): [number, number, number] | null {
	let value = hex.trim().replace('#', '');
	if (value.length === 3) value = value.replace(/./g, (c) => c + c);
	if (!/^[0-9a-f]{6}$/i.test(value)) return null;

	const [r, g, b] = [0, 2, 4].map((i) => decode(parseInt(value.slice(i, i + 2), 16) / 255));
	const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
	const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
	const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const hue = (Math.atan2(B, A) * 180) / Math.PI;
	return [L, Math.hypot(A, B), hue < 0 ? hue + 360 : hue];
}

const cache = new Map<string, string>();

/**
 * A CSS colour derived from `hex` that clears 4.5:1 as text on the current
 * theme's card surface. Hue and chroma are preserved; only lightness moves, and
 * only as far as it has to. Unparseable input falls back to the body text colour.
 */
export function readableOn(hex: string, theme: ResolvedTheme): string {
	const key = `${hex}|${theme}`;
	const hit = cache.get(key);
	if (hit) return hit;

	const parsed = hexToOklch(hex);
	if (!parsed) return 'var(--text-primary)';

	const [L, C, h] = parsed;
	const [sl, sc, sh] = SURFACE_1[theme];
	const surfaceLuminance = luminanceOf(sl, sc, sh);

	let result: string;
	if (contrast(luminanceOf(L, C, h), surfaceLuminance) >= TARGET_CONTRAST) {
		result = `oklch(${L.toFixed(4)} ${C.toFixed(4)} ${h.toFixed(2)})`;
	} else {
		// Push away from the surface: lighter on dark, darker on light. Binary search
		// for the closest lightness that clears the target.
		const away = theme === 'dark' ? 1 : 0;
		let lo = L;
		let hi = away;
		for (let i = 0; i < 30; i++) {
			const mid = (lo + hi) / 2;
			if (contrast(luminanceOf(mid, C, h), surfaceLuminance) >= TARGET_CONTRAST) hi = mid;
			else lo = mid;
		}
		result = `oklch(${hi.toFixed(4)} ${C.toFixed(4)} ${h.toFixed(2)})`;
	}

	cache.set(key, result);
	return result;
}
