<script lang="ts">
	// Dashboard — five charts summarizing cash flow, savings, and where money goes.
	// All aggregation happens server-side (see +page.server.ts); here we just shape
	// the results into Chart.js configs and reuse the shared Chart.svelte wrapper.
	import Chart from '$lib/components/Chart.svelte';
	import { formatCents } from '$lib/money';
	import { monthLabel } from '$lib/date';
	import { seriesLegend, categoryLegend } from '$lib/chart';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const INCOME_COLOR = '#3dd68c'; // success green
	const EXPENSE_COLOR = '#f2555a'; // danger red
	const ALLOCATION_COLOR = '#7c9aff'; // primary blue
	const SURFACE_COLOR = '#12161f'; // slice gaps on the doughnut

	const toDollars = (cents: number) => cents / 100;
	/** Append a 2-digit alpha to a #RRGGBB hex, e.g. withAlpha('#7c9aff', 'cc'). */
	const withAlpha = (hex: string, aa: string) => `${hex}${aa}`;

	const labels = $derived(data.months.map(monthLabel));

	// Shared option fragments (Chart.js configs are plain objects, like net-worth).
	const noAspect = { responsive: true, maintainAspectRatio: false } as const;
	const indexHover = { mode: 'index' as const, intersect: false };
	const currencyTicks = {
		callback: (value: string | number) =>
			typeof value === 'number' ? `$${value.toLocaleString('en-US')}` : value
	};
	const currencyLabel = (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
		ctx.parsed.y === null
			? ''
			: `${ctx.dataset.label}: ${formatCents(Math.round(ctx.parsed.y * 100))}`;

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
				backgroundColor: INCOME_COLOR,
				borderRadius: 4
			},
			{
				label: 'Expenses',
				data: data.expensesCents.map(toDollars),
				backgroundColor: EXPENSE_COLOR,
				borderRadius: 4
			}
		]
	});
	const cashFlowOptions = {
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend, tooltip: { callbacks: { label: currencyLabel } } },
		scales: { y: { ticks: currencyTicks } }
	};

	// --- 2. Cumulative fund growth (stacked area, one band per fund) -----------
	// The axis extends 12 months past the history into the projection window.
	const fundGrowthLabels = $derived([...labels, ...data.projectionMonths.map(monthLabel)]);
	const fundGrowthData = $derived({
		labels: fundGrowthLabels,
		// Each fund contributes two datasets: the solid filled history band, and a
		// dashed projection line anchored at the last actual point (same technique as
		// the net-worth chart). They sit in separate stacks so the projected line
		// continues from the top of each band without double-counting the anchor.
		datasets: data.fundSeries.flatMap((fund) => {
			const future = data.projectionMonths.map(() => null);
			const anchorIdx = fund.cents.length - 1;
			return [
				{
					label: fund.name,
					data: [...fund.cents.map(toDollars), ...future],
					borderColor: fund.color,
					// 15% fill to match the net-worth projection chart's translucent area style.
					backgroundColor: withAlpha(fund.color, '26'),
					fill: true,
					tension: 0.25,
					// Kept visible so a single month of history still shows (an area needs 2+ points to fill).
					pointRadius: 2,
					stack: 'actual'
				},
				{
					label: `${fund.name} (projected)`,
					// Start at the last actual point so the dashed line connects to the band.
					data: [
						...labels.map((_, i) => (i === anchorIdx ? toDollars(fund.cents[anchorIdx]) : null)),
						...fund.projectedCents.map(toDollars)
					],
					borderColor: fund.color,
					borderDash: [6, 5],
					pointRadius: 0,
					tension: 0,
					fill: false,
					stack: 'projected',
					hideInLegend: true
				}
			];
		})
	});
	const fundGrowthOptions = {
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend, tooltip: { callbacks: { label: currencyLabel } } },
		scales: { y: { stacked: true, ticks: currencyTicks } }
	};

	// --- 3. Expenses by category (doughnut, current month) --------------------
	const categoryTotalCents = $derived(data.categoryBreakdown.reduce((s, c) => s + c.cents, 0));
	const categoryData = $derived({
		labels: data.categoryBreakdown.map((c) => c.name),
		datasets: [
			{
				data: data.categoryBreakdown.map((c) => toDollars(c.cents)),
				backgroundColor: data.categoryBreakdown.map((c) => c.color),
				borderColor: SURFACE_COLOR,
				borderWidth: 2
			}
		]
	});
	const categoryOptions = {
		...noAspect,
		plugins: {
			legend: categoryLegend,
			tooltip: {
				callbacks: {
					label: (ctx: { label?: string; parsed: number }) => {
						const cents = Math.round(ctx.parsed * 100);
						const pct =
							categoryTotalCents > 0 ? ((cents / categoryTotalCents) * 100).toFixed(1) : '0.0';
						return `${ctx.label}: ${formatCents(cents)} (${pct}%)`;
					}
				}
			}
		}
	};

	// --- 4. Savings rate over time (percent line) -----------------------------
	const hasSavingsRate = $derived(data.savingsRate.some((v) => v !== null));
	const savingsRateData = $derived({
		labels,
		datasets: [
			{
				label: 'Savings rate',
				data: data.savingsRate,
				borderColor: ALLOCATION_COLOR,
				backgroundColor: withAlpha(ALLOCATION_COLOR, '26'),
				fill: true,
				tension: 0.25,
				pointRadius: 2,
				spanGaps: false
			}
		]
	});
	const savingsRateOptions = {
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
				ticks: {
					callback: (value: string | number) => (typeof value === 'number' ? `${value}%` : value)
				}
			}
		}
	};

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
				backgroundColor: EXPENSE_COLOR
			},
			{
				label: 'Fund allocations',
				data: data.flow.allocationsCents.map(toDollars),
				backgroundColor: ALLOCATION_COLOR
			},
			{
				label: 'Take-home cash',
				data: data.flow.takeHomeCents.map(toDollars),
				backgroundColor: INCOME_COLOR
			}
		]
	});
	const flowOptions = {
		...noAspect,
		interaction: indexHover,
		plugins: { legend: seriesLegend, tooltip: { callbacks: { label: currencyLabel } } },
		scales: { x: { stacked: true }, y: { stacked: true, ticks: currencyTicks } }
	};
