import { db } from '$lib/server/db';
import {
	categories,
	expenseCategories,
	expenses,
	paycheckDeductions,
	paychecks
} from '$lib/server/db/schema';
import { and, eq, gte, notExists, sql, sum } from 'drizzle-orm';
import { formatCents } from '$lib/money';
import { monthLabel, monthRange } from '$lib/date';

/**
 * Server-side spending digest.
 *
 * Turns the SQLite tables into a compact bundle of *exact*, pre-computed figures
 * for the local LLM to interpret. The model does no arithmetic — every number it
 * cites originates here — so figures stay correct and the prompt stays small.
 *
 * Money is kept in integer cents throughout (matching the schema); it is only
 * rendered to dollar strings in `digestToPrompt`, right before the text goes to
 * the model. Month bucketing uses SQL `substr(date, 1, 7)`, the same convention
 * as the dashboard loader (src/routes/+page.server.ts).
 */

const UNCATEGORIZED = 'Uncategorized';
/** How many of the largest individual expenses to include as near-raw rows. */
const TOP_EXPENSE_LIMIT = 10;

export type MonthStat = {
	/** YYYY-MM */
	month: string;
	/** "Aug 2026" */
	label: string;
	netIncomeCents: number;
	expensesCents: number;
	/** (net − expenses) / net, as a percentage; null when there's no net income. */
	savingsRate: number | null;
	/** The current, still-in-progress month — its totals are partial. */
	partial: boolean;
};

export type CategoryStat = { name: string; cents: number };

export type TopExpense = {
	title: string;
	cents: number;
	/** YYYY-MM-DD */
	date: string;
	categories: string[];
};

export type CategoryDelta = {
	name: string;
	latestCents: number;
	priorCents: number;
	deltaCents: number;
};

export type SpendingDigest = {
	windowMonths: number;
	windowStart: string;
	windowEnd: string;
	months: MonthStat[];
	avgMonthlyExpensesCents: number;
	avgSavingsRate: number | null;
	categoryWindow: CategoryStat[];
	categoryLatestMonth: { month: string; label: string; categories: CategoryStat[] } | null;
	momDelta: {
		latest: string;
		prior: string;
		expensesDeltaCents: number;
		perCategory: CategoryDelta[];
	} | null;
	topExpenses: TopExpense[];
	hasData: boolean;
};

const EMPTY_DIGEST: SpendingDigest = {
	windowMonths: 0,
	windowStart: '',
	windowEnd: '',
	months: [],
	avgMonthlyExpensesCents: 0,
	avgSavingsRate: null,
	categoryWindow: [],
	categoryLatestMonth: null,
	momDelta: null,
	topExpenses: [],
	hasData: false
};

/**
 * Build a spending digest over *all* recorded data — from the earliest paycheck
 * or expense month through the current (partial) month.
 */
