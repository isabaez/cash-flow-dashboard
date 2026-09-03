import { sqliteTable, integer, text, index, unique } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

/**
 * Money is stored as integer cents to avoid floating-point errors.
 * Percentages are stored as basis points (650 = 6.5%).
 * Dates are stored as ISO-8601 strings (YYYY-MM-DD).
 *
 * Net pay is computed with a two-pass rule so a "% of net" value is never
 * circular:
 *   Pass 1: netBase = gross − fixed deductions − gross-percent deductions
 *   Pass 2: net = netBase − net-percent deductions (applied to netBase)
 * Fund allocations resolve against gross or the final net; they split net
 * rather than reduce it, so they carry no circularity.
 *
 * Deductions and allocations store their resolved cent amount alongside the
 * rule that produced it. Resolved values are recomputed transactionally on
 * every paycheck mutation, so analysis queries are plain dated SUMs.
 */

// ---------------------------------------------------------------------------
// Income
// ---------------------------------------------------------------------------

export const paychecks = sqliteTable(
	'paychecks',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** ISO date the paycheck was received (YYYY-MM-DD) */
		date: text('date').notNull(),
		title: text('title').notNull(),
		/** Gross amount in cents */
		grossCents: integer('gross_cents').notNull(),
		/** 'me' | 'spouse' — whose paycheck this is */
		owner: text('owner').notNull().default('me'),
		notes: text('notes'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(date('now'))`)
	},
	(t) => ({ dateIdx: index('paychecks_date_idx').on(t.date) })
);

/** Deductions applied to a single paycheck (taxes, 401k, insurance...) */
export const paycheckDeductions = sqliteTable('paycheck_deductions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	paycheckId: integer('paycheck_id')
		.notNull()
		.references(() => paychecks.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	/** 'fixed' (cents) or 'percent' (basis points) */
	kind: text('kind').notNull().default('fixed'),
	/** 'gross' | 'net' — which base a percent applies to; ignored for fixed */
	basis: text('basis').notNull().default('gross'),
	value: integer('value').notNull(),
	/** Cent amount this rule resolved to, per the two-pass rule */
	resolvedCents: integer('resolved_cents').notNull()
});

// ---------------------------------------------------------------------------
// Funds — buckets that paycheck money is funneled into
// ---------------------------------------------------------------------------

export const funds = sqliteTable('funds', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	description: text('description'),
	/** Marks funds like "401k" whose contributions accumulate over time */
	isSavings: integer('is_savings', { mode: 'boolean' }).notNull().default(false),
	/** Starting balance in cents from before tracking began */
	initialCents: integer('initial_cents').notNull().default(0)
});

/** A portion of one paycheck funneled into a fund (a contribution) */
export const allocations = sqliteTable('allocations', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	paycheckId: integer('paycheck_id')
		.notNull()
		.references(() => paychecks.id, { onDelete: 'cascade' }),
	fundId: integer('fund_id')
		.notNull()
		.references(() => funds.id, { onDelete: 'cascade' }),
	/** 'fixed' (cents) or 'percent' (basis points) */
	kind: text('kind').notNull().default('percent'),
	/** 'gross' | 'net' — which base a percent applies to; ignored for fixed */
	basis: text('basis').notNull().default('net'),
	value: integer('value').notNull(),
	/** Cent amount this rule resolved to */
	resolvedCents: integer('resolved_cents').notNull()
});

/** Money taken out of a fund; not tied to any paycheck */
export const fundWithdrawals = sqliteTable(
	'fund_withdrawals',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fundId: integer('fund_id')
			.notNull()
			.references(() => funds.id, { onDelete: 'cascade' }),
		amountCents: integer('amount_cents').notNull(),
		/** ISO date of the withdrawal (YYYY-MM-DD) */
		date: text('date').notNull(),
		notes: text('notes'),
		/** Set when this withdrawal mirrors an expense paid from the fund; kept in sync with it */
		expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(date('now'))`)
	},
	(t) => ({ dateIdx: index('fund_withdrawals_date_idx').on(t.date) })
);

/** Money put into a fund by hand; not tied to any paycheck */
export const fundDeposits = sqliteTable(
	'fund_deposits',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		fundId: integer('fund_id')
			.notNull()
			.references(() => funds.id, { onDelete: 'cascade' }),
		amountCents: integer('amount_cents').notNull(),
		/** ISO date of the deposit (YYYY-MM-DD) */
		date: text('date').notNull(),
		notes: text('notes'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(date('now'))`)
	},
	(t) => ({ dateIdx: index('fund_deposits_date_idx').on(t.date) })
);

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------

export const categories = sqliteTable('categories', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull().unique(),
	/** Tag color as a #RRGGBB hex string */
	color: text('color').notNull().default('#7c9aff')
});

export const expenses = sqliteTable(
	'expenses',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		title: text('title').notNull(),
		amountCents: integer('amount_cents').notNull(),
		/** ISO date the expense occurred (YYYY-MM-DD) */
		date: text('date').notNull(),
		notes: text('notes'),
		createdAt: text('created_at')
			.notNull()
			.default(sql`(date('now'))`)
	},
	(t) => ({ dateIdx: index('expenses_date_idx').on(t.date) })
);

/** Join table: an expense can carry any number of categories. */
export const expenseCategories = sqliteTable(
	'expense_categories',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		expenseId: integer('expense_id')
			.notNull()
			.references(() => expenses.id, { onDelete: 'cascade' }),
		categoryId: integer('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'restrict' })
	},
	(t) => ({ expenseCategoryUnique: unique('expense_category_unique').on(t.expenseId, t.categoryId) })
);

// ---------------------------------------------------------------------------
// Relations (for db.query.* relational queries)
// ---------------------------------------------------------------------------

export const paychecksRelations = relations(paychecks, ({ many }) => ({
	deductions: many(paycheckDeductions),
	allocations: many(allocations)
}));

export const paycheckDeductionsRelations = relations(paycheckDeductions, ({ one }) => ({
	paycheck: one(paychecks, {
		fields: [paycheckDeductions.paycheckId],
		references: [paychecks.id]
	})
}));

export const fundsRelations = relations(funds, ({ many }) => ({
	allocations: many(allocations),
	withdrawals: many(fundWithdrawals),
	deposits: many(fundDeposits)
}));

export const allocationsRelations = relations(allocations, ({ one }) => ({
	paycheck: one(paychecks, { fields: [allocations.paycheckId], references: [paychecks.id] }),
	fund: one(funds, { fields: [allocations.fundId], references: [funds.id] })
}));

export const fundWithdrawalsRelations = relations(fundWithdrawals, ({ one }) => ({
	fund: one(funds, { fields: [fundWithdrawals.fundId], references: [funds.id] }),
	expense: one(expenses, { fields: [fundWithdrawals.expenseId], references: [expenses.id] })
}));

export const fundDepositsRelations = relations(fundDeposits, ({ one }) => ({
	fund: one(funds, { fields: [fundDeposits.fundId], references: [funds.id] })
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
	expenseLinks: many(expenseCategories)
}));

export const expensesRelations = relations(expenses, ({ many }) => ({
	categoryLinks: many(expenseCategories),
	fundWithdrawals: many(fundWithdrawals)
}));

export const expenseCategoriesRelations = relations(expenseCategories, ({ one }) => ({
	expense: one(expenses, {
		fields: [expenseCategories.expenseId],
		references: [expenses.id]
	}),
	category: one(categories, {
		fields: [expenseCategories.categoryId],
		references: [categories.id]
	})
}));
