/**
 * Fund movement handling shared by the Savings & Net Worth list and the per-fund
 * transactions view. Both pages create, edit and delete the same manual deposits
 * and withdrawals, so the validator, the six form actions and the ledger shape
 * live here rather than being copied into each route.
 */
import { db } from '$lib/server/db';
import { fundDeposits, fundWithdrawals } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail, type Action } from '@sveltejs/kit';
import { parseDollars } from '$lib/money';

export type LedgerEntry = {
	kind: 'contribution' | 'deposit' | 'withdrawal' | 'initial';
	date: string;
	label: string;
	amountCents: number;
	/** Set for manual deposits and withdrawals — contributions are edited from their paycheck. */
	entryId: number | null;
	entryNotes: string | null;
	/** True when the withdrawal mirrors an expense — edited from the Expenses page. */
	expenseLinked: boolean;
};

/** The shape `buildLedger` needs: a fund row loaded with its allocations, deposits and withdrawals. */
export type LedgerSource = {
	initialCents: number;
	allocations: { resolvedCents: number; paycheck: { date: string; title: string } }[];
	deposits: { id: number; date: string; notes: string | null; amountCents: number }[];
	withdrawals: {
		id: number;
		date: string;
		notes: string | null;
		amountCents: number;
		expenseId: number | null;
	}[];
};

/**
 * Every movement for one fund, newest first. The synthetic `initial` entry is the
 * pre-tracking starting balance rather than a dated movement, so it carries the
 * "—" date placeholder and is pinned last instead of being sorted.
 */
export function buildLedger(fund: LedgerSource): LedgerEntry[] {
	const ledger: LedgerEntry[] = [
		...fund.allocations.map(
			(a): LedgerEntry => ({
				kind: 'contribution',
				date: a.paycheck.date,
				label: a.paycheck.title,
				amountCents: a.resolvedCents,
				entryId: null,
				entryNotes: null,
				expenseLinked: false
			})
		),
		...fund.deposits.map(
			(d): LedgerEntry => ({
				kind: 'deposit',
				date: d.date,
				label: d.notes || 'Deposit',
				amountCents: d.amountCents,
				entryId: d.id,
				entryNotes: d.notes,
				expenseLinked: false
			})
		),
		...fund.withdrawals.map(
			(w): LedgerEntry => ({
				kind: 'withdrawal',
				date: w.date,
				label: w.notes || 'Withdrawal',
				amountCents: w.amountCents,
				entryId: w.id,
				entryNotes: w.notes,
				expenseLinked: w.expenseId !== null
			})
		)
	].sort((a, b) => b.date.localeCompare(a.date));

	// The starting balance predates all tracked movements — always last.
	if (fund.initialCents !== 0) {
		ledger.push({
			kind: 'initial',
			date: '—',
			label: 'Initial value',
			amountCents: fund.initialCents,
			entryId: null,
			entryNotes: null,
			expenseLinked: false
		});
	}

	return ledger;
}

/** Read + validate the fields shared by deposits and withdrawals from a submitted form. */
export function readMovement(form: FormData) {
	const amountCents = parseDollars(String(form.get('amount') ?? ''));
	const date = String(form.get('date') ?? '').trim();
	const notes = String(form.get('notes') ?? '').trim() || null;

	if (amountCents === null || amountCents <= 0) return { error: 'Enter a valid amount' as const };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date is required' as const };

	return { values: { amountCents, date, notes } };
}

export const createDeposit: Action = async ({ request }) => {
	const form = await request.formData();
	const fundId = Number(form.get('fundId'));
	if (!fundId) return fail(400, { error: 'Missing fund id' });

	const parsed = readMovement(form);
	if ('error' in parsed) return fail(400, { error: parsed.error });

	await db.insert(fundDeposits).values({ fundId, ...parsed.values });
	return { success: true };
};

export const updateDeposit: Action = async ({ request }) => {
	const form = await request.formData();
	const id = Number(form.get('id'));
	if (!id) return fail(400, { error: 'Missing deposit id' });

	const existing = await db.query.fundDeposits.findFirst({ where: eq(fundDeposits.id, id) });
	if (!existing) return fail(404, { error: 'Deposit not found' });

	const parsed = readMovement(form);
	if ('error' in parsed) return fail(400, { error: parsed.error });

	await db.update(fundDeposits).set(parsed.values).where(eq(fundDeposits.id, id));
	return { success: true };
};

export const deleteDeposit: Action = async ({ request }) => {
	const form = await request.formData();
	const id = Number(form.get('id'));
	if (!id) return fail(400, { error: 'Missing deposit id' });

	const existing = await db.query.fundDeposits.findFirst({ where: eq(fundDeposits.id, id) });
	if (!existing) return fail(404, { error: 'Deposit not found' });

	await db.delete(fundDeposits).where(eq(fundDeposits.id, id));
	return { success: true };
};

export const createWithdrawal: Action = async ({ request }) => {
	const form = await request.formData();
	const fundId = Number(form.get('fundId'));
	if (!fundId) return fail(400, { error: 'Missing fund id' });

	const parsed = readMovement(form);
	if ('error' in parsed) return fail(400, { error: parsed.error });

	await db.insert(fundWithdrawals).values({ fundId, ...parsed.values });
	return { success: true };
};

export const updateWithdrawal: Action = async ({ request }) => {
	const form = await request.formData();
	const id = Number(form.get('id'));
	if (!id) return fail(400, { error: 'Missing withdrawal id' });

	const existing = await db.query.fundWithdrawals.findFirst({
		where: eq(fundWithdrawals.id, id)
	});
	if (!existing) return fail(404, { error: 'Withdrawal not found' });
	if (existing.expenseId !== null)
		return fail(400, { error: 'This withdrawal mirrors an expense — edit it on the Expenses page' });

	const parsed = readMovement(form);
	if ('error' in parsed) return fail(400, { error: parsed.error });

	await db.update(fundWithdrawals).set(parsed.values).where(eq(fundWithdrawals.id, id));
	return { success: true };
};

export const deleteWithdrawal: Action = async ({ request }) => {
	const form = await request.formData();
	const id = Number(form.get('id'));
	if (!id) return fail(400, { error: 'Missing withdrawal id' });

	const existing = await db.query.fundWithdrawals.findFirst({
		where: eq(fundWithdrawals.id, id)
	});
	if (!existing) return fail(404, { error: 'Withdrawal not found' });
	if (existing.expenseId !== null)
		return fail(400, {
			error: 'This withdrawal mirrors an expense — delete it on the Expenses page'
		});

	await db.delete(fundWithdrawals).where(eq(fundWithdrawals.id, id));
	return { success: true };
};

/** The six movement actions, ready to spread into a route's `actions` export. */
export const movementActions = {
	createDeposit,
	updateDeposit,
	deleteDeposit,
	createWithdrawal,
	updateWithdrawal,
	deleteWithdrawal
};
