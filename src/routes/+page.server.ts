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
 * Fund bands (chart 2) — funds have no color column, so colors are assigned by
 * sorted-fund index. Distinct hues that read on the dark surface; wraps if there
 * are more funds than entries.
 */
const FUND_PALETTE = [
	'#7c9aff', // primary blue
	'#3dd68c', // success green
	'#f2b705', // amber
	'#f2555a', // danger red
	'#b07cff', // violet
	'#3dc9d6', // teal
	'#ff8f5e', // orange
	'#e56fb3', // pink
	'#8ad14b', // lime
	'#9aa7bd' // muted slate
];

/** Neutral grey for the "Uncategorized" doughnut slice (chart 3). */
const UNCATEGORIZED_COLOR = '#97a0b3';

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

			return { name: fund.name, color: FUND_PALETTE[i % FUND_PALETTE.length], cents, projectedCents };
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
	const categoryBreakdown = categoryRows
		.map((r) => ({ name: r.name, color: r.color, cents: r.cents }))
		.sort((a, b) => b.cents - a.cents);
	const uncategorizedCents = uncategorizedRows[0]?.cents ?? 0;
	if (uncategorizedCents > 0) {
		categoryBreakdown.push({
			name: 'Uncategorized',
			color: UNCATEGORIZED_COLOR,
			cents: uncategorizedCents
		});
	}

	// Filter dropdown options — months/years that actually have expense data, newest
	// first (expenseRows is already grouped by expense month).
	const availableMonths = expenseRows.map((r) => r.month).sort((a, b) => b.localeCompare(a));
	const availableYears = [...new Set(availableMonths.map((m) => m.slice(0, 4)))];

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
		hasData: months.length > 0
	};
};
