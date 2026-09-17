import { db } from '$lib/server/db';
import {
	allocations,
	categories,
	expenseCategories,
	expenses,
	fundDeposits,
	fundWithdrawals,
	funds,
	paycheckDeductions,
	paychecks
} from '$lib/server/db/schema';
import { and, eq, gte, like, lte, notExists, sql, sum } from 'drizzle-orm';
import { monthLabel, monthRange, nextMonth } from '$lib/date';
import type { PageServerLoad } from './$types';

/** Trailing months used to estimate each fund's monthly contribution rate. */
const TREND_WINDOW = 6;
/** How far the fund-growth projection extends, in months (matches the net-worth page). */
const PROJECTION_MONTHS = 12;

/**
 * Fund bands (chart 2) — funds have no color column, so each is assigned a slot in
 * the categorical palette by sorted-fund index. The slot is resolved to an actual
 * colour on the client (see readChartTokens in $lib/chart), so fund colours follow
 * the active theme instead of being frozen as hex here.
 */
const PALETTE_SLOTS = 10;

/** The "Uncategorized" bar (chart 3) uses the neutral slot at the end of the palette. */
const UNCATEGORIZED_SLOT = PALETTE_SLOTS - 1;

export const load: PageServerLoad = async ({ url }) => {
	// Month buckets keyed off each table's date column.
	const pcMonth = sql<string>`substr(${paychecks.date}, 1, 7)`;
	const expMonth = sql<string>`substr(${expenses.date}, 1, 7)`;
	const depMonth = sql<string>`substr(${fundDeposits.date}, 1, 7)`;
	const wdMonth = sql<string>`substr(${fundWithdrawals.date}, 1, 7)`;

	const currentMonth = new Date().toISOString().slice(0, 7);

	// Category chart (chart 3) date filter — scopes ONLY that chart. Modes are
	// mutually exclusive; invalid params fall back to the default (current month).
	const monthRaw = url.searchParams.get('month');
	const yearRaw = url.searchParams.get('year');
	const fromRaw = url.searchParams.get('from');
	const toRaw = url.searchParams.get('to');
	const isMonth = (v: string | null): v is string => !!v && /^\d{4}-\d{2}$/.test(v);
	const catMonth = isMonth(monthRaw) ? monthRaw : null;
	const catYear = !catMonth && yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : null;
	// Range applies only when both bounds are valid months and ordered.
	const rangeActive =
		!catMonth && !catYear && isMonth(fromRaw) && isMonth(toRaw) && fromRaw <= toRaw;
	const catFrom = rangeActive ? fromRaw : null;
	const catTo = rangeActive ? toRaw : null;

	// Shared WHERE for both category queries. With no filter applied it's undefined,
	// so the chart shows all expenses across all time (drizzle ignores an undefined
	// `where`, and `and(undefined, …)` drops the term).
	const categoryDateWhere = catMonth
		? like(expenses.date, `${catMonth}-%`)
		: catYear
			? like(expenses.date, `${catYear}-%`)
			: rangeActive
				? and(gte(expMonth, catFrom!), lte(expMonth, catTo!))
				: undefined;

	// Human-readable label for the card title.
	const categoryPeriodLabel = catMonth
		? monthLabel(catMonth)
		: catYear
			? catYear
			: rangeActive
				? catFrom === catTo
					? monthLabel(catFrom!)
					: `${monthLabel(catFrom!)} – ${monthLabel(catTo!)}`
				: 'All time';

	const [
		grossRows,
		deductionRows,
		allocationRows,
		expenseRows,
		fundContribRows,
		fundDepositRows,
		fundWithdrawalRows,
		fundRows,
		categoryRows,
		uncategorizedRows
	] = await Promise.all([
		db
			.select({ month: pcMonth, cents: sum(paychecks.grossCents).mapWith(Number) })
			.from(paychecks)
			.groupBy(pcMonth),
		db
			.select({ month: pcMonth, cents: sum(paycheckDeductions.resolvedCents).mapWith(Number) })
			.from(paycheckDeductions)
			.innerJoin(paychecks, eq(paycheckDeductions.paycheckId, paychecks.id))
			.groupBy(pcMonth),
		db
			.select({ month: pcMonth, cents: sum(allocations.resolvedCents).mapWith(Number) })
			.from(allocations)
			.innerJoin(paychecks, eq(allocations.paycheckId, paychecks.id))
			.groupBy(pcMonth),
		db
			.select({ month: expMonth, cents: sum(expenses.amountCents).mapWith(Number) })
			.from(expenses)
			.groupBy(expMonth),
		// Per-fund contributions by paycheck month (chart 2).
		db
			.select({
				fundId: allocations.fundId,
				month: pcMonth,
				cents: sum(allocations.resolvedCents).mapWith(Number)
			})
			.from(allocations)
			.innerJoin(paychecks, eq(allocations.paycheckId, paychecks.id))
			.groupBy(allocations.fundId, pcMonth),
		// Per-fund manual deposits by month (chart 2).
		db
			.select({
				fundId: fundDeposits.fundId,
				month: depMonth,
				cents: sum(fundDeposits.amountCents).mapWith(Number)
			})
			.from(fundDeposits)
			.groupBy(fundDeposits.fundId, depMonth),
		// Per-fund withdrawals by month (chart 2).
		db
			.select({
				fundId: fundWithdrawals.fundId,
				month: wdMonth,
				cents: sum(fundWithdrawals.amountCents).mapWith(Number)
			})
			.from(fundWithdrawals)
			.groupBy(fundWithdrawals.fundId, wdMonth),
		db
			.select({
				id: funds.id,
				name: funds.name,
				initialCents: funds.initialCents,
				isSavings: funds.isSavings
			})
			.from(funds)
			.orderBy(funds.name),
		// Expense total per category over the selected period (chart 3). Categories are
		// many-to-many, so an expense with N categories counts fully toward each —
		// bars can sum above the period's expense total. That's fine for a per-category view.
		db
			.select({
				name: categories.name,
				color: categories.color,
				cents: sum(expenses.amountCents).mapWith(Number)
			})
			.from(expenseCategories)
			.innerJoin(expenses, eq(expenseCategories.expenseId, expenses.id))
			.innerJoin(categories, eq(expenseCategories.categoryId, categories.id))
			.where(categoryDateWhere)
			.groupBy(categories.id),
		// Expenses in the selected period carrying no category → an "Uncategorized" bar.
		db
			.select({ cents: sum(expenses.amountCents).mapWith(Number) })
			.from(expenses)
			.where(
				and(
					categoryDateWhere,
					notExists(
						db
							.select({ one: sql`1` })
							.from(expenseCategories)
							.where(eq(expenseCategories.expenseId, expenses.id))
					)
				)
			)
	]);

	const toMap = (rows: { month: string; cents: number }[]) =>
		new Map(rows.map((r) => [r.month, r.cents]));
	const grossByMonth = toMap(grossRows);
	const deductionsByMonth = toMap(deductionRows);
	const allocationsByMonth = toMap(allocationRows);
	const expensesByMonth = toMap(expenseRows);

	// Contiguous axis from the earliest movement to the current month (or later,
	// if future-dated rows exist, so nothing is silently dropped).
	const monthKeys = new Set<string>([
		...grossRows.map((r) => r.month),
		...expenseRows.map((r) => r.month),
		...fundDepositRows.map((r) => r.month),
		...fundWithdrawalRows.map((r) => r.month)
	]);
	const sorted = [...monthKeys].sort();
	const end = sorted.length && sorted[sorted.length - 1] > currentMonth ? sorted[sorted.length - 1] : currentMonth;
	const months = sorted.length ? monthRange(sorted[0], end) : [];

	// Chart 1 + 4: net income (gross − deductions) and expenses per month.
	const netIncomeCents = months.map((m) => (grossByMonth.get(m) ?? 0) - (deductionsByMonth.get(m) ?? 0));
	const expensesCents = months.map((m) => expensesByMonth.get(m) ?? 0);
	const savingsRate = months.map((m, i) => {
		const net = netIncomeCents[i];
		return net > 0 ? ((net - expensesCents[i]) / net) * 100 : null;
	});

	// Chart 5: gross splits cleanly into deductions + allocations + take-home cash.
	// Expenses are intentionally excluded — they're a separate flow (chart 1) and
	// can be paid from funds, which would double-count allocation money.
	const flow = {
		deductionsCents: months.map((m) => deductionsByMonth.get(m) ?? 0),
		allocationsCents: months.map((m) => allocationsByMonth.get(m) ?? 0),
		takeHomeCents: months.map(
			(m) => (grossByMonth.get(m) ?? 0) - (deductionsByMonth.get(m) ?? 0) - (allocationsByMonth.get(m) ?? 0)
		)
	};

	// Chart 2: cumulative balance per savings fund over the shared axis — the
	// net-worth running-total algorithm, applied per fund. Non-savings funds (e.g.
	// the shared expenses pool) are excluded; this chart is about long-term growth.
	// Colors by index among savings funds so each keeps a stable color.
	const contribByFundMonth = new Map(fundContribRows.map((r) => [`${r.fundId}:${r.month}`, r.cents]));
	const depositByFundMonth = new Map(fundDepositRows.map((r) => [`${r.fundId}:${r.month}`, r.cents]));
	const withdrawalByFundMonth = new Map(
		fundWithdrawalRows.map((r) => [`${r.fundId}:${r.month}`, r.cents])
	);
	const fundSeries = fundRows
		.filter((fund) => fund.isSavings)
		.map((fund, i) => {
			let running = fund.initialCents;
			const cents = months.map((m) => {
				running +=
					(contribByFundMonth.get(`${fund.id}:${m}`) ?? 0) +
					(depositByFundMonth.get(`${fund.id}:${m}`) ?? 0) -
					(withdrawalByFundMonth.get(`${fund.id}:${m}`) ?? 0);
				return running;
			});

			// Dashed 12-month projection per fund, mirroring the net-worth page: extend
			// the last balance forward at the average monthly change over the trailing
			// window (or, with only one month of history, that month's net movement).
			const last = cents.at(-1) ?? 0;
			const trendMonths = Math.min(TREND_WINDOW, cents.length - 1);
			const avgMonthlyCents =
				trendMonths > 0
					? Math.round((last - cents[cents.length - 1 - trendMonths]) / trendMonths)
					: last - fund.initialCents;
			const projectedCents: number[] = [];
			let projected = last;
			for (let p = 0; p < PROJECTION_MONTHS; p++) {
				projected += avgMonthlyCents;
				projectedCents.push(projected);
			}

			return { name: fund.name, colorSlot: i % PALETTE_SLOTS, cents, projectedCents };
		})
		// Drop funds that never move and start at zero — pure noise.
		.filter((f) => f.cents.some((c) => c !== 0));

	// Future month keys shared by every fund's projection (empty when there's no history).
	const projectionMonths: string[] = [];
	if (months.length > 0) {
		let m = months[months.length - 1];
		for (let p = 0; p < PROJECTION_MONTHS; p++) {
			m = nextMonth(m);
			projectionMonths.push(m);
		}
	}

	// Chart 3: category breakdown for the selected period, largest first, with an
	// Uncategorized bar appended when there's uncategorized spend.
	const categoryBreakdown: { name: string; color: string | null; colorSlot: number | null; cents: number }[] =
		categoryRows
			.map((r) => ({ name: r.name, color: r.color, colorSlot: null, cents: r.cents }))
			.sort((a, b) => b.cents - a.cents);
	const uncategorizedCents = uncategorizedRows[0]?.cents ?? 0;
	if (uncategorizedCents > 0) {
		// Synthetic row — it has no category record, so it takes a palette slot.
		categoryBreakdown.push({
			name: 'Uncategorized',
			color: null,
			colorSlot: UNCATEGORIZED_SLOT,
			cents: uncategorizedCents
		});
	}

	// Filter dropdown options — months/years that actually have expense data, newest
	// first (expenseRows is already grouped by expense month).
	const availableMonths = expenseRows.map((r) => r.month).sort((a, b) => b.localeCompare(a));
	const availableYears = [...new Set(availableMonths.map((m) => m.slice(0, 4)))];

	// --- Headline figures -----------------------------------------------------
	// "Verdict first": the dashboard leads with how things are going, not with five
	// charts of equal weight. Everything below is derived from series already
	// computed above — no additional queries.
	//
	// The tiles are an ALL-TIME overview: one stock (net worth) and three monthly
	// averages. Averages are per *month with data*, not per month on the axis.

	// Net worth across EVERY fund (not just savings funds, unlike chart 2) — this is
	// the same running-total rule the Net Worth page applies.
	let runningNetWorth = fundRows.reduce((total, fund) => total + fund.initialCents, 0);
	const netWorthSeries = months.map((m) => {
		for (const fund of fundRows) {
			runningNetWorth +=
				(contribByFundMonth.get(`${fund.id}:${m}`) ?? 0) +
				(depositByFundMonth.get(`${fund.id}:${m}`) ?? 0) -
				(withdrawalByFundMonth.get(`${fund.id}:${m}`) ?? 0);
		}
		return runningNetWorth;
	});

	const netCashFlowCents = months.map((m, i) => netIncomeCents[i] - expensesCents[i]);

	// Monthly money into savings: paycheck allocations plus manual deposits, less
	// withdrawals, across savings funds only — the same set chart 2 bands. Summed
	// from the per-fund maps already built above rather than re-queried.
	const savingsFunds = fundRows.filter((fund) => fund.isSavings);
	const savingsCents = months.map((m) =>
		savingsFunds.reduce(
			(total, fund) =>
				total +
				(contribByFundMonth.get(`${fund.id}:${m}`) ?? 0) +
				(depositByFundMonth.get(`${fund.id}:${m}`) ?? 0) -
				(withdrawalByFundMonth.get(`${fund.id}:${m}`) ?? 0),
			0
		)
	);

	// Which months count toward an average. Two exclusions:
	//  1. The in-progress current month — its totals are partial and would drag
	//     every average down. This mirrors the `partial` rule in
	//     lib/server/insights/digest.ts, so Dashboard and Insights agree.
	//  2. Months `monthRange` padded in to keep the axis contiguous. They carry no
	//     rows at all, so counting their zeroes would understate the averages; the
	//     denominator is "months with data", not months.length.
	const completeIdx = months.flatMap((m, i) =>
		m !== currentMonth && monthKeys.has(m) ? [i] : []
	);

	/** Mean over the complete months, rounded to whole cents. null with no samples. */
	const meanCents = (series: number[]): number | null =>
		completeIdx.length
			? Math.round(completeIdx.reduce((total, i) => total + series[i], 0) / completeIdx.length)
			: null;

	// The most recent complete month is what each average tile compares against.
	const latestIdx = completeIdx.at(-1) ?? null;

	/**
	 * One average tile: the all-time mean, plus how the latest complete month sits
	 * against it. The delta is null when there's nothing to average or the latest
	 * complete month *is* the only sample (comparing it to itself says nothing).
	 */
	const average = (series: number[]) => {
		const avgCents = meanCents(series);
		return {
			cents: avgCents ?? 0,
			deltaCents:
				avgCents !== null && latestIdx !== null && completeIdx.length > 1
					? series[latestIdx] - avgCents
					: null
		};
	};

	const lastIdx = months.length - 1;

	const kpis = {
		/** First and last month on the axis, for the "All time · … – …" header line. */
		rangeStart: months.length ? months[0] : null,
		rangeEnd: months.length ? months[lastIdx] : null,
		// A stock, not a flow: the latest balance on the axis (the partial month
		// included — money already in a fund is not "partial") against last month's.
		netWorth: {
			cents: months.length ? netWorthSeries[lastIdx] : 0,
			deltaCents: lastIdx > 0 ? netWorthSeries[lastIdx] - netWorthSeries[lastIdx - 1] : null
		},
		netCashFlow: average(netCashFlowCents),
		spend: average(expensesCents),
		savings: average(savingsCents)
	};

	return {
		months,
		netIncomeCents,
		expensesCents,
		savingsRate,
		flow,
		fundSeries,
		projectionMonths,
		categoryBreakdown,
		categoryPeriodLabel,
		categoryFilter: { month: catMonth, year: catYear, from: catFrom, to: catTo },
		availableMonths,
		availableYears,
		kpis,
		/** Figures are point-in-time; say when they were computed. */
		asOf: new Date().toISOString().slice(0, 10),
		hasData: months.length > 0
	};
};
