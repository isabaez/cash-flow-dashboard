<script lang="ts">
	import type { Chart as ChartJS, ChartData, ChartOptions, ChartType } from 'chart.js';

	let {
		type,
		data,
		options = {},
		label
	}: {
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		/** Accessible description of the chart for screen readers */
		label: string;
	} = $props();

	let canvas = $state<HTMLCanvasElement>();
	let chart: ChartJS | null = null;

	// chart.js is loaded lazily so it stays out of the server bundle and other pages.
	$effect(() => {
		const config = { type, data, options };
		let cancelled = false;

		(async () => {
			const { Chart } = await import('chart.js/auto');
			if (cancelled || !canvas) return;

			Chart.defaults.color = '#97a0b3';
			Chart.defaults.borderColor = '#232b38';
			Chart.defaults.font.family =
				"system-ui, -apple-system, 'Segoe UI', sans-serif";

			chart?.destroy();
			chart = new Chart(canvas, config as never);
		})();

		return () => {
			cancelled = true;
			chart?.destroy();
			chart = null;
		};
	});
</script>

<div class="chart">
	<canvas bind:this={canvas} aria-label={label}></canvas>
</div>

<style>
	.chart {
		position: relative;
		width: 100%;
		min-height: 320px;
	}
</style>
