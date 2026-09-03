#!/usr/bin/env node
// Contrast gate for the semantic token layer. Parses the two theme mixins out of
// src/lib/styles/_tokens.scss, converts OKLCH to sRGB the way a browser does, and
// asserts the WCAG 2.2 ratios the design direction promises.
//
//   text vs. its surface          >= 4.5:1  (SC 1.4.3 Contrast Minimum)
//   --border-strong vs. surface   >= 3.0:1  (SC 1.4.11 Non-text Contrast)
//   focus ring vs. surface        >= 3.0:1  (SC 1.4.11)
//   chart series vs. its card     >= 3.0:1  (SC 1.4.11 — meaningful graphics)
//
// Categorical series are NOT gated on pairwise luminance contrast: luminance is one
// dimension, and 3:1 steps only fit ~4 distinct levels, so no 10-colour palette can
// satisfy it (Tableau 10, ColorBrewer and Carbon all decline to claim it either).
// Pairwise separation is gated on OKLab dE instead — a perceptual distance, which is
// the right metric for "are these two hues tellable apart". WCAG conformance for
// series identity comes from the redundant non-colour encoding (dash patterns, point
// styles, direct labels) that ChartFigure applies, per SC 1.4.1 Use of Colour.
//
// Run: node scripts/check-contrast.mjs   (npm run check:contrast)

import { readFileSync } from 'node:fs';

const SRC = new URL('../src/lib/styles/_tokens.scss', import.meta.url);

// --- colour maths -----------------------------------------------------------

/** OKLCH -> gamma-encoded sRGB in 0..1, clamped into gamut like a display would. */
function oklchToRgb(L, C, hDeg) {
	const h = (hDeg * Math.PI) / 180;
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);

	const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
	const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
	const s_ = L - 0.0894841775 * a - 1.291485548 * b;
	const [l, m, s] = [l_ ** 3, m_ ** 3, s_ ** 3];

	const lin = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
	];
	const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
	return lin.map((v) => Math.min(1, Math.max(0, enc(v))));
}

const linearize = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of a gamma-encoded sRGB triple. */
function luminance([r, g, b]) {
	const [R, G, B] = [r, g, b].map(linearize);
	return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function ratio(fg, bg) {
	const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
	return (hi + 0.05) / (lo + 0.05);
}

/** Euclidean distance in OKLab — perceptual difference between two colours. */
const deltaEOk = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Floor for "these two categorical colours are clearly different". ~0.10 is the
 *  just-noticeable threshold. Tableau 10 — a professionally designed reference
 *  palette — bottoms out at 0.084, so this floor is set above it; our palettes
 *  clear 0.11. Series identity itself does not rest on colour (SC 1.4.1): charts
 *  add dash patterns and point styles as a redundant encoding. */
const DE_MIN = 0.10;

/** Source-over composite of a translucent colour onto an opaque one. */
const over = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

// --- token parsing ----------------------------------------------------------

const css = readFileSync(SRC, 'utf8');

function parseTheme(name) {
	const block = css.match(new RegExp(`@mixin ${name} \\{([\\s\\S]*?)\\n\\}`));
	if (!block) throw new Error(`could not find @mixin ${name} in _tokens.scss`);
	const tokens = {};
	for (const line of block[1].split('\n')) {
		const m = line.match(/^\s*(--[\w-]+):\s*oklch\(([^)]+)\)\s*;/);
		if (!m) continue;
		const [, key, args] = m;
		const [coords, alphaRaw] = args.split('/').map((s) => s.trim());
		const [L, C, H] = coords.split(/\s+/).map(Number);
		const h = ((H ?? 0) * Math.PI) / 180;
		tokens[key] = {
			rgb: oklchToRgb(L, C, H ?? 0),
			lab: [L, C * Math.cos(h), C * Math.sin(h)],
			alpha: alphaRaw ? Number(alphaRaw) : 1
		};
	}
	return tokens;
}

