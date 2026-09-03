import { db } from '$lib/server/db';
import { fundDeposits, funds, fundWithdrawals } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { parseDollars } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

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

export const load: PageServerLoad = async () => {
	const fundRows = await db.query.funds.findMany({
		with: { allocations: { with: { paycheck: true } }, deposits: true, withdrawals: true },
		orderBy: (f, { asc }) => [asc(f.name)]
	});

	const shaped = fundRows.map((fund) => {
		const contributedCents = fund.allocations.reduce((sum, a) => sum + a.resolvedCents, 0);
		const depositedCents = fund.deposits.reduce((sum, d) => sum + d.amountCents, 0);
		const withdrawnCents = fund.withdrawals.reduce((sum, w) => sum + w.amountCents, 0);

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

		return {
			id: fund.id,
			name: fund.name,
			description: fund.description,
			isSavings: fund.isSavings,
			initialCents: fund.initialCents,
			contributedCents,
			depositedCents,
			withdrawnCents,
			balanceCents: fund.initialCents + contributedCents + depositedCents - withdrawnCents,
			contributionCount: fund.allocations.length,
			depositCount: fund.deposits.length,
			withdrawalCount: fund.withdrawals.length,
			ledger
		};
	});

	const today = new Date().toISOString().slice(0, 10);
	return { funds: shaped, today };
};

/** Read + validate the fields shared by deposits and withdrawals from a submitted form. */
function readMovement(form: FormData) {
	const amountCents = parseDollars(String(form.get('amount') ?? ''));
	const date = String(form.get('date') ?? '').trim();
	const notes = String(form.get('notes') ?? '').trim() || null;

	if (amountCents === null || amountCents <= 0) return { error: 'Enter a valid amount' as const };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date is required' as const };

	return { values: { amountCents, date, notes } };
}

export const actions: Actions = {
	createFund: async ({ request }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const isSavings = form.get('isSavings') === 'on';
		const initialRaw = String(form.get('initial') ?? '').trim();
		const initialCents = initialRaw === '' ? 0 : parseDollars(initialRaw);

		if (!name) return fail(400, { error: 'Name is required' });
		if (initialCents === null || initialCents < 0)
			return fail(400, { error: 'Enter a valid initial value' });

		try {
			await db.insert(funds).values({ name, description, isSavings, initialCents });
		} catch {
			return fail(400, { error: `Fund "${name}" already exists` });
		}
		return { success: true };
	},

	updateFund: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const name = String(form.get('name') ?? '').trim();
		const description = String(form.get('description') ?? '').trim() || null;
		const isSavings = form.get('isSavings') === 'on';
		const initialRaw = String(form.get('initial') ?? '').trim();
		const initialCents = initialRaw === '' ? 0 : parseDollars(initialRaw);

		if (!id) return fail(400, { error: 'Missing fund id' });
		if (!name) return fail(400, { error: 'Name is required' });
		if (initialCents === null || initialCents < 0)
			return fail(400, { error: 'Enter a valid initial value' });

		try {
			await db
				.update(funds)
				.set({ name, description, isSavings, initialCents })
				.where(eq(funds.id, id));
		} catch {
			return fail(400, { error: `Fund "${name}" already exists` });
		}
		return { success: true };
	},

	/** Deleting a fund cascade-deletes its allocations, deposits and withdrawals. */
	deleteFund: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing fund id' });

		await db.delete(funds).where(eq(funds.id, id));
		return { success: true };
	},

	createDeposit: async ({ request }) => {
		const form = await request.formData();
		const fundId = Number(form.get('fundId'));
		if (!fundId) return fail(400, { error: 'Missing fund id' });

		const parsed = readMovement(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		await db.insert(fundDeposits).values({ fundId, ...parsed.values });
		return { success: true };
	},

	updateDeposit: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing deposit id' });

		const existing = await db.query.fundDeposits.findFirst({ where: eq(fundDeposits.id, id) });
		if (!existing) return fail(404, { error: 'Deposit not found' });

		const parsed = readMovement(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		await db.update(fundDeposits).set(parsed.values).where(eq(fundDeposits.id, id));
		return { success: true };
	},

	deleteDeposit: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing deposit id' });

		const existing = await db.query.fundDeposits.findFirst({ where: eq(fundDeposits.id, id) });
		if (!existing) return fail(404, { error: 'Deposit not found' });

		await db.delete(fundDeposits).where(eq(fundDeposits.id, id));
		return { success: true };
	},

	createWithdrawal: async ({ request }) => {
		const form = await request.formData();
		const fundId = Number(form.get('fundId'));
		if (!fundId) return fail(400, { error: 'Missing fund id' });

		const parsed = readMovement(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		await db.insert(fundWithdrawals).values({ fundId, ...parsed.values });
		return { success: true };
	},

	updateWithdrawal: async ({ request }) => {
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
	},

	deleteWithdrawal: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing withdrawal id' });

		const existing = await db.query.fundWithdrawals.findFirst({
			where: eq(fundWithdrawals.id, id)
		});
		if (!existing) return fail(404, { error: 'Withdrawal not found' });
		if (existing.expenseId !== null)
			return fail(400, { error: 'This withdrawal mirrors an expense — delete it on the Expenses page' });

		await db.delete(fundWithdrawals).where(eq(fundWithdrawals.id, id));
		return { success: true };
	}
};
