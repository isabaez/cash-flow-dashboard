<script lang="ts">
	// Dashboard — headline figures first, then the charts that explain them.
	//
	// All aggregation happens server-side (see +page.server.ts); this file shapes the
	// results into Chart.js configs. Series colours are read from the design tokens
	// so a theme switch restyles every chart, and every chart is wrapped in
	// ChartFigure, which names it for assistive tech.
	import ChartFigure from '$lib/components/ChartFigure.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import CategoryPeriodFilter from '$lib/components/CategoryPeriodFilter.svelte';
	import { formatCents } from '$lib/money';
	import { formatDate, monthLabel } from '$lib/date';
	import { readChartTokens, seriesColor, seriesLegend, pointStyle } from '$lib/chart';
	import { theme } from '$lib/theme.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Re-read whenever the theme flips; Chart.js bakes colours into the canvas.
	const tokens = $derived.by(() => {
		void theme.resolved;
		return readChartTokens();
	});

	const toDollars = (cents: number) => cents / 100;
	const centsFromDollars = (value: number | null) =>
		value === null ? '—' : formatCents(Math.round(value * 100));
	/** Translucent fill of a series colour, for area charts. */
	const softFill = (color: string) => `color-mix(in oklab, ${color} 18%, transparent)`;

	const labels = $derived(data.months.map(monthLabel));

	// Header line: the tiles cover everything on record, so say which span that is.
	// A single month of history reads as one label rather than "Jan 2025 – Jan 2025".
	const rangeLabel = $derived.by(() => {
		const { rangeStart, rangeEnd } = data.kpis;
		if (!rangeStart || !rangeEnd) return '';
		return rangeStart === rangeEnd
			? monthLabel(rangeStart)
			: `${monthLabel(rangeStart)} – ${monthLabel(rangeEnd)}`;
	});

	/** Shared by the three average tiles — their delta is the same comparison. */
	const averageHint = 'this month vs average';

	// Shared option fragments (Chart.js configs are plain objects).
	const noAspect = { responsive: true, maintainAspectRatio: false } as const;
	const indexHover = { mode: 'index' as const, intersect: false };
	const currencyTicks = {
		callback: (value: string | number) =>
			typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : value
	};
	const currencyLabel = (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
		ctx.parsed.y === null ? '' : `${ctx.dataset.label}: ${centsFromDollars(ctx.parsed.y)}`;

	// --- 1. Monthly net income vs expenses (grouped bars) ---------------------
	const hasCashFlow = $derived(
		data.netIncomeCents.some((c) => c !== 0) || data.expensesCents.some((c) => c !== 0)
	);
	const cashFlowData = $derived({
		labels,
		datasets: [
			{
				label: 'Net income',
				data: data.netIncomeCents.map(toDollars),
				backgroundColor: seriesColor(tokens, 1),
				borderRadius: 4
			},
			{
				label: 'Expenses',
				data: data.expensesCents.map(toDollars),
				backgroundColor: seriesColor(tokens, 2),
				borderRadius: 4
			}
		]
	});
	const cashFlowOptions = $derived({
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend(tokens), tooltip: { callbacks: { label: currencyLabel } } },
		scales: { y: { ticks: currencyTicks } }
	});

	// --- 2. Savings overview (one line per fund, not stacked) -----------------
	// Each line is the fund's balance at the start of each month, drawn on its own
	// rather than stacked: the question is how each fund stands, not what they add
	// up to (net worth already answers that).
	const savingsOverviewData = $derived({
		labels,
		datasets: data.fundSeries.map((fund, i) => {
			const color = seriesColor(tokens, fund.colorSlot);
			return {
				label: fund.name,
				data: fund.cents.map(toDollars),
				borderColor: color,
				backgroundColor: color,
				fill: false,
				tension: 0.25,
				// Marker shape as well as colour, so the lines stay separable without
				// relying on hue alone.
				pointStyle: pointStyle(i),
				pointRadius: 2
			};
		})
	});
	const savingsOverviewOptions = $derived({
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend(tokens), tooltip: { callbacks: { label: currencyLabel } } },
		scales: { y: { ticks: currencyTicks } }
	});

	// --- 3. Expenses by category (bar, filterable period) ---------------------
	// A bar chart (not a pie): expenses can carry multiple categories and count fully
	// toward each, so per-category totals can exceed the period's spend and would not
	// sum to a meaningful whole. Each bar carries its category's own colour; the
	// synthetic "Uncategorized" bar takes a palette slot instead.
	const categoryData = $derived({
		labels: data.categoryBreakdown.map((c) => c.name),
		datasets: [
			{
				label: 'Spent',
				data: data.categoryBreakdown.map((c) => toDollars(c.cents)),
				backgroundColor: data.categoryBreakdown.map((c) =>
					c.color ?? seriesColor(tokens, c.colorSlot ?? 0)
				),
				borderRadius: 4
			}
		]
	});
	const categoryOptions = $derived({
		...noAspect,
		interaction: indexHover,
		plugins: {
			// Category names are on the x-axis, so a legend would be redundant.
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx: { label?: string; parsed: { y: number | null } }) =>
						ctx.parsed.y === null ? '' : `${ctx.label}: ${centsFromDollars(ctx.parsed.y)}`
				}
			}
		},
		scales: { y: { ticks: currencyTicks } }
	});

	// --- 4. Savings rate over time (percent line) -----------------------------
	const hasSavingsRate = $derived(data.savingsRate.some((v) => v !== null));
	const savingsRateData = $derived({
		labels,
		datasets: [
			{
				label: 'Savings rate',
				data: data.savingsRate,
				borderColor: seriesColor(tokens, 0),
				backgroundColor: softFill(seriesColor(tokens, 0)),
				fill: true,
				tension: 0.25,
				pointRadius: 2,
				spanGaps: false
			}
		]
	});
	const savingsRateOptions = $derived({
		...noAspect,
		interaction: indexHover,
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx: { parsed: { y: number | null } }) =>
						ctx.parsed.y === null ? '' : `Savings rate: ${ctx.parsed.y.toFixed(1)}%`
				}
			}
		},
		scales: {
			y: {
				// A rate is a share of income: anchoring the axis to the full 0–100%
				// range keeps month-to-month comparisons honest, since an auto-fitted
				// axis exaggerates small swings.
				min: 0,
				max: 100,
				ticks: {
					callback: (value: string | number) => (typeof value === 'number' ? `${value}%` : value)
				}
			}
		}
	});

	// --- 5. Paycheck flow breakdown (stacked bars) ----------------------------
	const hasFlow = $derived(
		data.flow.deductionsCents.some((c) => c !== 0) ||
			data.flow.allocationsCents.some((c) => c !== 0) ||
			data.flow.takeHomeCents.some((c) => c !== 0)
	);
	const flowData = $derived({
		labels,
		datasets: [
			{
				label: 'Deductions',
				data: data.flow.deductionsCents.map(toDollars),
				backgroundColor: seriesColor(tokens, 2)
			},
			{
				label: 'Fund allocations',
				data: data.flow.allocationsCents.map(toDollars),
				backgroundColor: seriesColor(tokens, 0)
			},
			{
				label: 'Take-home cash',
				data: data.flow.takeHomeCents.map(toDollars),
				backgroundColor: seriesColor(tokens, 1)
			}
		]
	});
	const flowOptions = $derived({
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend(tokens), tooltip: { callbacks: { label: currencyLabel } } },
		scales: { x: { stacked: true }, y: { stacked: true, ticks: currencyTicks } }
	});

	const signedCents = (cents: number) => formatCents(Math.abs(cents));