export async function buildDigest(): Promise<SpendingDigest> {
	const currentMonth = new Date().toISOString().slice(0, 7);

	const pcMonth = sql<string>`substr(${paychecks.date}, 1, 7)`;
	const expMonth = sql<string>`substr(${expenses.date}, 1, 7)`;

	// Data extent: earliest month to include, and the latest month present (which may
	// sit past the current month if future-dated rows exist).
	const [expBounds, pcBounds] = await Promise.all([
		db
			.select({
				min: sql<string | null>`min(substr(${expenses.date}, 1, 7))`,
				max: sql<string | null>`max(substr(${expenses.date}, 1, 7))`
			})
			.from(expenses),
		db
			.select({
				min: sql<string | null>`min(substr(${paychecks.date}, 1, 7))`,
				max: sql<string | null>`max(substr(${paychecks.date}, 1, 7))`
			})
			.from(paychecks)
	]);

	const mins = [expBounds[0]?.min, pcBounds[0]?.min].filter((v): v is string => !!v);
	if (mins.length === 0) return EMPTY_DIGEST;

	const windowStart = mins.reduce((a, b) => (a < b ? a : b));
	const windowEnd = [expBounds[0]?.max, pcBounds[0]?.max, currentMonth]
		.filter((v): v is string => !!v)
		.reduce((a, b) => (a > b ? a : b));

	const [grossRows, deductionRows, expenseRows, catByMonthRows, uncatByMonthRows, topExpenseRows] =
		await Promise.all([
			db
				.select({ month: pcMonth, cents: sum(paychecks.grossCents).mapWith(Number) })
				.from(paychecks)
				.where(gte(pcMonth, windowStart))
				.groupBy(pcMonth),
			db
				.select({ month: pcMonth, cents: sum(paycheckDeductions.resolvedCents).mapWith(Number) })
				.from(paycheckDeductions)
				.innerJoin(paychecks, eq(paycheckDeductions.paycheckId, paychecks.id))
				.where(gte(pcMonth, windowStart))
				.groupBy(pcMonth),
			db
				.select({ month: expMonth, cents: sum(expenses.amountCents).mapWith(Number) })
				.from(expenses)
				.where(gte(expMonth, windowStart))
				.groupBy(expMonth),
			// Per (month, category) totals over the window — one query feeds the
			// window breakdown, latest-month breakdown, and per-category MoM deltas.
			db
				.select({
					month: expMonth,
					name: categories.name,
					cents: sum(expenses.amountCents).mapWith(Number)
				})
				.from(expenseCategories)
				.innerJoin(expenses, eq(expenseCategories.expenseId, expenses.id))
				.innerJoin(categories, eq(expenseCategories.categoryId, categories.id))
				.where(gte(expMonth, windowStart))
				.groupBy(expMonth, categories.id),
			// Expenses carrying no category, bucketed by month → an "Uncategorized" pseudo-category.
			db
				.select({ month: expMonth, cents: sum(expenses.amountCents).mapWith(Number) })
				.from(expenses)
				.where(
					and(
						gte(expMonth, windowStart),
						notExists(
							db
								.select({ one: sql`1` })
								.from(expenseCategories)
								.where(eq(expenseCategories.expenseId, expenses.id))
						)
					)
				)
				.groupBy(expMonth),
			db.query.expenses.findMany({
				with: { categoryLinks: { with: { category: true } } },
				where: gte(sql`substr(${expenses.date}, 1, 7)`, windowStart),
				orderBy: (e, { desc }) => [desc(e.amountCents), desc(e.date)],
				limit: TOP_EXPENSE_LIMIT
			})
		]);

	const grossByMonth = new Map(grossRows.map((r) => [r.month, r.cents]));
	const deductionsByMonth = new Map(deductionRows.map((r) => [r.month, r.cents]));
	const expensesByMonth = new Map(expenseRows.map((r) => [r.month, r.cents]));

	// Contiguous month axis across the whole window (fills gaps with zeros).
	const monthKeys = monthRange(windowStart, windowEnd);

	const monthStats: MonthStat[] = monthKeys.map((month) => {
		const netIncomeCents = (grossByMonth.get(month) ?? 0) - (deductionsByMonth.get(month) ?? 0);
		const expensesCents = expensesByMonth.get(month) ?? 0;
		const savingsRate =
			netIncomeCents > 0 ? ((netIncomeCents - expensesCents) / netIncomeCents) * 100 : null;
		return {
			month,
			label: monthLabel(month),
			netIncomeCents,
			expensesCents,
			savingsRate,
			partial: month === currentMonth
		};
	});

	// Fold per-(month, category) rows (plus the uncategorized pseudo-category) into
	// a nested map: month → (categoryName → cents).
	const catByMonth = new Map<string, Map<string, number>>();
	const addCat = (month: string, name: string, cents: number) => {
		if (!catByMonth.has(month)) catByMonth.set(month, new Map());
		const inner = catByMonth.get(month)!;
		inner.set(name, (inner.get(name) ?? 0) + cents);
	};
	for (const r of catByMonthRows) addCat(r.month, r.name, r.cents);
	for (const r of uncatByMonthRows) if (r.cents) addCat(r.month, UNCATEGORIZED, r.cents);

	// Window-wide category totals, largest first.
	const windowTotals = new Map<string, number>();
	for (const inner of catByMonth.values()) {
		for (const [name, cents] of inner) windowTotals.set(name, (windowTotals.get(name) ?? 0) + cents);
	}
	const categoryWindow: CategoryStat[] = [...windowTotals.entries()]
		.map(([name, cents]) => ({ name, cents }))
		.sort((a, b) => b.cents - a.cents);

	// Latest / prior *complete* months (exclude the current partial month) for the
	// month-over-month comparison and the single-month category breakdown.
	const completeMonths = monthKeys.filter((m) => m !== currentMonth);
	const latest = completeMonths.at(-1) ?? null;
	const prior = completeMonths.at(-2) ?? null;

	const categoryLatestMonth = latest
		? {
				month: latest,
				label: monthLabel(latest),
				categories: [...(catByMonth.get(latest) ?? new Map<string, number>()).entries()]
					.map(([name, cents]) => ({ name, cents }))
					.sort((a, b) => b.cents - a.cents)
			}
		: null;

	let momDelta: SpendingDigest['momDelta'] = null;
	if (latest && prior) {
		const latestCats = catByMonth.get(latest) ?? new Map<string, number>();
		const priorCats = catByMonth.get(prior) ?? new Map<string, number>();
		const names = new Set([...latestCats.keys(), ...priorCats.keys()]);
		const perCategory: CategoryDelta[] = [...names]
			.map((name) => {
				const latestCents = latestCats.get(name) ?? 0;
				const priorCents = priorCats.get(name) ?? 0;
				return { name, latestCents, priorCents, deltaCents: latestCents - priorCents };
			})
			.sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents));
		momDelta = {
			latest,
			prior,
			expensesDeltaCents: (expensesByMonth.get(latest) ?? 0) - (expensesByMonth.get(prior) ?? 0),
			perCategory
		};
	}

	// Averages over complete months only (the partial month would drag them down).
	const completeStats = monthStats.filter((s) => !s.partial);
	const avgMonthlyExpensesCents = completeStats.length
		? Math.round(completeStats.reduce((sum, s) => sum + s.expensesCents, 0) / completeStats.length)
		: 0;
	const savingsSamples = completeStats.map((s) => s.savingsRate).filter((r): r is number => r !== null);
	const avgSavingsRate = savingsSamples.length
		? savingsSamples.reduce((sum, r) => sum + r, 0) / savingsSamples.length
		: null;

	const topExpenses: TopExpense[] = topExpenseRows.map((e) => ({
		title: e.title,
		cents: e.amountCents,
		date: e.date,
		categories: e.categoryLinks.map((l) => l.category.name)
	}));

	const hasData =
		monthStats.some((s) => s.expensesCents !== 0 || s.netIncomeCents !== 0) ||
		categoryWindow.length > 0;

	return {
		windowMonths: monthKeys.length,
		windowStart,
		windowEnd,
		months: monthStats,
		avgMonthlyExpensesCents,
		avgSavingsRate,
		categoryWindow,
		categoryLatestMonth,
		momDelta,
		topExpenses,
		hasData
	};
}

