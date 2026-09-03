<script lang="ts">
	/**
	 * A chart plus the things that make it usable without seeing it.
	 *
	 * A <canvas> is opaque to assistive technology and carries no data — so every
	 * chart here is wrapped in a <figure> with a visible caption, a short text
	 * summary, and a "View as table" disclosure holding the same series as a real
	 * <table>. The table is derived from the chart's own `data`, so the two cannot
	 * drift apart. It also serves sighted users who want exact figures rather than
	 * a hover tooltip.
	 */
	import type { ChartData, ChartOptions, ChartType } from 'chart.js';
	import Chart from '$lib/components/Chart.svelte';

	let {
		title,
		description,
		type,
		data,
		options = {},
		format = (value: number | null) => (value === null ? '—' : String(value)),
		height
	}: {
		title: string;
		/** One-sentence summary of what the chart shows — read out before the table. */
		description: string;
		type: ChartType;
		data: ChartData;
		options?: ChartOptions;
		/** Renders a datapoint for the table. Charts hold dollars, so this is usually formatCents. */
		format?: (value: number | null) => string;
		height?: string;
	} = $props();

	const labels = $derived((data.labels ?? []) as string[]);

	// Projection twins and other decorative datasets are flagged `hideInLegend`;
	// they carry no data the actual series does not already show.
	const series = $derived(
		data.datasets
			.filter((ds) => !(ds as { hideInLegend?: boolean }).hideInLegend)
			.map((ds) => ({
				label: (ds.label ?? 'Series') as string,
				values: (ds.data ?? []) as (number | null)[]
			}))
	);

	const tableId = $props.id();
</script>

<figure class="chart-figure" style:--chart-height={height}>
	<figcaption class="chart-figure__caption">{title}</figcaption>
	<p class="chart-figure__description">{description}</p>

	<Chart {type} {data} {options} decorative label="{title}. {description}" />

	<details class="chart-figure__data">
		<summary class="chart-figure__summary">View as table</summary>
		<div class="table-scroll table-scroll--tall">
			<table class="table table--compact" id={tableId}>
				<caption class="visually-hidden">{title} — {description}</caption>
				<thead>
					<tr>
						<th scope="col">Period</th>
						{#each series as s (s.label)}
							<th scope="col" class="table__cell--number">{s.label}</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each labels as periodLabel, row (periodLabel)}
						<tr>
							<th scope="row">{periodLabel}</th>
							{#each series as s (s.label)}
								<td class="table__cell--number">{format(s.values[row] ?? null)}</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</details>
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

		&__data {
			margin-top: var(--space-4);
			border-top: 1px solid var(--border-subtle);
			padding-top: var(--space-3);
		}

		&__summary {
			display: inline-flex;
			align-items: center;
			min-height: var(--target-min);
			font-size: var(--text-sm);
			color: var(--text-secondary);
			cursor: pointer;

			&:hover {
				color: var(--text-primary);
			}
		}

		&__data[open] &__summary {
			margin-bottom: var(--space-3);
		}
	}
</style>
