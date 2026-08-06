import { eq } from 'drizzle-orm';
import { computeNet, resolveRule, type Basis, type Kind } from '$lib/paycheck';
import { allocations, paycheckDeductions, paychecks } from './schema';
import type { db } from './index';

type Tx = Parameters<Parameters<(typeof db)['transaction']>[0]>[0];

/**
 * Recompute and persist resolvedCents for every deduction and allocation of a
 * paycheck. Must run inside the same transaction as the triggering mutation.
 */
export function recomputePaycheck(tx: Tx, paycheckId: number): void {
	const paycheck = tx.select().from(paychecks).where(eq(paychecks.id, paycheckId)).get();
	if (!paycheck) return;

	const deductions = tx
		.select()
		.from(paycheckDeductions)
		.where(eq(paycheckDeductions.paycheckId, paycheckId))
		.all();
	const allocs = tx.select().from(allocations).where(eq(allocations.paycheckId, paycheckId)).all();

	const rules = deductions.map((d) => ({
		kind: d.kind as Kind,
		basis: d.basis as Basis,
		value: d.value
	}));
	const { netCents, resolved } = computeNet(paycheck.grossCents, rules);

	deductions.forEach((d, i) => {
		if (d.resolvedCents !== resolved[i]) {
			tx.update(paycheckDeductions)
				.set({ resolvedCents: resolved[i] })
				.where(eq(paycheckDeductions.id, d.id))
				.run();
		}
	});

	for (const a of allocs) {
		const cents = resolveRule(
			{ kind: a.kind as Kind, basis: a.basis as Basis, value: a.value },
			paycheck.grossCents,
			netCents
		);
		if (a.resolvedCents !== cents) {
			tx.update(allocations).set({ resolvedCents: cents }).where(eq(allocations.id, a.id)).run();
		}
	}
}
