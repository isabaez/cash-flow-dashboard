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
	const enc = (channel) => (channel <= 0.0031308 ? 12.92 * channel : 1.055 * channel ** (1 / 2.4) - 0.055);
	return lin.map((channel) => Math.min(1, Math.max(0, enc(channel))));
}

const linearize = (channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);

/** WCAG relative luminance of a gamma-encoded sRGB triple. */
function luminance([red, green, blue]) {
	const [linearRed, linearGreen, linearBlue] = [red, green, blue].map(linearize);
	return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function ratio(fg, bg) {
	const [hi, lo] = [luminance(fg), luminance(bg)].sort((left, right) => right - left);
	return (hi + 0.05) / (lo + 0.05);
}

/** Euclidean distance in OKLab — perceptual difference between two colours. */
const deltaEOk = (left, right) => Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

/** Floor for "these two categorical colours are clearly different". ~0.10 is the
 *  just-noticeable threshold. Tableau 10 — a professionally designed reference
 *  palette — bottoms out at 0.084, so this floor is set above it; our palettes
 *  clear 0.11. Series identity itself does not rest on colour (SC 1.4.1): charts
 *  add dash patterns and point styles as a redundant encoding. */
const DE_MIN = 0.10;

/** Source-over composite of a translucent colour onto an opaque one. */
const over = (fg, alpha, bg) => fg.map((channel, index) => channel * alpha + bg[index] * (1 - alpha));

// --- token parsing ----------------------------------------------------------

const css = readFileSync(SRC, 'utf8');

function parseTheme(name) {
	const block = css.match(new RegExp(`@mixin ${name} \\{([\\s\\S]*?)\\n\\}`));
	if (!block) throw new Error(`could not find @mixin ${name} in _tokens.scss`);
	const tokens = {};
	for (const line of block[1].split('\n')) {
		const match = line.match(/^\s*(--[\w-]+):\s*oklch\(([^)]+)\)\s*;/);
		if (!match) continue;
		const [, key, args] = match;
		const [coords, alphaRaw] = args.split('/').map((part) => part.trim());
		const [L, C, hDeg] = coords.split(/\s+/).map(Number);
		const h = ((hDeg ?? 0) * Math.PI) / 180;
		tokens[key] = {
			rgb: oklchToRgb(L, C, hDeg ?? 0),
			lab: [L, C * Math.cos(h), C * Math.sin(h)],
			alpha: alphaRaw ? Number(alphaRaw) : 1
		};
	}
	return tokens;
}

/** Resolve a token to an opaque triple, compositing over `bg` when translucent. */
function solid(theme, key, bg) {
	const token = theme[key];
	if (!token) throw new Error(`unknown token ${key}`);
	return token.alpha === 1 ? token.rgb : over(token.rgb, token.alpha, bg);
}

// --- the gates --------------------------------------------------------------

const failures = [];
let checks = 0;

function gate(themeName, label, fg, bg, min) {
	checks++;
	const measured = ratio(fg, bg);
	const pass = measured >= min;
	if (!pass) failures.push({ themeName, label, measured, min });
	return { measured, pass };
}

function auditTheme(themeName, theme) {
	const rows = [];
	const surfaces = ['--surface-0', '--surface-1', '--surface-2', '--surface-3'];

	const record = (label, fg, bg, min) => {
		const { measured, pass } = gate(themeName, label, fg, bg, min);
		rows.push({ label, measured, min, pass });
	};

	// Text on every surface it can land on.
	for (const surface of surfaces) {
		const bg = theme[surface].rgb;
		for (const text of ['--text-primary', '--text-secondary', '--text-tertiary']) {
			record(`${text} on ${surface}`, theme[text].rgb, bg, 4.5);
		}
	}

	// Control boundaries and focus — non-text, 3:1.
	for (const surface of ['--surface-0', '--surface-1', '--surface-2']) {
		record(`--border-strong on ${surface}`, theme['--border-strong'].rgb, theme[surface].rgb, 3);
		record(`--focus-ring on ${surface}`, theme['--focus-ring'].rgb, theme[surface].rgb, 3);
	}

	// Semantic colours used as text (deltas, amounts, links, errors).
	for (const surface of ['--surface-1', '--surface-2']) {
		const bg = theme[surface].rgb;
		for (const ink of ['--accent', '--pos', '--neg']) {
			record(`${ink} as text on ${surface}`, theme[ink].rgb, bg, 4.5);
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
	const series = Array.from({ length: 10 }, (_, index) => `--chart-${index + 1}`);
	for (const chartToken of series) record(`${chartToken} on --surface-1`, theme[chartToken].rgb, theme['--surface-1'].rgb, 3);

	// …and tellable apart from each other. Perceptual distance, not luminance.
	for (let index = 0; index < series.length; index++) {
		for (let otherIndex = index + 1; otherIndex < series.length; otherIndex++) {
			checks++;
			const distance = deltaEOk(theme[series[index]].lab, theme[series[otherIndex]].lab);
			const pass = distance >= DE_MIN;
			if (!pass) {
				failures.push({ themeName, label: `${series[index]} vs ${series[otherIndex]}`, measured: distance, min: DE_MIN });
			}
			rows.push({ label: `dE ${series[index]} vs ${series[otherIndex]}`, measured: distance, min: DE_MIN, pass });
		}
	}

	return rows;
}

const verbose = process.argv.includes('--verbose');
const themes = { dark: parseTheme('theme-dark'), light: parseTheme('theme-light') };

for (const [name, theme] of Object.entries(themes)) {
	const rows = auditTheme(name, theme);
	const bad = rows.filter((row) => !row.pass);
	console.log(`\n${name.toUpperCase()}  ${rows.length - bad.length}/${rows.length} pass`);
	for (const row of verbose ? rows : bad) {
		console.log(
			`  ${row.pass ? 'ok  ' : 'FAIL'} ${row.measured.toFixed(2).padStart(6)} (min ${row.min})  ${row.label}`
		);
	}
}

if (failures.length) {
	console.error(`\n${failures.length} of ${checks} contrast checks failed.`);
	process.exit(1);
}
console.log(`\nAll ${checks} contrast checks pass.`);
