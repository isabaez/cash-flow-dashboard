import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { categories, expenseCategories, expenses } from '$lib/server/db/schema';
import { parseDollars } from '$lib/money';
import { parseUsDate } from '$lib/date';
import type { RequestHandler } from './$types';

/** One row as sent by the client (already split into fields by the CSV parser). */
type IncomingRow = {
	line: number;
	date: string;
	title: string;
	amount: string;
	categories: string;
};

type RowResult = { line: number; ok: boolean; error?: string };

/** Normalize a category name for case-insensitive matching. */
const normalize = (name: string) => name.trim().toLowerCase();

/**
 * Batch expense importer. Accepts `{ rows: IncomingRow[] }`, validates each row
 * server-side, skips invalid rows (reporting why), and inserts the valid ones.
 * Unknown categories are created on the fly (matched case-insensitively).
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const rows = (body as { rows?: unknown })?.rows;
	if (!Array.isArray(rows)) {
		return json({ error: 'Expected a "rows" array' }, { status: 400 });
	}

	// Seed a name→id map from existing categories (keyed case-insensitively).
	const existing = await db.query.categories.findMany();
	const categoryIdByName = new Map<string, number>();
	for (const c of existing) categoryIdByName.set(normalize(c.name), c.id);

	/** Resolve a category name to an id, creating it if it doesn't exist yet. */
	function resolveCategoryId(rawName: string): number {
		const key = normalize(rawName);
		const found = categoryIdByName.get(key);
		if (found !== undefined) return found;

		const name = rawName.trim();
		let id: number;
		try {
			const { lastInsertRowid } = db.insert(categories).values({ name }).run();
			id = Number(lastInsertRowid);
		} catch {
			// UNIQUE(name) race/exact-dup — re-read the existing row.
			const row = db.select().from(categories).where(eq(categories.name, name)).get();
			if (!row) throw new Error(`Could not create category "${name}"`);
			id = row.id;
		}
		categoryIdByName.set(key, id);
		return id;
	}

	const results: RowResult[] = [];
	let imported = 0;

	for (const raw of rows as IncomingRow[]) {
		const line = Number(raw?.line) || 0;
		const title = String(raw?.title ?? '').trim();
		const dateInput = String(raw?.date ?? '').trim();
		const amountInput = String(raw?.amount ?? '').trim();
		const categoriesInput = String(raw?.categories ?? '');

		if (!title) {
			results.push({ line, ok: false, error: 'Title is required' });
			continue;
		}
		const date = parseUsDate(dateInput);
		if (!date) {
			results.push({ line, ok: false, error: `Date must be MM/DD/YYYY (got "${dateInput}")` });
			continue;
		}
		const amountCents = parseDollars(amountInput);
		if (amountCents === null || amountCents < 0) {
			results.push({ line, ok: false, error: `Amount is not a valid number (got "${amountInput}")` });
			continue;
		}

		const categoryNames = categoriesInput
			.split(',')
			.map((c) => c.trim())
			.filter((c) => c.length > 0);

		try {
			const categoryIds = [...new Set(categoryNames.map(resolveCategoryId))];
			db.transaction((tx) => {
				const { lastInsertRowid } = tx
					.insert(expenses)
					.values({ title, date, amountCents, notes: null })
					.run();
				const expenseId = Number(lastInsertRowid);
				if (categoryIds.length > 0) {
					tx.insert(expenseCategories)
						.values(categoryIds.map((categoryId) => ({ expenseId, categoryId })))
						.run();
				}
			});
			imported++;
			results.push({ line, ok: true });
		} catch (err) {
			results.push({ line, ok: false, error: err instanceof Error ? err.message : 'Import failed' });
		}
	}

	return json({ results, imported });
};
