<script lang="ts">
	import Chart from '$lib/components/Chart.svelte';
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';
	import { seriesLegend } from '$lib/chart';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

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
				borderColor: '#7c9aff',
				backgroundColor: 'rgba(124, 154, 255, 0.15)',
				fill: true,
				tension: 0.25,
				pointRadius: 2
			},
			{
				label: `Projected (${data.projectionMonths} mo)`,
				data: projectionSeries,
				borderColor: '#3dd68c',
				borderDash: [6, 5],
				pointRadius: 0,
				tension: 0
			}
		]
	});

	const chartOptions = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index' as const, intersect: false },
		plugins: {
			legend: seriesLegend,
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
	};

	function share(balanceCents: number): string {
		if (data.netWorthCents <= 0) return '—';
		return `${((balanceCents / data.netWorthCents) * 100).toFixed(1)}%`;
	}
</script>

<div class="page-header">
	<h1>Net Worth</h1>
</div>

<p class="explainer">
	Fund balances at cost basis — initial value plus contributions and deposits minus withdrawals. Market gains
	and losses are not tracked.
</p>

<div class="stats">
	<div class="card stat">
		<span class="stat__label">Current net worth</span>
		<span class="stat__value">{formatCents(data.netWorthCents)}</span>
	</div>
	<div class="card stat">
		<span class="stat__label">
			Avg monthly contribution{data.trendWindow > 0 ? ` (trailing ${data.trendWindow} mo)` : ''}
		</span>
		<span class="stat__value">{formatCents(data.avgMonthlyCents)}</span>
	</div>
	<div class="card stat">
		<span class="stat__label">Projected in {data.projectionMonths} months</span>
		<span class="stat__value">{formatCents(data.projectedCents)}</span>
	</div>
</div>

<div class="card chart-card">
	{#if data.history.length === 0}
		<p class="empty-state">
			No fund movements yet. Funnel paychecks into funds on the Income page and the trend will
			appear here.
		</p>
	{:else}
		<Chart
			type="line"
			data={chartData}
			options={chartOptions}
			label="Net worth over time with a {data.projectionMonths}-month projection"
		/>
	{/if}
</div>

<div class="card">
	<h2 class="breakdown-title">By fund</h2>
	{#if data.perFund.length === 0}
		<p class="empty-state">No funds yet.</p>
	{:else}
		<table class="table">
			<thead>
				<tr class="table__head">
					<th>Fund</th>
					<th class="table__cell--number">Initial</th>
					<th class="table__cell--number">Contributed</th>
					<th class="table__cell--number">Deposited</th>
					<th class="table__cell--number">Withdrawn</th>
					<th class="table__cell--number">Balance</th>
					<th class="table__cell--number">% of net worth</th>
				</tr>
			</thead>
			<tbody>
				{#each data.perFund as fund (fund.id)}
					<tr>
						<td>{fund.name}</td>
						<td class="table__cell--number">{formatCents(fund.initialCents)}</td>
						<td class="table__cell--number">{formatCents(fund.contributedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.depositedCents)}</td>
						<td class="table__cell--number">{formatCents(fund.withdrawnCents)}</td>
						<td class="table__cell--number">{formatCents(fund.balanceCents)}</td>
						<td class="table__cell--number">{share(fund.balanceCents)}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</div>

<style lang="scss">
	@use 'variables' as *;

	.explainer {
		margin: 0 0 $space-lg;
		color: $color-text-muted;
		font-size: $text-sm;
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: $space-md;
		margin-bottom: $space-md;
	}

	.stat {
		display: flex;
		flex-direction: column;
		gap: $space-xs;

		&__label {
			color: $color-text-muted;
			font-size: $text-sm;
		}

		&__value {
			font-size: $text-xl;
			font-weight: 700;
			font-family: $font-mono;
			letter-spacing: -0.02em;
		}
	}

	.chart-card {
		margin-bottom: $space-md;
	}

	.breakdown-title {
		font-size: $text-lg;
	}
</style>