const pct = (v: number | null) => (v === null ? 'n/a' : `${v.toFixed(1)}%`);
const signedCents = (cents: number) =>
	`${cents >= 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`;

/**
 * Render a digest as compact, labeled plain text with dollar amounts — the exact
 * material the model is allowed to reason from.
 */
export function digestToPrompt(d: SpendingDigest): string {
	const lines: string[] = [];
	lines.push(
		`Spending digest — all recorded data, ${d.windowMonths} month(s) (${monthLabel(d.windowStart)} to ${monthLabel(d.windowEnd)}).`
	);
	lines.push(`The most recent month (${monthLabel(d.windowEnd)}) is still in progress; its totals are partial.`);
	lines.push('');

	lines.push('Per-month net income, expenses, and savings rate:');
	for (const s of d.months) {
		lines.push(
			`- ${s.label}${s.partial ? ' (partial)' : ''}: net income ${formatCents(s.netIncomeCents)}, expenses ${formatCents(s.expensesCents)}, savings rate ${pct(s.savingsRate)}`
		);
	}
	lines.push('');

	lines.push(
		`Averages over complete months: monthly expenses ${formatCents(d.avgMonthlyExpensesCents)}, savings rate ${pct(d.avgSavingsRate)}.`
	);
	lines.push('');

	if (d.categoryWindow.length) {
		lines.push('Spending by category over the whole window (largest first):');
		for (const c of d.categoryWindow) lines.push(`- ${c.name}: ${formatCents(c.cents)}`);
		lines.push('');
	}

	if (d.categoryLatestMonth?.categories.length) {
		lines.push(`Spending by category in ${d.categoryLatestMonth.label} (latest complete month):`);
		for (const c of d.categoryLatestMonth.categories) lines.push(`- ${c.name}: ${formatCents(c.cents)}`);
		lines.push('');
	}

	if (d.momDelta) {
		lines.push(
			`Month-over-month change (${monthLabel(d.momDelta.prior)} → ${monthLabel(d.momDelta.latest)}): total expenses ${signedCents(d.momDelta.expensesDeltaCents)}.`
		);
		const movers = d.momDelta.perCategory.filter((c) => c.deltaCents !== 0).slice(0, 6);
		if (movers.length) {
			lines.push('Biggest category movers:');
			for (const c of movers) lines.push(`- ${c.name}: ${signedCents(c.deltaCents)}`);
		}
		lines.push('');
	}

	if (d.topExpenses.length) {
		lines.push('Largest individual expenses in the window:');
		for (const e of d.topExpenses) {
			const cats = e.categories.length ? ` [${e.categories.join(', ')}]` : '';
			lines.push(`- ${e.date} ${e.title}: ${formatCents(e.cents)}${cats}`);
		}
		lines.push('');
	}

	return lines.join('\n').trim();
}
