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

	const rules = deductions.map((deduction) => ({
		kind: deduction.kind as Kind,
		basis: deduction.basis as Basis,
		value: deduction.value
	}));
	const { netCents, resolved } = computeNet(paycheck.grossCents, rules);

	deductions.forEach((deduction, index) => {
		if (deduction.resolvedCents !== resolved[index]) {
			tx.update(paycheckDeductions)
				.set({ resolvedCents: resolved[index] })
				.where(eq(paycheckDeductions.id, deduction.id))
				.run();
		}
	});

	for (const allocation of allocs) {
		const cents = resolveRule(
			{ kind: allocation.kind as Kind, basis: allocation.basis as Basis, value: allocation.value },
			paycheck.grossCents,
			netCents
		);
		if (allocation.resolvedCents !== cents) {
			tx.update(allocations).set({ resolvedCents: cents }).where(eq(allocations.id, allocation.id)).run();
		}
	}
}
