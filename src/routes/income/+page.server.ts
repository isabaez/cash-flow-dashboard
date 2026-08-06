import { db } from '$lib/server/db';
import { allocations, funds, paycheckDeductions, paychecks } from '$lib/server/db/schema';
import { recomputePaycheck } from '$lib/server/db/recompute';
import { and, desc, eq, like, sql } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { parseBps, parseDollars } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

const OWNERS = ['me', 'spouse'];
const KINDS = ['fixed', 'percent'];
const BASES = ['gross', 'net'];

export const load: PageServerLoad = async ({ url }) => {
	const monthRaw = url.searchParams.get('month');
	const yearRaw = url.searchParams.get('year');

	// Invalid params fall back to unfiltered.
	const month = monthRaw && /^\d{4}-\d{2}$/.test(monthRaw) ? monthRaw : null;
	const year = !month && yearRaw && /^\d{4}$/.test(yearRaw) ? yearRaw : null;

	let where;
	if (month) where = like(paychecks.date, `${month}-%`);
	else if (year) where = like(paychecks.date, `${year}-%`);

	const monthCol = sql<string>`substr(${paychecks.date}, 1, 7)`;
	const yearCol = sql<string>`substr(${paychecks.date}, 1, 4)`;

	const [paycheckRows, fundRows, monthRows, yearRows] = await Promise.all([
		db.query.paychecks.findMany({
			with: { deductions: true, allocations: { with: { fund: true } } },
			where,
			orderBy: (p, { desc: d }) => [d(p.date), d(p.id)]
		}),
		db.query.funds.findMany({ orderBy: (f, { asc }) => [asc(f.name)] }),
		db.selectDistinct({ month: monthCol }).from(paychecks).orderBy(desc(monthCol)),
		db.selectDistinct({ year: yearCol }).from(paychecks).orderBy(desc(yearCol))
	]);

	const today = new Date().toISOString().slice(0, 10);
	return {
		paychecks: paycheckRows,
		funds: fundRows,
		availableMonths: monthRows.map((r) => r.month),
		availableYears: yearRows.map((r) => r.year),
		filters: { month, year },
		today
	};
};

/** Read + validate the shared paycheck fields from a submitted form. */
function readPaycheck(form: FormData) {
	const title = String(form.get('title') ?? '').trim();
	const date = String(form.get('date') ?? '').trim();
	const grossCents = parseDollars(String(form.get('gross') ?? ''));
	const owner = String(form.get('owner') ?? 'me');
	const notes = String(form.get('notes') ?? '').trim() || null;

	if (!title) return { error: 'Title is required' as const };
	if (grossCents === null || grossCents < 0)
		return { error: 'Enter a valid gross amount' as const };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'A valid date is required' as const };
	if (!OWNERS.includes(owner)) return { error: 'Invalid owner' as const };

	return { values: { title, date, grossCents, owner, notes } };
}

/** Read + validate a deduction/allocation rule (kind, basis, value) from a form. */
function readRule(form: FormData) {
	const kind = String(form.get('kind') ?? 'fixed');
	const basis = String(form.get('basis') ?? 'gross');
	const rawValue = String(form.get('value') ?? '');

	if (!KINDS.includes(kind)) return { error: 'Invalid type' as const };
	if (!BASES.includes(basis)) return { error: 'Invalid basis' as const };

	const value = kind === 'percent' ? parseBps(rawValue) : parseDollars(rawValue);
	if (value === null || value < 0) return { error: 'Enter a valid amount' as const };
	if (kind === 'percent' && value > 10000)
		return { error: 'Percentage cannot exceed 100%' as const };

	return { rule: { kind, basis, value } };
}

