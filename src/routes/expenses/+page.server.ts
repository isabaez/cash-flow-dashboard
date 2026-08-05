import { db } from '$lib/server/db';
import { expenses, expenseIncomeStreams } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { parseDollars } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const [expenseRows, categoryRows, streamRows] = await Promise.all([
		db.query.expenses.findMany({
			with: {
				category: true,
				incomeStreamLinks: { with: { incomeStream: true } }
			},
			orderBy: (e, { desc }) => [desc(e.date)],
			limit: 100
		}),
		db.query.categories.findMany({ orderBy: (c, { asc }) => [asc(c.name)] }),
		db.query.incomeStreams.findMany({ orderBy: (s, { asc }) => [asc(s.title)] })
	]);

	const today = new Date().toISOString().slice(0, 10);
	return { expenses: expenseRows, categories: categoryRows, streams: streamRows, today };
};

/** Read + validate the shared expense fields from a submitted form. */
function readExpense(form: FormData) {
	const title = String(form.get('title') ?? '').trim();
	const date = String(form.get('date') ?? '').trim();
	const amountCents = parseDollars(String(form.get('amount') ?? ''));
	const categoryRaw = form.get('categoryId');
	const categoryId = categoryRaw ? Number(categoryRaw) : null;
	const notes = String(form.get('notes') ?? '').trim() || null;
	const incomeStreamIds = form
		.getAll('incomeStreamId')
		.map((v) => Number(v))
		.filter((n) => Number.isFinite(n) && n > 0);

	if (!title) return { error: 'Title is required' as const };
	if (amountCents === null || amountCents < 0)
		return { error: 'Enter a valid amount' as const };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date is required' as const };

	return { values: { title, date, amountCents, categoryId, notes }, incomeStreamIds };
}

export const actions: Actions = {
	create: async ({ request }) => {
		const parsed = readExpense(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const { values, incomeStreamIds } = parsed;

		db.transaction((tx) => {
			const { lastInsertRowid } = tx.insert(expenses).values(values).run();
			const expenseId = Number(lastInsertRowid);
			if (incomeStreamIds.length > 0) {
				tx.insert(expenseIncomeStreams)
					.values(incomeStreamIds.map((incomeStreamId) => ({ expenseId, incomeStreamId })))
					.run();
			}
		});
		return { success: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing expense id' });

		const parsed = readExpense(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });
		const { values, incomeStreamIds } = parsed;

		db.transaction((tx) => {
			tx.update(expenses).set(values).where(eq(expenses.id, id)).run();
			// Replace the set of applied income streams.
			tx.delete(expenseIncomeStreams).where(eq(expenseIncomeStreams.expenseId, id)).run();
			if (incomeStreamIds.length > 0) {
				tx.insert(expenseIncomeStreams)
					.values(incomeStreamIds.map((incomeStreamId) => ({ expenseId: id, incomeStreamId })))
					.run();
			}
		});
		return { success: true };
	},

	/** Deleting an expense cascade-deletes its income-stream links (FK onDelete: 'cascade'). */
	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing expense id' });

		await db.delete(expenses).where(eq(expenses.id, id));
		return { success: true };
	}
};
