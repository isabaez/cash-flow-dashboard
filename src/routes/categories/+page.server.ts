import { db } from '$lib/server/db';
import { categories, expenseCategories } from '$lib/server/db/schema';
import { and, count, eq, inArray } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const DEFAULT_COLOR = '#7c9aff';
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Normalize a submitted color to #rrggbb, or fall back to the default. */
function readColor(form: FormData): string {
	const raw = String(form.get('color') ?? '').trim();
	return HEX_COLOR.test(raw) ? raw.toLowerCase() : DEFAULT_COLOR;
}

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({
			id: categories.id,
			name: categories.name,
			color: categories.color,
			expenseCount: count(expenseCategories.id)
		})
		.from(categories)
		.leftJoin(expenseCategories, eq(expenseCategories.categoryId, categories.id))
		.groupBy(categories.id)
		.orderBy(categories.name);

	return { categories: rows };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const color = readColor(form);
		if (!name) return fail(400, { error: 'Name is required' });

		try {
			await db.insert(categories).values({ name, color });
		} catch {
			return fail(400, { error: `Category "${name}" already exists` });
		}
		return { success: true };
	},

	update: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();
		const color = readColor(form);

		if (!id) return fail(400, { error: 'Missing category id' });
		if (!name) return fail(400, { error: 'Name is required' });

		try {
			await db.update(categories).set({ name, color }).where(eq(categories.id, id));
		} catch {
			return fail(400, { error: `Category "${name}" already exists` });
		}
		return { success: true };
	},

	/**
	 * Delete a category. Its expense links are either reassigned to an optional
	 * replacement category or simply removed, in the same transaction.
	 */
	delete: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const replacementRaw = form.get('replacementId');
		const replacementId = replacementRaw ? Number(replacementRaw) : null;

		if (!id) return fail(400, { error: 'Missing category id' });
		if (replacementId === id)
			return fail(400, { error: 'Replacement must be a different category' });

		db.transaction((tx) => {
			if (replacementId) {
				// Drop links whose expense already carries the replacement category,
				// so reassigning can't violate the (expense, category) unique index.
				const alreadyLinked = tx
					.select({ expenseId: expenseCategories.expenseId })
					.from(expenseCategories)
					.where(eq(expenseCategories.categoryId, replacementId));
				tx.delete(expenseCategories)
					.where(
						and(
							eq(expenseCategories.categoryId, id),
							inArray(expenseCategories.expenseId, alreadyLinked)
						)
					)
					.run();
				tx.update(expenseCategories)
					.set({ categoryId: replacementId })
					.where(eq(expenseCategories.categoryId, id))
					.run();
			} else {
				tx.delete(expenseCategories).where(eq(expenseCategories.categoryId, id)).run();
			}
			tx.delete(categories).where(eq(categories.id, id)).run();
		});

		return { success: true };
	}
};