export const actions: Actions = {
	createPaycheck: async ({ request }) => {
		const parsed = readPaycheck(await request.formData());
		if ('error' in parsed) return fail(400, { error: parsed.error });

		await db.insert(paychecks).values(parsed.values);
		return { success: true };
	},

	updatePaycheck: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing paycheck id' });

		const parsed = readPaycheck(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		db.transaction((tx) => {
			tx.update(paychecks).set(parsed.values).where(eq(paychecks.id, id)).run();
			// A gross change moves every resolved deduction/allocation amount.
			recomputePaycheck(tx, id);
		});
		return { success: true };
	},

	/** Deleting a paycheck cascade-deletes its deductions and allocations. */
	deletePaycheck: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing paycheck id' });

		await db.delete(paychecks).where(eq(paychecks.id, id));
		return { success: true };
	},

	createDeduction: async ({ request }) => {
		const form = await request.formData();
		const paycheckId = Number(form.get('paycheckId'));
		const title = String(form.get('title') ?? '').trim();

		if (!paycheckId) return fail(400, { error: 'Missing paycheck id' });
		if (!title) return fail(400, { error: 'Deduction name is required' });

		const parsed = readRule(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		db.transaction((tx) => {
			tx.insert(paycheckDeductions)
				.values({ paycheckId, title, ...parsed.rule, resolvedCents: 0 })
				.run();
			recomputePaycheck(tx, paycheckId);
		});
		return { success: true };
	},

	updateDeduction: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const title = String(form.get('title') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing deduction id' });
		if (!title) return fail(400, { error: 'Deduction name is required' });

		const parsed = readRule(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const existing = await db.query.paycheckDeductions.findFirst({
			where: eq(paycheckDeductions.id, id)
		});
		if (!existing) return fail(404, { error: 'Deduction not found' });

		db.transaction((tx) => {
			tx.update(paycheckDeductions)
				.set({ title, ...parsed.rule })
				.where(eq(paycheckDeductions.id, id))
				.run();
			recomputePaycheck(tx, existing.paycheckId);
		});
		return { success: true };
	},

	deleteDeduction: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing deduction id' });

		const existing = await db.query.paycheckDeductions.findFirst({
			where: eq(paycheckDeductions.id, id)
		});
		if (!existing) return fail(404, { error: 'Deduction not found' });

		db.transaction((tx) => {
			tx.delete(paycheckDeductions).where(eq(paycheckDeductions.id, id)).run();
			recomputePaycheck(tx, existing.paycheckId);
		});
		return { success: true };
	},

	createAllocation: async ({ request }) => {
		const form = await request.formData();
		const paycheckId = Number(form.get('paycheckId'));
		const fundId = Number(form.get('fundId'));

		if (!paycheckId) return fail(400, { error: 'Missing paycheck id' });
		if (!fundId) return fail(400, { error: 'Choose a fund' });

		const parsed = readRule(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const fund = await db.query.funds.findFirst({ where: eq(funds.id, fundId) });
		if (!fund) return fail(400, { error: 'Choose a fund' });

		db.transaction((tx) => {
			tx.insert(allocations)
				.values({ paycheckId, fundId, ...parsed.rule, resolvedCents: 0 })
				.run();
			recomputePaycheck(tx, paycheckId);
		});
		return { success: true };
	},

	updateAllocation: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const fundId = Number(form.get('fundId'));

		if (!id) return fail(400, { error: 'Missing allocation id' });
		if (!fundId) return fail(400, { error: 'Choose a fund' });

		const parsed = readRule(form);
		if ('error' in parsed) return fail(400, { error: parsed.error });

		const existing = await db.query.allocations.findFirst({ where: eq(allocations.id, id) });
		if (!existing) return fail(404, { error: 'Allocation not found' });

		db.transaction((tx) => {
			tx.update(allocations)
				.set({ fundId, ...parsed.rule })
				.where(eq(allocations.id, id))
				.run();
			recomputePaycheck(tx, existing.paycheckId);
		});
		return { success: true };
	},

	deleteAllocation: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing allocation id' });

		await db.delete(allocations).where(eq(allocations.id, id));
		return { success: true };
	},

	/** Copy a paycheck (including deductions and fund allocations) to a new date. */
	duplicatePaycheck: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const date = String(form.get('date') ?? '').trim();

		if (!id) return fail(400, { error: 'Missing paycheck id' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(400, { error: 'A valid date is required' });

		const source = await db.query.paychecks.findFirst({
			where: eq(paychecks.id, id),
			with: { deductions: true, allocations: true }
		});
		if (!source) return fail(404, { error: 'Paycheck not found' });

		db.transaction((tx) => {
			const { lastInsertRowid } = tx
				.insert(paychecks)
				.values({
					title: source.title,
					date,
					grossCents: source.grossCents,
					owner: source.owner,
					notes: source.notes
				})
				.run();
			const paycheckId = Number(lastInsertRowid);
			if (source.deductions.length > 0) {
				tx.insert(paycheckDeductions)
					.values(
						source.deductions.map((d) => ({
							paycheckId,
							title: d.title,
							kind: d.kind,
							basis: d.basis,
							value: d.value,
							resolvedCents: d.resolvedCents
						}))
					)
					.run();
			}
			if (source.allocations.length > 0) {
				tx.insert(allocations)
					.values(
						source.allocations.map((a) => ({
							paycheckId,
							fundId: a.fundId,
							kind: a.kind,
							basis: a.basis,
							value: a.value,
							resolvedCents: a.resolvedCents
						}))
					)
					.run();
			}
			recomputePaycheck(tx, paycheckId);
		});
		return { success: true };
	}
};
