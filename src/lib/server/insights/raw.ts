import { db } from '$lib/server/db';
import { formatCents } from '$lib/money';

/**
 * Raw transaction dataset.
 *
 * Unlike the digest (which hands the model pre-computed totals), this exposes the
 * individual expense rows so the LLM can hunt for patterns itself — recurring
 * charges, merchant frequency, timing, one-off outliers. Amounts are still rendered
 * from integer cents; no arithmetic is done for the model here.
 */

/** Safety cap so a very long history can't blow past the model's context window. */
const MAX_ROWS = 800;

export type RawExpense = {
	/** YYYY-MM-DD */
	date: string;
	cents: number;
	title: string;
	categories: string[];
	notes: string | null;
};

export type RawDataset = {
	rows: RawExpense[];
	/** Total expenses in the DB, before the MAX_ROWS cap. */
	total: number;
	/** True when older rows were dropped to fit MAX_ROWS. */
	truncated: boolean;
};

/** Fetch every expense (most recent first), capped at MAX_ROWS. */
export async function buildRawDataset(): Promise<RawDataset> {
	const rows = await db.query.expenses.findMany({
		with: { categoryLinks: { with: { category: true } } },
		orderBy: (expense, { desc }) => [desc(expense.date), desc(expense.id)],
		limit: MAX_ROWS + 1
	});

	const truncated = rows.length > MAX_ROWS;
	const kept = truncated ? rows.slice(0, MAX_ROWS) : rows;

	return {
		rows: kept.map((expense) => ({
			date: expense.date,
			cents: expense.amountCents,
			title: expense.title,
			categories: expense.categoryLinks.map((link) => link.category.name),
			notes: expense.notes
		})),
		total: rows.length > MAX_ROWS ? MAX_ROWS + 1 : rows.length,
		truncated
	};
}

/** Render the raw dataset as one compact line per transaction. */
export function rawToPrompt(dataset: RawDataset): string {
	const lines: string[] = [];
	lines.push(
		`Raw expense transactions (${dataset.rows.length} rows${dataset.truncated ? `, most recent only — older rows omitted` : ''}), one per line.`
	);
	lines.push('Format: DATE | AMOUNT | TITLE | [categories] | notes');
	lines.push('');
	for (const expense of dataset.rows) {
		const cats = expense.categories.length ? `[${expense.categories.join(', ')}]` : '[uncategorized]';
		const notes = expense.notes ? ` | ${expense.notes}` : '';
		lines.push(`${expense.date} | ${formatCents(expense.cents)} | ${expense.title} | ${cats}${notes}`);
	}
	return lines.join('\n').trim();
}