</script>

<h1>Dashboard</h1>

{#if !data.hasData}
	<div class="card">
		<p class="empty-state">
			Add paychecks on the Income page and expenses on the Expenses page — charts will appear here.
			Fund balances and projections live on the Net Worth page.
		</p>
	</div>
{:else}
	<div class="charts">
		<div class="card chart-card">
			<h2 class="chart-card__title">Net income vs expenses</h2>
			{#if hasCashFlow}
				<Chart
					type="bar"
					data={cashFlowData}
					options={cashFlowOptions}
					label="Monthly net income compared to expenses"
				/>
			{:else}
				<p class="empty-state">No income or expenses recorded yet.</p>
			{/if}
		</div>

		<div class="card chart-card">
			<h2 class="chart-card__title">Savings rate</h2>
			{#if hasSavingsRate}
				<Chart
					type="line"
					data={savingsRateData}
					options={savingsRateOptions}
					label="Share of net income kept each month"
				/>
			{:else}
				<p class="empty-state">Needs a month with net income to compute a rate.</p>
			{/if}
		</div>

		<div class="card chart-card chart-card--wide">
			<h2 class="chart-card__title">Savings fund growth</h2>
			{#if data.fundSeries.length > 0}
				<Chart
					type="line"
					data={fundGrowthData}
					options={fundGrowthOptions}
					label="Cumulative balance of each savings fund over time"
				/>
			{:else}
				<p class="empty-state">No savings fund movements yet.</p>
			{/if}
		</div>

		<div class="card chart-card">
			<h2 class="chart-card__title">Expenses by category — {monthLabel(data.categoryMonth)}</h2>
			{#if data.categoryBreakdown.length > 0}
				<Chart
					type="doughnut"
					data={categoryData}
					options={categoryOptions}
					label="This month's expenses broken down by category"
				/>
			{:else}
				<p class="empty-state">No expenses recorded this month.</p>
			{/if}
		</div>

		<div class="card chart-card">
			<h2 class="chart-card__title">Where each month's income goes</h2>
			{#if hasFlow}
				<Chart
					type="bar"
					data={flowData}
					options={flowOptions}
					label="Monthly gross income split into deductions, fund allocations, and take-home cash"
				/>
			{:else}
				<p class="empty-state">No paychecks recorded yet.</p>
			{/if}
		</div>
	</div>
{/if}

<style lang="scss">
	@use 'variables' as *;

	.charts {
		display: grid;
		// `min(420px, 100%)` so the 420px floor collapses to the container width on
		// phones narrower than that, instead of overflowing.
		grid-template-columns: repeat(auto-fit, minmax(min(420px, 100%), 1fr));
		gap: $space-md;
	}

	.chart-card {
		&--wide {
			grid-column: 1 / -1;
		}

		&__title {
			font-size: $text-lg;
			margin-bottom: $space-md;
		}
	}
</style>
