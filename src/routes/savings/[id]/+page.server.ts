import { db } from '$lib/server/db';
import { funds } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { buildLedger, movementActions } from '$lib/server/fundMovements';
import type { Actions, PageServerLoad } from './$types';

/**
 * Period options for the ledger, in the order they appear in the picker. Each one
 * resolves to an inclusive ISO date prefix floor (`from`); `all` has none.
 * Filtering compares ISO date strings directly, which sorts lexicographically.
 */
const PERIODS = [
	{ value: 'this-month', label: 'This month' },
	{ value: '3m', label: 'Last 3 months' },
	{ value: '6m', label: 'Last 6 months' },
	{ value: 'this-year', label: 'This year' },
	{ value: '12m', label: 'Last 12 months' },
	{ value: 'all', label: 'All time' }
] as const;

type PeriodValue = (typeof PERIODS)[number]['value'];

const DEFAULT_PERIOD: PeriodValue = 'this-year';

/** Month key N months before `month`, e.g. monthsBack('2026-03', 5) -> '2025-10'. */
function monthsBack(month: string, count: number): string {
	const [y, m] = month.split('-').map(Number);
	const total = y * 12 + (m - 1) - count;
	return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/**
 * The earliest ISO date included by a period, or null for "all time". Trailing
 * windows count the current month as the first of the N, so `3m` covers this
 * month plus the two before it.
 */
function periodFloor(period: PeriodValue, today: string): string | null {
	const month = today.slice(0, 7);
	switch (period) {
		case 'this-month':
			return `${month}-01`;
		case '3m':
			return `${monthsBack(month, 2)}-01`;
		case '6m':
			return `${monthsBack(month, 5)}-01`;
		case 'this-year':
			return `${today.slice(0, 4)}-01-01`;
		case '12m':
			return `${monthsBack(month, 11)}-01`;
		case 'all':
			return null;
	}
}

export const load: PageServerLoad = async ({ params, url }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || id <= 0) error(404, 'Fund not found');

	const fund = await db.query.funds.findFirst({
		where: eq(funds.id, id),
		with: { allocations: { with: { paycheck: true } }, deposits: true, withdrawals: true }
	});
	if (!fund) error(404, 'Fund not found');

	const requested = url.searchParams.get('period');
	const period: PeriodValue = PERIODS.some((p) => p.value === requested)
		? (requested as PeriodValue)
		: DEFAULT_PERIOD;

	const today = new Date().toISOString().slice(0, 10);
	const ledger = buildLedger(fund);
	const floor = periodFloor(period, today);

	// The `initial` entry is the pre-tracking baseline rather than a movement, so
	// it belongs to no period window — it only shows under "All time".
	const filtered =
		floor === null ? ledger : ledger.filter((e) => e.kind !== 'initial' && e.date >= floor);

	let inCents = 0;
	let outCents = 0;
	for (const entry of filtered) {
		if (entry.kind === 'withdrawal') outCents += entry.amountCents;
		else inCents += entry.amountCents;
	}

	const contributedCents = fund.allocations.reduce((sum, a) => sum + a.resolvedCents, 0);
	const depositedCents = fund.deposits.reduce((sum, d) => sum + d.amountCents, 0);
	const withdrawnCents = fund.withdrawals.reduce((sum, w) => sum + w.amountCents, 0);

	return {
		fund: {
			id: fund.id,
			name: fund.name,
			description: fund.description,
			isSavings: fund.isSavings,
			initialCents: fund.initialCents,
			contributedCents,
			depositedCents,
			withdrawnCents,
			balanceCents: fund.initialCents + contributedCents + depositedCents - withdrawnCents
		},
		ledger: filtered,
		/** Whether the fund has any movement at all, which distinguishes the two empty states. */
		hasAnyMovements: ledger.length > 0,
		period,
		periodLabel: PERIODS.find((p) => p.value === period)?.label ?? '',
		periodOptions: PERIODS.map((p) => ({ value: p.value, label: p.label })),
		totals: { inCents, outCents, netCents: inCents - outCents },
		today
	};
};

// Rows are edited in place here, so this route answers the same movement actions
// as the Savings & Net Worth page.
export const actions: Actions = { ...movementActions };
