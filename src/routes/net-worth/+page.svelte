<script lang="ts">
	import ChartFigure from '$lib/components/ChartFigure.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';
	import { readChartTokens, seriesColor, seriesLegend } from '$lib/chart';
	import { theme } from '$lib/theme.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
	const trend = $derived(data.history.slice(-12).map((p) => p.cents));

	function share(balanceCents: number): string {
		if (data.netWorthCents <= 0) return '—';
		return `${((balanceCents / data.netWorthCents) * 100).toFixed(1)}%`;
	}
</script>

<svelte:head>
	<title>Net Worth · Cash Flow</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Net Worth</h1>
		<p class="explainer">
			Fund balances at cost basis — initial value plus contributions and deposits minus
			withdrawals. Market gains and losses are not tracked.
		</p>
	</div>
</div>

<section class="stats" aria-label="Net worth summary">
	<StatTile
		label="Current net worth"
		value={formatCents(data.netWorthCents)}
		delta={monthDeltaCents}
		deltaLabel={monthDeltaCents !== null ? formatCents(Math.abs(monthDeltaCents)) : ''}
		hint="vs last month"
		{trend}
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
			format={(v) => (v === null ? '—' : formatCents(Math.round(v * 100)))}
			height="360px"
		/>
	{/if}
</div>

<div class="card">
	<h2 class="breakdown-title">By fund</h2>
	{#if data.perFund.length === 0}
		<p class="empty-state">No funds yet.</p>
	{:else}
		<div class="table-scroll">
			<table class="table">
				<caption class="visually-hidden">
					Every fund's balance broken into its initial value, contributions, deposits and
					withdrawals, with each fund's share of total net worth.
				</caption>
				<thead>
					<tr class="table__head">
						<th scope="col">Fund</th>
						<th scope="col" class="table__cell--number">Initial</th>
						<th scope="col" class="table__cell--number">Contributed</th>
						<th scope="col" class="table__cell--number">Deposited</th>
						<th scope="col" class="table__cell--number">Withdrawn</th>
						<th scope="col" class="table__cell--number">Balance</th>
						<th scope="col" class="table__cell--number">% of net worth</th>
					</tr>
				</thead>
				<tbody>
					{#each data.perFund as fund (fund.id)}
						<tr>
							<th scope="row" class="table__cell--name">{fund.name}</th>
							<td class="table__cell--number">{formatCents(fund.initialCents)}</td>
							<td class="table__cell--number">{formatCents(fund.contributedCents)}</td>
							<td class="table__cell--number">{formatCents(fund.depositedCents)}</td>
							<td class="table__cell--number">{formatCents(fund.withdrawnCents)}</td>
							<td class="table__cell--number table__cell--emphasis">
								{formatCents(fund.balanceCents)}
							</td>
							<td class="table__cell--number">{share(fund.balanceCents)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style lang="scss">
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

	.chart-card {
		margin-bottom: var(--space-4);
	}

	.breakdown-title {
		font-size: var(--text-md);
	}

	.table__cell--name {
		font-weight: 500;
	}

	.table__cell--emphasis {
		color: var(--text-primary);
		font-weight: 600;
	}
</style>
