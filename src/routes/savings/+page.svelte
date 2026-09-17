<script lang="ts">
	import ChartFigure from '$lib/components/ChartFigure.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';
	import { readChartTokens, seriesColor, seriesLegend } from '$lib/chart';
	import { theme } from '$lib/theme.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const tokens = $derived.by(() => {
		void theme.resolved;
		return readChartTokens();
	});

	const labels = $derived([
		...data.history.map((p) => monthLabel(p.month)),
		...data.projection.map((p) => monthLabel(p.month))
	]);

	// The projection line starts at the last actual point so the two lines connect.
	const historySeries = $derived([
		...data.history.map((p) => p.cents / 100),
		...data.projection.map(() => null)
	]);
	const projectionSeries = $derived([
		...data.history.map((p, i) => (i === data.history.length - 1 ? p.cents / 100 : null)),
		...data.projection.map((p) => p.cents / 100)
	]);

	const chartData = $derived({
		labels,
		datasets: [
			{
				label: 'Net worth',
				data: historySeries,
				borderColor: seriesColor(tokens, 0),
				backgroundColor: `color-mix(in oklab, ${seriesColor(tokens, 0)} 18%, transparent)`,
				fill: true,
				tension: 0.25,
				pointRadius: 2
			},
			{
				label: `Projected (${data.projectionMonths} mo)`,
				data: projectionSeries,
				borderColor: seriesColor(tokens, 1),
				// Dashed as well as differently coloured: projected vs actual must not
				// rest on hue alone.
				borderDash: [6, 5],
				pointStyle: 'rectRot',
				pointRadius: 0,
				tension: 0
			}
		]
	});

	const chartOptions = $derived({
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index' as const, intersect: false },
		plugins: {
			legend: seriesLegend(tokens),
			tooltip: {
				callbacks: {
					label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
						ctx.parsed.y === null
							? ''
							: `${ctx.dataset.label}: ${formatCents(Math.round(ctx.parsed.y * 100))}`
				}
			}
		},
		scales: {
			y: {
				ticks: {
					callback: (value: string | number) =>
						typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : value
				}
			}
		}
	});

	// Month-over-month change, for the headline tile.
	const monthDeltaCents = $derived(
		data.history.length >= 2
			? data.history[data.history.length - 1].cents - data.history[data.history.length - 2].cents
			: null
	);
</script>

<svelte:head>
	<title>Savings &amp; Net Worth · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Savings &amp; Net Worth</h1>
		<p class="explainer">
			Fund balances at cost basis — initial value plus contributions and deposits minus
			withdrawals. Market gains and losses are not tracked.
		</p>
	</div>
</div>

{#if form?.error}
	<p class="form-error" role="alert">{form.error}</p>
{/if}

<section class="stats" aria-label="Net worth summary">
	<StatTile
		label="Current net worth"
		value={formatCents(data.netWorthCents)}
		delta={monthDeltaCents}
		deltaLabel={monthDeltaCents !== null ? formatCents(Math.abs(monthDeltaCents)) : ''}
		hint="vs last month"
	/>
	<StatTile
		label="Avg monthly contribution{data.trendWindow > 0 ? ` (trailing ${data.trendWindow} mo)` : ''}"
		value={formatCents(data.avgMonthlyCents)}
	/>
	<StatTile
		label="Projected in {data.projectionMonths} months"
		value={formatCents(data.projectedCents)}
		hint="at the current contribution rate"
	/>
</section>

<!-- Fund card grid — owned by the fund-cards workstream. -->
<section class="funds" aria-label="Funds">
	{#if data.funds.length === 0}
		<div class="card">
			<div class="empty-state">
				<p class="empty-state__title">No funds yet.</p>
				<p class="empty-state__hint">
					Add a fund, then funnel paychecks into it from the Income page.
				</p>
			</div>
		</div>
	{:else}
		<div class="fund-grid">
			{#each data.funds as fund (fund.id)}
				<div class="card">
					<h2 class="fund-placeholder__name">{fund.name}</h2>
					<p class="money">{formatCents(fund.balanceCents)}</p>
				</div>
			{/each}
		</div>
	{/if}
</section>

<!-- The net worth trend sits last on the page, below the funds it aggregates. -->
<div class="card chart-card">
	{#if data.history.length === 0}
		<p class="empty-state">
			No fund movements yet. Funnel paychecks into funds on the Income page and the trend will
			appear here.
		</p>
	{:else}
		<ChartFigure
			title="Net worth over time"
			description="Running total across every fund, with a dashed {data.projectionMonths}-month projection at the recent contribution rate."
			type="line"
			data={chartData}
			options={chartOptions}
			height="360px"
		/>
	{/if}
</div>

<style lang="scss">
	@use 'breakpoints' as *;

	.explainer {
		margin: var(--space-1) 0 0;
		color: var(--text-secondary);
		font-size: var(--text-sm);
		max-width: 72ch;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.funds {
		margin-bottom: var(--space-4);
	}

	// `minmax(0, 1fr)` rather than `1fr`: grid items default to `min-width: auto`,
	// so a card holding a long fund name refuses to shrink and overflows its track.
	.fund-grid {
		display: grid;
		gap: var(--space-4);
		grid-template-columns: 1fr;

		@media (min-width: $breakpoint-md) {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		@media (min-width: $breakpoint-lg) {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	.fund-placeholder__name {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
	}
</style>