</script>

<svelte:head>
	<title>Dashboard · Baez Financial Dashboard</title>
</svelte:head>

<div class="page-header">
	<div>
		<h1>Dashboard</h1>
		{#if data.hasData && rangeLabel}
			<p class="page-header__meta">
				All time · {rangeLabel} · as of {formatDate(data.asOf)}
			</p>
		{/if}
	</div>
</div>

{#if !data.hasData}
	<div class="card">
		<p class="empty-state">
			Add paychecks on the Income page and expenses on the Expenses page — charts will appear here.
			Fund balances and projections live on the Net Worth page.
		</p>
	</div>
{:else}
	<section class="kpis" aria-label="All-time headline figures">
		<StatTile
			label="Net worth"
			value={formatCents(data.kpis.netWorth.cents)}
			delta={data.kpis.netWorth.deltaCents}
			deltaLabel={data.kpis.netWorth.deltaCents !== null
				? signedCents(data.kpis.netWorth.deltaCents)
				: ''}
			hint="vs last month"
		/>
		<StatTile
			label="Avg net cash flow"
			value={formatCents(data.kpis.netCashFlow.cents)}
			delta={data.kpis.netCashFlow.deltaCents}
			deltaLabel={data.kpis.netCashFlow.deltaCents !== null
				? signedCents(data.kpis.netCashFlow.deltaCents)
				: ''}
			hint={averageHint}
		/>
		<StatTile
			label="Avg monthly spend"
			value={formatCents(data.kpis.spend.cents)}
			delta={data.kpis.spend.deltaCents}
			deltaLabel={data.kpis.spend.deltaCents !== null ? signedCents(data.kpis.spend.deltaCents) : ''}
			polarity="down-is-good"
			hint={averageHint}
		/>
		<StatTile
			label="Avg monthly savings"
			value={formatCents(data.kpis.savings.cents)}
			delta={data.kpis.savings.deltaCents}
			deltaLabel={data.kpis.savings.deltaCents !== null
				? signedCents(data.kpis.savings.deltaCents)
				: ''}
			hint={averageHint}
		/>
	</section>

	<!-- The one chart that answers "where is the money going?" gets the width. -->
	<div class="card chart-card chart-card--primary">
		{#if hasCashFlow}
			<ChartFigure
				title="Net income vs expenses"
				description="Take-home pay after deductions, against everything spent, month by month."
				type="bar"
				data={cashFlowData}
				options={cashFlowOptions}
				height="360px"
			/>
		{:else}
			<p class="empty-state">No income or expenses recorded yet.</p>
		{/if}
	</div>

	<div class="charts">
		<div class="card chart-card">
			{#if hasSavingsRate}
				<ChartFigure
					title="Savings rate"
					description="Share of net income left after expenses each month."
					type="line"
					data={savingsRateData}
					options={savingsRateOptions}
				/>
			{:else}
				<p class="empty-state">Needs a month with net income to compute a rate.</p>
			{/if}
		</div>

		<div class="card chart-card">
			<div class="chart-card__filter">
				{#if data.availableMonths.length > 0}
					<CategoryPeriodFilter
						months={data.availableMonths}
						month={data.categoryFilter.month}
					/>
				{/if}
			</div>
			{#if data.categoryBreakdown.length > 0}
				<ChartFigure
					title="Expenses by category — {data.categoryPeriodLabel}"
					description="An expense can carry several categories and counts fully toward each, so these bars can total more than the period's spend."
					type="bar"
					data={categoryData}
					options={categoryOptions}
					captionHidden
				/>
			{:else}
				<p class="empty-state">No expenses recorded for this period.</p>
			{/if}
		</div>

		<div class="card chart-card chart-card--wide">
			{#if data.fundSeries.length > 0}
				<ChartFigure
					title="Savings overview"
					description="Balance of each savings fund at the start of every month."
					type="line"
					data={savingsOverviewData}
					options={savingsOverviewOptions}
					height="380px"
				/>
			{:else}
				<p class="empty-state">No savings fund movements yet.</p>
			{/if}
		</div>

		<div class="card chart-card chart-card--wide">
			{#if hasFlow}
				<ChartFigure
					title="Where each month's income goes"
					description="Gross pay split into deductions, money moved into funds, and take-home cash."
					type="bar"
					data={flowData}
					options={flowOptions}
				/>
			{:else}
				<p class="empty-state">No paychecks recorded yet.</p>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	
	.page-header__meta {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--text-tertiary);
	}

	.kpis {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.charts {
		display: grid;
		// `min(420px, 100%)` so the 420px floor collapses to the container width on
		// phones narrower than that, instead of overflowing.
		grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
		gap: var(--space-4);
	}

	.chart-card {
		// Grid items default to min-width:auto, so a card refuses to shrink below the
		// min-content width of the fallback data table inside it and overflows the
		// track. Zeroing it lets .table-scroll do its job and scroll internally.
		min-inline-size: 0;

		&--primary {
			margin-bottom: var(--space-4);
		}

		&--wide {
			grid-column: 1 / -1;
		}

		&__filter {
			margin-bottom: var(--space-4);
		}
	}
</style>
