<script lang="ts">
	import type { Chart as ChartJS, ChartData, ChartOptions, ChartType } from 'chart.js';
	import { theme } from '$lib/theme.svelte';
	import { readChartTokens } from '$lib/chart';

	let {
		type,
		data,
		options = {},
		label,
		decorative = false
	}: {
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		/** Accessible name for the canvas, used when this is not wrapped in a ChartFigure. */
		label: string;
		/**
		 * Set when the surrounding markup already carries the caption, description and
		 * a data table (i.e. ChartFigure). The canvas is then redundant to a screen
		 * reader, and hiding it avoids announcing the same description twice.
		 */
		decorative?: boolean;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartJS | null = null;
	/** Which theme the current canvas was painted with — asserted in verification. */
	let renderedTheme = $state('');

	// chart.js is loaded lazily so it stays out of the server bundle and other pages.
	// `theme.resolved` is read inside the effect on purpose: a theme switch has to
	// tear the chart down and rebuild it, because the palette is baked into the
	// canvas at draw time and cannot be restyled by CSS.
	$effect(() => {
		const resolved = theme.resolved;
		const config = { type, data, options };
		let cancelled = false;

		(async () => {
			const { Chart } = await import('chart.js/auto');
			if (cancelled || !canvas) return;

			void resolved;
			const tokens = readChartTokens();
			Chart.defaults.color = tokens.muted;
			Chart.defaults.borderColor = tokens.grid;
			Chart.defaults.font.family = getComputedStyle(document.documentElement)
				.getPropertyValue('--font-sans')
				.trim();
			// Respect the OS motion setting — the global CSS rule cannot reach a canvas.
			Chart.defaults.animation = window.matchMedia('(prefers-reduced-motion: reduce)').matches
				? false
				: { duration: 400 };

			chart?.destroy();
			chart = new Chart(canvas, config as never);
			renderedTheme = resolved;
		})();

		return () => {
			cancelled = true;
			chart?.destroy();
			chart = null;
		};
	});
</script>

<div class="chart" data-rendered-theme={renderedTheme}>
	{#if decorative}
		<canvas bind:this={canvas} aria-hidden="true"></canvas>
	{:else}
		<!-- svelte-ignore a11y_no_interactive_element_to_noninteractive_role -->
		<!-- A canvas is opaque to assistive tech, so it is announced as a single
		     graphic with a description. ARIA in HTML permits any role on <canvas>;
		     Svelte's lint assumes it is interactive, which it is not here. -->
		<canvas bind:this={canvas} role="img" aria-label={label}></canvas>
	{/if}
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		min-height: var(--chart-height, 320px);
	}
</style>
