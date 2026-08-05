import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Money is stored as integer cents to avoid floating-point errors.
 * Dates are stored as ISO-8601 strings (YYYY-MM-DD).
 */

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export const incomeStreams = sqliteTable('income_streams', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	/** Gross amount per month, in cents */
	amountCents: integer('amount_cents').notNull(),
	/** 'joint' | 'me' | 'spouse' — whose income this is */
	owner: text('owner').notNull().default('joint'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(date('now'))`)
});

/** Deductions applied to a single income stream (taxes, 401k, insurance...) */
export const deductions = sqliteTable('deductions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	incomeStreamId: integer('income_stream_id')
		.notNull()
		.references(() => incomeStreams.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	/** 'fixed' (cents) or 'percent' (basis points, e.g. 650 = 6.5%) */
	kind: text('kind').notNull().default('fixed'),
	value: integer('value').notNull()
});

// ---------------------------------------------------------------------------
// Funds — buckets that net income is funneled into
// ---------------------------------------------------------------------------

export const funds = sqliteTable('funds', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	description: text('description'),
	/** Marks funds like "Savings" whose contributions accumulate over time */
	isSavings: integer('is_savings', { mode: 'boolean' }).notNull().default(false)
});

/** How each income stream's net amount is split across funds */
export const allocations = sqliteTable('allocations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	incomeStreamId: integer('income_stream_id')
		.notNull()
		.references(() => incomeStreams.id, { onDelete: 'cascade' }),
	fundId: integer('fund_id')
		.notNull()
		.references(() => funds.id, { onDelete: 'cascade' }),
	/** 'fixed' (cents) or 'percent' (basis points) of the stream's net income */
	kind: text('kind').notNull().default('percent'),
	value: integer('value').notNull()
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique()
});

export const expenses = sqliteTable('expenses', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	title: text('title').notNull(),
	amountCents: integer('amount_cents').notNull(),
	/** ISO date the expense occurred (YYYY-MM-DD) */
	date: text('date').notNull(),
	categoryId: integer('category_id').references(() => categories.id, { onDelete: 'restrict' }),
	/** Which fund this expense draws from (nullable = unassigned) */
	fundId: integer('fund_id').references(() => funds.id, { onDelete: 'set null' }),
	notes: text('notes'),
	createdAt: text('created_at')
		.notNull()
		.default(sql`(date('now'))`)
});

/** Join table: an expense can be applied to any number of income streams. */
export const expenseIncomeStreams = sqliteTable('expense_income_streams', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	expenseId: integer('expense_id')
		.notNull()
		.references(() => expenses.id, { onDelete: 'cascade' }),
	incomeStreamId: integer('income_stream_id')
		.notNull()
		.references(() => incomeStreams.id, { onDelete: 'cascade' })
});

// ---------------------------------------------------------------------------
// Relations (for db.query.* relational queries)
// ---------------------------------------------------------------------------

export const incomeStreamsRelations = relations(incomeStreams, ({ many }) => ({
	deductions: many(deductions),
	allocations: many(allocations),
	expenseLinks: many(expenseIncomeStreams)
}));

export const deductionsRelations = relations(deductions, ({ one }) => ({
	incomeStream: one(incomeStreams, {
		fields: [deductions.incomeStreamId],
		references: [incomeStreams.id]
	})
}));

export const fundsRelations = relations(funds, ({ many }) => ({
	allocations: many(allocations),
	expenses: many(expenses)
}));

export const allocationsRelations = relations(allocations, ({ one }) => ({
	incomeStream: one(incomeStreams, {
		fields: [allocations.incomeStreamId],
		references: [incomeStreams.id]
	}),
	fund: one(funds, { fields: [allocations.fundId], references: [funds.id] })
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
	expenses: many(expenses)
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
	category: one(categories, { fields: [expenses.categoryId], references: [categories.id] }),
	fund: one(funds, { fields: [expenses.fundId], references: [funds.id] }),
	incomeStreamLinks: many(expenseIncomeStreams)
}));

export const expenseIncomeStreamsRelations = relations(expenseIncomeStreams, ({ one }) => ({
	expense: one(expenses, {
		fields: [expenseIncomeStreams.expenseId],
		references: [expenses.id]
	}),
	incomeStream: one(incomeStreams, {
		fields: [expenseIncomeStreams.incomeStreamId],
		references: [incomeStreams.id]
	})
}));