/** Resolve a token to an opaque triple, compositing over `bg` when translucent. */
function solid(theme, key, bg) {
	const t = theme[key];
	if (!t) throw new Error(`unknown token ${key}`);
	return t.alpha === 1 ? t.rgb : over(t.rgb, t.alpha, bg);
}

// --- the gates --------------------------------------------------------------

const failures = [];
let checks = 0;

function gate(themeName, label, fg, bg, min) {
	checks++;
	const r = ratio(fg, bg);
	const pass = r >= min;
	if (!pass) failures.push({ themeName, label, r, min });
	return { r, pass };
}

function auditTheme(themeName, theme) {
	const rows = [];
	const surfaces = ['--surface-0', '--surface-1', '--surface-2', '--surface-3'];

	const record = (label, fg, bg, min) => {
		const { r, pass } = gate(themeName, label, fg, bg, min);
		rows.push({ label, r, min, pass });
	};

	// Text on every surface it can land on.
	for (const s of surfaces) {
		const bg = theme[s].rgb;
		for (const t of ['--text-primary', '--text-secondary', '--text-tertiary']) {
			record(`${t} on ${s}`, theme[t].rgb, bg, 4.5);
		}
	}

	// Control boundaries and focus — non-text, 3:1.
	for (const s of ['--surface-0', '--surface-1', '--surface-2']) {
		record(`--border-strong on ${s}`, theme['--border-strong'].rgb, theme[s].rgb, 3);
		record(`--focus-ring on ${s}`, theme['--focus-ring'].rgb, theme[s].rgb, 3);
	}

	// Semantic colours used as text (deltas, amounts, links, errors).
	for (const s of ['--surface-1', '--surface-2']) {
		const bg = theme[s].rgb;
		for (const t of ['--accent', '--pos', '--neg']) {
			record(`${t} as text on ${s}`, theme[t].rgb, bg, 4.5);
		}
	}

	// Soft tints are backgrounds — their own text must still read on them.
	for (const [tint, ink] of [
		['--accent-soft', '--accent'],
		['--pos-soft', '--pos'],
		['--neg-soft', '--neg']
	]) {
		const bg = solid(theme, tint, theme['--surface-1'].rgb);
		record(`${ink} on ${tint} over --surface-1`, theme[ink].rgb, bg, 4.5);
	}

	// Filled accent button.
	record('--accent-fg on --accent', theme['--accent-fg'].rgb, theme['--accent'].rgb, 4.5);

	// Chart series must be perceivable against the card they are drawn on.
	const series = Array.from({ length: 10 }, (_, i) => `--chart-${i + 1}`);
	for (const c of series) record(`${c} on --surface-1`, theme[c].rgb, theme['--surface-1'].rgb, 3);

	// …and tellable apart from each other. Perceptual distance, not luminance.
	for (let i = 0; i < series.length; i++) {
		for (let j = i + 1; j < series.length; j++) {
			checks++;
			const d = deltaEOk(theme[series[i]].lab, theme[series[j]].lab);
			const pass = d >= DE_MIN;
			if (!pass) {
				failures.push({ themeName, label: `${series[i]} vs ${series[j]}`, r: d, min: DE_MIN });
			}
			rows.push({ label: `dE ${series[i]} vs ${series[j]}`, r: d, min: DE_MIN, pass });
		}
	}

	return rows;
}

const verbose = process.argv.includes('--verbose');
const themes = { dark: parseTheme('theme-dark'), light: parseTheme('theme-light') };

for (const [name, theme] of Object.entries(themes)) {
	const rows = auditTheme(name, theme);
	const bad = rows.filter((r) => !r.pass);
	console.log(`\n${name.toUpperCase()}  ${rows.length - bad.length}/${rows.length} pass`);
	for (const r of verbose ? rows : bad) {
		console.log(
			`  ${r.pass ? 'ok  ' : 'FAIL'} ${r.r.toFixed(2).padStart(6)} (min ${r.min})  ${r.label}`
		);
	}
}

if (failures.length) {
	console.error(`\n${failures.length} of ${checks} contrast checks failed.`);
	process.exit(1);
}
console.log(`\nAll ${checks} contrast checks pass.`);
