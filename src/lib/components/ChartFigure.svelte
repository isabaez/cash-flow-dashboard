<script lang="ts">
	/**
	 * A chart plus the things that make it usable without seeing it.
	 *
	 * A <canvas> is opaque to assistive technology, so the canvas here is NOT
	 * decorative: it carries role="img" and an accessible name built from the
	 * caption and description. `captionHidden` keeps that name intact on cards
	 * that carry their own visible heading (or none by design) — the text still
	 * reaches screen readers, it just isn't drawn.
	 */
	import type { ChartData, ChartOptions, ChartType } from 'chart.js';
	import Chart from '$lib/components/Chart.svelte';

	let {
		title,
		description,
		type,
		data,
		options = {},
		height,
		captionHidden = false
	}: {
		title: string;
		/** One-sentence summary of what the chart shows — part of the canvas's accessible name. */
		description: string;
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		height?: string;
		/** Keeps caption and description in the accessibility tree but out of the layout. */
		captionHidden?: boolean;
	} = $props();
</script>

<figure class="chart-figure" style:--chart-height={height}>
	<figcaption class="chart-figure__caption" class:visually-hidden={captionHidden}>{title}</figcaption>
	<p class="chart-figure__description" class:visually-hidden={captionHidden}>{description}</p>

	<Chart {type} {data} {options} label="{title}. {description}" />
</figure>

<style lang="scss">
	.chart-figure {
		margin: 0;
		min-inline-size: 0;

		&__caption {
			font-size: var(--text-md);
			font-weight: 600;
			letter-spacing: -0.015em;
			color: var(--text-primary);
		}

		&__description {
			margin: var(--space-1) 0 var(--space-4);
			font-size: var(--text-sm);
			color: var(--text-secondary);
			max-width: 74ch;
		}
	}
</style>
