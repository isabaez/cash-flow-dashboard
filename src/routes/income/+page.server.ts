import { db } from '$lib/server/db';
import { incomeStreams, deductions } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import { parseDollars, parseBps } from '$lib/money';
import type { Actions, PageServerLoad } from './$types';

const OWNERS = ['joint', 'me', 'spouse'];

export const load: PageServerLoad = async () => {
	const streams = await db.query.incomeStreams.findMany({
		with: { deductions: true },
		orderBy: (s, { asc }) => [asc(s.title)]
	});
	return { streams };
};

export const actions: Actions = {
	createStream: async ({ request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '').trim();
		const owner = String(form.get('owner') ?? 'joint');
		const amountCents = parseDollars(String(form.get('amount') ?? ''));

		if (!title) return fail(400, { error: 'Name is required' });
		if (amountCents === null || amountCents < 0)
			return fail(400, { error: 'Enter a valid income amount' });
		if (!OWNERS.includes(owner)) return fail(400, { error: 'Invalid owner' });

		await db.insert(incomeStreams).values({ title, amountCents, owner });
		return { success: true };
	},

	updateStream: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const title = String(form.get('title') ?? '').trim();
		const owner = String(form.get('owner') ?? 'joint');
		const amountCents = parseDollars(String(form.get('amount') ?? ''));

		if (!id) return fail(400, { error: 'Missing income stream id' });
		if (!title) return fail(400, { error: 'Name is required' });
		if (amountCents === null || amountCents < 0)
			return fail(400, { error: 'Enter a valid income amount' });
		if (!OWNERS.includes(owner)) return fail(400, { error: 'Invalid owner' });

		await db.update(incomeStreams).set({ title, amountCents, owner }).where(eq(incomeStreams.id, id));
		return { success: true };
	},

	/** Deleting a stream cascade-deletes its deductions (FK onDelete: 'cascade'). */
	deleteStream: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing income stream id' });

		await db.delete(incomeStreams).where(eq(incomeStreams.id, id));
		return { success: true };
	},

	createDeduction: async ({ request }) => {
		const form = await request.formData();
		const incomeStreamId = Number(form.get('incomeStreamId'));
		const title = String(form.get('title') ?? '').trim();
		const kind = String(form.get('kind') ?? 'fixed');
		const rawValue = String(form.get('value') ?? '');

		if (!incomeStreamId) return fail(400, { error: 'Missing income stream id' });
		if (!title) return fail(400, { error: 'Deduction name is required' });
		if (kind !== 'fixed' && kind !== 'percent')
			return fail(400, { error: 'Invalid deduction kind' });

		const value = kind === 'percent' ? parseBps(rawValue) : parseDollars(rawValue);
		if (value === null || value < 0) return fail(400, { error: 'Enter a valid deduction amount' });
		if (kind === 'percent' && value > 10000)
			return fail(400, { error: 'Percentage cannot exceed 100%' });

		await db.insert(deductions).values({ incomeStreamId, title, kind, value });
		return { success: true };
	},

	updateDeduction: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		const title = String(form.get('title') ?? '').trim();
		const kind = String(form.get('kind') ?? 'fixed');
		const rawValue = String(form.get('value') ?? '');

		if (!id) return fail(400, { error: 'Missing deduction id' });
		if (!title) return fail(400, { error: 'Deduction name is required' });
		if (kind !== 'fixed' && kind !== 'percent')
			return fail(400, { error: 'Invalid deduction kind' });

		const value = kind === 'percent' ? parseBps(rawValue) : parseDollars(rawValue);
		if (value === null || value < 0) return fail(400, { error: 'Enter a valid deduction amount' });
		if (kind === 'percent' && value > 10000)
			return fail(400, { error: 'Percentage cannot exceed 100%' });

		await db.update(deductions).set({ title, kind, value }).where(eq(deductions.id, id));
		return { success: true };
	},

	deleteDeduction: async ({ request }) => {
		const form = await request.formData();
		const id = Number(form.get('id'));
		if (!id) return fail(400, { error: 'Missing deduction id' });

		await db.delete(deductions).where(eq(deductions.id, id));
		return { success: true };
	}
};
