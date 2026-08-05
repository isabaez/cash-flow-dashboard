import { db } from '$lib/server/db';
import { categories, expenses } from '$lib/server/db/schema';
import { count, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			id: categories.id,
			name: categories.name,
			expenseCount: count(expenses.id)
		})
		.from(categories)
		.leftJoin(expenses, eq(expenses.categoryId, categories.id))
		.groupBy(categories.id)
		.orderBy(categories.name);

	return { categories: rows };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		if (!name) return fail(400, { error: 'Name is required' });

		try {
			await db.insert(categories).values({ name });
		} catch {
			return fail(400, { error: `Category "${name}" already exists` });
		}
		return { success: true };
	},

	rename: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing category id' });
		if (!name) return fail(400, { error: 'Name is required' });

		try {
			await db.update(categories).set({ name }).where(eq(categories.id, id));
		} catch {
			return fail(400, { error: `Category "${name}" already exists` });
		}
		return { success: true };
	},

	/**
	 * Delete a category. If it has expenses, a replacementId is required;
	 * those expenses are reassigned in the same transaction.
	 */
	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const replacementRaw = form.get('replacementId');
		const replacementId = replacementRaw ? Number(replacementRaw) : null;

		if (!id) return fail(400, { error: 'Missing category id' });
		if (replacementId === id)
			return fail(400, { error: 'Replacement must be a different category' });

		const [{ n }] = await db
			.select({ n: count() })
			.from(expenses)
			.where(eq(expenses.categoryId, id));

		if (n > 0 && !replacementId)
			return fail(400, { error: 'This category has expenses — choose a replacement first' });

		db.transaction((tx) => {
			if (n > 0 && replacementId) {
				tx.update(expenses)
					.set({ categoryId: replacementId })
					.where(eq(expenses.categoryId, id))
					.run();
			}
			tx.delete(categories).where(eq(categories.id, id)).run();
		});

		return { success: true };
	}
};
