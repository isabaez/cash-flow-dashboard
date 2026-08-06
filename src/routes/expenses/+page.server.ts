import { db } from '$lib/server/db';
import { expenseCategories, expenses, funds, fundWithdrawals } from '$lib/server/db/schema';
import { and, desc, eq, exists, like, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { parseDollars } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const monthRaw = url.searchParams.get('month');
	const yearRaw = url.searchParams.get('year');

	// Invalid params fall back to unfiltered.
	const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null;
	const year = !month && yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : null;
	// Repeated ?category params combine as AND — an expense must carry every one.
	const categoryIds = [
		...new Set(
			url.searchParams
				.getAll('category')
				.filter((v) => /^\d+$/.test(v))
				.map(Number)
		)
	];

	const conditions = [];
	if (month) conditions.push(like(expenses.date, `${month}-%`));
	else if (year) conditions.push(like(expenses.date, `${year}-%`));
	for (const categoryId of categoryIds) {
		conditions.push(
			exists(
				db
					.select({ one: sql`1` })
					.from(expenseCategories)
					.where(
						and(
							eq(expenseCategories.expenseId, expenses.id),
							eq(expenseCategories.categoryId, categoryId)
						)
					)
			)
		);
	}
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	const monthCol = sql<string>`substr(${expenses.date}, 1, 7)`;
	const yearCol = sql<string>`substr(${expenses.date}, 1, 4)`;

	const [expenseRows, categoryRows, fundRows, monthRows, yearRows] = await Promise.all([
		db.query.expenses.findMany({
			with: {
				categoryLinks: { with: { category: true } },
				fundWithdrawals: { with: { fund: true } }
			},
			where,
			orderBy: (e, { desc: d }) => [d(e.date), d(e.id)],
			limit: 200
		}),
		db.query.categories.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
		db.query.funds.findMany({ orderBy: (f, { asc }) => [asc(f.name)] }),
		db.selectDistinct({ month: monthCol }).from(expenses).orderBy(desc(monthCol)),
		db.selectDistinct({ year: yearCol }).from(expenses).orderBy(desc(yearCol))
	]);

	const today = new Date().toISOString().slice(0, 10);
	return {
		expenses: expenseRows,
		categories: categoryRows,
		funds: fundRows,
		availableMonths: monthRows.map((r) => r.month),
		availableYears: yearRows.map((r) => r.year),
		filters: { month, year, categoryIds },
		today
	};
};

/** Read + validate the shared expense fields from a submitted form. */
function readExpense(form: FormData) {
	const title = String(form.get('title') ?? '').trim();
	const date = String(form.get('date') ?? '').trim();
	const amountCents = parseDollars(String(form.get('amount') ?? ''));
	const notes = String(form.get('notes') ?? '').trim() || null;
	const fundRaw = form.get('fundId');
	const fundId = fundRaw ? Number(fundRaw) : null;
	const categoryIds = form
		.getAll('categoryId')
		.map((v) => Number(v))
		.filter((n) => Number.isFinite(n) && n > 0);

	if (!title) return { error: 'Title is required' as const };
	if (amountCents === null || amountCents < 0) return { error: 'Enter a valid amount' as const };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date is required' as const };
	if (fundId !== null && !Number.isFinite(fundId)) return { error: 'Invalid fund' as const };

	return { values: { title, date, amountCents, notes }, categoryIds, fundId };
}

/**
 * Make the fund withdrawal mirroring an expense match the expense's current
 * state: created, moved to another fund, kept in sync, or removed.
 * Must run inside the same transaction as the expense mutation.
 */
function syncExpenseWithdrawal(
	tx: Parameters<Parameters<(typeof db)['transaction']>[0]>[0],
	expenseId: number,
	fundId: number | null,
	values: { title: string; date: string; amountCents: number }
): void {
	const existing = tx
		.select()
		.from(fundWithdrawals)
		.where(eq(fundWithdrawals.expenseId, expenseId))
		.get();

	if (fundId === null) {
		if (existing) tx.delete(fundWithdrawals).where(eq(fundWithdrawals.id, existing.id)).run();
		return;
	}

	const mirror = {
		fundId,
		amountCents: values.amountCents,
		date: values.date,
		notes: `Expense: ${values.title}`
	};
	if (existing) {
		tx.update(fundWithdrawals).set(mirror).where(eq(fundWithdrawals.id, existing.id)).run();
	} else {
		tx.insert(fundWithdrawals).values({ ...mirror, expenseId }).run();
	}
}

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = readExpense(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const { values, categoryIds, fundId } = parsed;

		if (fundId !== null) {
			const fund = await db.query.funds.findFirst({ where: eq(funds.id, fundId) });
			if (!fund) return fail(400, { error: 'Invalid fund' });
		}

		db.transaction((tx) => {
			const { lastInsertRowid } = tx.insert(expenses).values(values).run();
			const expenseId = Number(lastInsertRowid);
			if (categoryIds.length > 0) {
				tx.insert(expenseCategories)
					.values(categoryIds.map((categoryId) => ({ expenseId, categoryId })))
					.run();
			}
			syncExpenseWithdrawal(tx, expenseId, fundId, values);
		});
		return { success: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing expense id' });

		const parsed = readExpense(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const { values, categoryIds, fundId } = parsed;

		if (fundId !== null) {
			const fund = await db.query.funds.findFirst({ where: eq(funds.id, fundId) });
			if (!fund) return fail(400, { error: 'Invalid fund' });
		}

		db.transaction((tx) => {
			tx.update(expenses).set(values).where(eq(expenses.id, id)).run();
			// Replace the set of applied categories.
			tx.delete(expenseCategories).where(eq(expenseCategories.expenseId, id)).run();
			if (categoryIds.length > 0) {
				tx.insert(expenseCategories)
					.values(categoryIds.map((categoryId) => ({ expenseId: id, categoryId })))
					.run();
			}
			syncExpenseWithdrawal(tx, id, fundId, values);
		});
		return { success: true };
	},

	/** Deleting an expense cascade-deletes its category links and any linked fund withdrawal. */
	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing expense id' });

		await db.delete(expenses).where(eq(expenses.id, id));
		return { success: true };
	},

	/** Copy an expense (including its categories and fund pull) to a new date. */
	duplicate: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const date = String(form.get('date') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing expense id' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { error: 'A valid date is required' });

		const source = await db.query.expenses.findFirst({
			where: eq(expenses.id, id),
			with: { categoryLinks: true, fundWithdrawals: true }
		});
		if (!source) return fail(404, { error: 'Expense not found' });

		db.transaction((tx) => {
			const { lastInsertRowid } = tx
				.insert(expenses)
				.values({
					title: source.title,
					amountCents: source.amountCents,
					date,
					notes: source.notes
				})
				.run();
			const expenseId = Number(lastInsertRowid);
			if (source.categoryLinks.length > 0) {
				tx.insert(expenseCategories)
					.values(source.categoryLinks.map((l) => ({ expenseId, categoryId: l.categoryId })))
					.run();
			}
			syncExpenseWithdrawal(tx, expenseId, source.fundWithdrawals[0]?.fundId ?? null, {
				title: source.title,
				date,
				amountCents: source.amountCents
			});
		});
		return { success: true };
	}
};
