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
import { and, eq, inArray, like, notExists, sql, sum } from 'drizzle-orm';
import { monthLabel, monthRange } from '$lib/date';
import type { PageServerLoad } from './$types';

/**
 * The Snapshot card: the handful of everyday categories worth a glance each
 * month, in display order. Matched by name, so a category that does not exist
 * (or has no spend yet this month) simply reads $0.00 rather than vanishing —
 * the row of tiles stays stable from month to month.
 */
const SNAPSHOT_CATEGORIES = ['Groceries', 'Home Goods', 'Fuel', 'Therapy'];

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

	// Category chart (chart 3) date filter — scopes ONLY that chart. The period
	// dropdown offers exactly two states, so those are the only two parsed here:
	// a valid `?month=YYYY-MM`, or no param at all. Anything else is all time.
	const monthRaw = url.searchParams.get('month');
	const catMonth = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null;

	// Shared WHERE for both category queries. With no month applied it's undefined,
	// so the chart shows all expenses across all time (drizzle ignores an undefined
	// `where`, and `and(undefined, …)` drops the term).
	const categoryDateWhere = catMonth ? like(expenses.date, `${catMonth}-%`) : undefined;

	// Human-readable label for the card title.
	const categoryPeriodLabel = catMonth ? monthLabel(catMonth) : 'All time';

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
		snapshotRows,
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
		// Snapshot card: this month's spend for each watched category. Scoped to the
		// current month only, and independent of the category chart's period filter.
		db
			.select({
				name: categories.name,
				cents: sum(expenses.amountCents).mapWith(Number)
			})
			.from(expenseCategories)
			.innerJoin(expenses, eq(expenseCategories.expenseId, expenses.id))
			.innerJoin(categories, eq(expenseCategories.categoryId, categories.id))
			.where(and(like(expenses.date, `${currentMonth}-%`), inArray(categories.name, SNAPSHOT_CATEGORIES)))
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
		new Map(rows.map((row) => [row.month, row.cents]));
	const grossByMonth = toMap(grossRows);
	const deductionsByMonth = toMap(deductionRows);
	const allocationsByMonth = toMap(allocationRows);
	const expensesByMonth = toMap(expenseRows);

	// Contiguous axis from the earliest movement to the current month (or later,
	// if future-dated rows exist, so nothing is silently dropped).
	const monthKeys = new Set<string>([
		...grossRows.map((row) => row.month),
		...expenseRows.map((row) => row.month),
		...fundDepositRows.map((row) => row.month),
		...fundWithdrawalRows.map((row) => row.month)
	]);
	const sorted = [...monthKeys].sort();
	const end = sorted.length && sorted[sorted.length - 1] > currentMonth ? sorted[sorted.length - 1] : currentMonth;
	const months = sorted.length ? monthRange(sorted[0], end) : [];

	// Chart 1 + 4: net income (gross − deductions) and expenses per month.
	const netIncomeCents = months.map((month) => (grossByMonth.get(month) ?? 0) - (deductionsByMonth.get(month) ?? 0));
	const expensesCents = months.map((month) => expensesByMonth.get(month) ?? 0);
	const savingsRate = months.map((_, index) => {
		const net = netIncomeCents[index];
		return net > 0 ? ((net - expensesCents[index]) / net) * 100 : null;
	});

	// Chart 5: gross splits cleanly into deductions + allocations + take-home cash.
	// Expenses are intentionally excluded — they're a separate flow (chart 1) and
	// can be paid from funds, which would double-count allocation money.
	const flow = {
		deductionsCents: months.map((month) => deductionsByMonth.get(month) ?? 0),
		allocationsCents: months.map((month) => allocationsByMonth.get(month) ?? 0),
		takeHomeCents: months.map(
			(month) => (grossByMonth.get(month) ?? 0) - (deductionsByMonth.get(month) ?? 0) - (allocationsByMonth.get(month) ?? 0)
		)
	};

	// Chart 2: each savings fund's balance as it stood at the START of every month
	// on the shared axis. The running total is read before the month's movements are
	// applied, so a point answers "what was in this fund on the 1st?". Non-savings
	// funds (e.g. the shared expenses pool) are excluded; this chart is about
	// long-term growth. Colors by index among savings funds so each keeps a stable
	// color.
	const contribByFundMonth = new Map(fundContribRows.map((row) => [`${row.fundId}:${row.month}`, row.cents]));
	const depositByFundMonth = new Map(fundDepositRows.map((row) => [`${row.fundId}:${row.month}`, row.cents]));
	const withdrawalByFundMonth = new Map(
		fundWithdrawalRows.map((row) => [`${row.fundId}:${row.month}`, row.cents])
	);
	const fundSeries = fundRows
		.filter((fund) => fund.isSavings)
		.map((fund, index) => {
			let running = fund.initialCents;
			const cents = months.map((month) => {
				const startOfMonth = running;
				running +=
					(contribByFundMonth.get(`${fund.id}:${month}`) ?? 0) +
					(depositByFundMonth.get(`${fund.id}:${month}`) ?? 0) -
					(withdrawalByFundMonth.get(`${fund.id}:${month}`) ?? 0);
				return startOfMonth;
			});

			return { name: fund.name, colorSlot: index % PALETTE_SLOTS, cents };
		})
		// Drop funds that never move and start at zero — pure noise.
		.filter((series) => series.cents.some((balance) => balance !== 0));

	// Chart 3: category breakdown for the selected period, largest first, with an
	// Uncategorized bar appended when there's uncategorized spend.
	const categoryBreakdown: { name: string; color: string | null; colorSlot: number | null; cents: number }[] =
		categoryRows
			.map((row) => ({ name: row.name, color: row.color, colorSlot: null, cents: row.cents }))
			.sort((left, right) => right.cents - left.cents);
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

	// Snapshot tiles in the declared order, zero-filled so a quiet category still
	// holds its place in the row.
	const snapshotByName = new Map(snapshotRows.map((row) => [row.name, row.cents]));
	const snapshot = SNAPSHOT_CATEGORIES.map((name) => ({
		name,
		cents: snapshotByName.get(name) ?? 0
	}));

	// Filter dropdown options — months that actually have expense data, newest first
	// (expenseRows is already grouped by expense month).
	const availableMonths = expenseRows.map((row) => row.month).sort((left, right) => right.localeCompare(left));

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
	const netWorthSeries = months.map((month) => {
		for (const fund of fundRows) {
			runningNetWorth +=
				(contribByFundMonth.get(`${fund.id}:${month}`) ?? 0) +
				(depositByFundMonth.get(`${fund.id}:${month}`) ?? 0) -
				(withdrawalByFundMonth.get(`${fund.id}:${month}`) ?? 0);
		}
		return runningNetWorth;
	});

	const netCashFlowCents = months.map((_, index) => netIncomeCents[index] - expensesCents[index]);

	// Monthly money into savings: paycheck allocations plus manual deposits, less
	// withdrawals, across savings funds only — the same set chart 2 bands. Summed
	// from the per-fund maps already built above rather than re-queried.
	const savingsFunds = fundRows.filter((fund) => fund.isSavings);
	const savingsCents = months.map((month) =>
		savingsFunds.reduce(
			(total, fund) =>
				total +
				(contribByFundMonth.get(`${fund.id}:${month}`) ?? 0) +
				(depositByFundMonth.get(`${fund.id}:${month}`) ?? 0) -
				(withdrawalByFundMonth.get(`${fund.id}:${month}`) ?? 0),
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
	const completeIdx = months.flatMap((month, index) =>
		month !== currentMonth && monthKeys.has(month) ? [index] : []
	);

	/** Mean over the complete months, rounded to whole cents. null with no samples. */
	const meanCents = (series: number[]): number | null =>
		completeIdx.length
			? Math.round(completeIdx.reduce((total, index) => total + series[index], 0) / completeIdx.length)
			: null;

	// The month in progress is what each average tile compares against — "how am I
	// tracking right now?". It is deliberately NOT one of the months the average is
	// built from (see completeIdx above): month-to-date is a partial total, so it
	// would drag the baseline down and then be measured against it. Early in a
	// month every flow reads below average for the obvious reason, which is why the
	// tiles label this "<Month> so far" rather than implying a finished comparison.
	const currentIdx = months.indexOf(currentMonth);

	/**
	 * One average tile: the all-time mean, plus how the month in progress sits
	 * against it. The delta is null when there is nothing to average, or the
	 * current month has no rows on the axis at all.
	 */
	const average = (series: number[]) => {
		const avgCents = meanCents(series);
		return {
			cents: avgCents ?? 0,
			deltaCents: avgCents !== null && currentIdx >= 0 ? series[currentIdx] - avgCents : null
		};
	};

	const lastIdx = months.length - 1;

	const kpis = {
		/** First and last month on the axis, for the "All time · … – …" header line. */
		rangeStart: months.length ? months[0] : null,
		rangeEnd: months.length ? months[lastIdx] : null,
		/** The in-progress month, for the "<Month> so far vs average" tile hints. */
		currentMonth,
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
		categoryBreakdown,
		snapshot,
		/** Month the snapshot covers, labelled on the client. */
		snapshotMonth: currentMonth,
		categoryPeriodLabel,
		categoryFilter: { month: catMonth },
		availableMonths,
		kpis,
		/** Figures are point-in-time; say when they were computed. */
		asOf: new Date().toISOString().slice(0, 10),
		hasData: months.length > 0
	};
};
