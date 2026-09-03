import { db } from '$lib/server/db';
import { allocations, fundDeposits, fundWithdrawals, paychecks } from '$lib/server/db/schema';
import { eq, sql, sum } from 'drizzle-orm';
import { nextMonth } from '$lib/date';
import type { PageServerLoad } from './$types';

/** Number of trailing months used to estimate the monthly contribution rate. */
const TREND_WINDOW = 6;
/** How far the projection extends, in months. */
const PROJECTION_MONTHS = 12;

export const load: PageServerLoad = async () => {
	const allocMonth = sql<string>`substr(${paychecks.date}, 1, 7)`;
	const depMonth = sql<string>`substr(${fundDeposits.date}, 1, 7)`;
	const wdMonth = sql<string>`substr(${fundWithdrawals.date}, 1, 7)`;

	const [contribRows, depRows, wdRows, fundRows] = await Promise.all([
		db
			.select({ month: allocMonth, cents: sum(allocations.resolvedCents).mapWith(Number) })
			.from(allocations)
			.innerJoin(paychecks, eq(allocations.paycheckId, paychecks.id))
			.groupBy(allocMonth),
		db
			.select({ month: depMonth, cents: sum(fundDeposits.amountCents).mapWith(Number) })
			.from(fundDeposits)
			.groupBy(depMonth),
		db
			.select({ month: wdMonth, cents: sum(fundWithdrawals.amountCents).mapWith(Number) })
			.from(fundWithdrawals)
			.groupBy(wdMonth),
		db.query.funds.findMany({
			with: { allocations: true, deposits: true, withdrawals: true },
			orderBy: (f, { asc }) => [asc(f.name)]
		})
	]);

	// Net movement per month across all funds.
	const deltaByMonth = new Map<string, number>();
	for (const r of contribRows) deltaByMonth.set(r.month, (deltaByMonth.get(r.month) ?? 0) + r.cents);
	for (const r of depRows) deltaByMonth.set(r.month, (deltaByMonth.get(r.month) ?? 0) + r.cents);
	for (const r of wdRows) deltaByMonth.set(r.month, (deltaByMonth.get(r.month) ?? 0) - r.cents);

	// Initial fund values predate all tracked movements — the series baseline.
	const initialTotal = fundRows.reduce((s, f) => s + f.initialCents, 0);

	// Cumulative monthly series from the earliest movement to the current month.
	const currentMonth = new Date().toISOString().slice(0, 7);
	const history: { month: string; cents: number }[] = [];
	if (deltaByMonth.size > 0) {
		const start = [...deltaByMonth.keys()].sort()[0];
		let running = initialTotal;
		for (let m = start; m <= currentMonth; m = nextMonth(m)) {
			running += deltaByMonth.get(m) ?? 0;
			history.push({ month: m, cents: running });
		}
	} else if (initialTotal !== 0) {
		history.push({ month: currentMonth, cents: initialTotal });
	}

	// Monthly rate used to extend the projection.
	const last = history.at(-1);
	const trendMonths = Math.min(TREND_WINDOW, history.length - 1);
	let avgMonthlyCents = 0;
	if (last && trendMonths > 0) {
		// Normal case: average the change across the trailing window.
		avgMonthlyCents = Math.round(
			(last.cents - history[history.length - 1 - trendMonths].cents) / trendMonths
		);
	} else if (last) {
		// Only one month of history — assume that month's net contribution repeats
		// every future month, so the projection slopes forward at that rate. The first
		// month's movement is its ending value minus the pre-tracking initial balance.
		avgMonthlyCents = last.cents - initialTotal;
	}

	// Dashed projection, anchored at the last actual point.
	const projection: { month: string; cents: number }[] = [];
	if (last) {
		let m = last.month;
		let cents = last.cents;
		for (let i = 0; i < PROJECTION_MONTHS; i++) {
			m = nextMonth(m);
			cents += avgMonthlyCents;
			projection.push({ month: m, cents });
		}
	}

	const perFund = fundRows.map((fund) => {
		const contributedCents = fund.allocations.reduce((s, a) => s + a.resolvedCents, 0);
		const depositedCents = fund.deposits.reduce((s, d) => s + d.amountCents, 0);
		const withdrawnCents = fund.withdrawals.reduce((s, w) => s + w.amountCents, 0);
		return {
			id: fund.id,
			name: fund.name,
			isSavings: fund.isSavings,
			initialCents: fund.initialCents,
			contributedCents,
			depositedCents,
			withdrawnCents,
			balanceCents: fund.initialCents + contributedCents + depositedCents - withdrawnCents
		};
	});

	return {
		history,
		projection,
		avgMonthlyCents,
		netWorthCents: last?.cents ?? 0,
		projectedCents: last ? last.cents + avgMonthlyCents * PROJECTION_MONTHS : 0,
		projectionMonths: PROJECTION_MONTHS,
		trendWindow: trendMonths,
		perFund
	};
};
