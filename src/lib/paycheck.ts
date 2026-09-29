import { bpsOf } from '$lib/money';

export type Kind = 'fixed' | 'percent';
export type Basis = 'gross' | 'net';

/** A deduction or allocation rule: fixed cents, or percent (bps) of gross/net. */
export interface Rule {
	kind: Kind;
	basis: Basis;
	value: number;
}

/**
 * Two-pass net calculation:
 *   Pass 1: netBase = gross − fixed − percent-of-gross deductions
 *   Pass 2: net = netBase − percent-of-net deductions (applied to netBase,
 *           never the final net — that would be circular)
 * Order-independent: no rule's result depends on another rule's position.
 * `resolved` is aligned with the input array.
 */
export function computeNet(
	grossCents: number,
	deductions: Rule[]
): { netBaseCents: number; netCents: number; resolved: number[] } {
	const resolved = new Array<number>(deductions.length).fill(0);

	let netBaseCents = grossCents;
	deductions.forEach((deduction, index) => {
		if (deduction.kind === 'fixed') {
			resolved[index] = deduction.value;
			netBaseCents -= deduction.value;
		} else if (deduction.basis === 'gross') {
			resolved[index] = bpsOf(grossCents, deduction.value);
			netBaseCents -= resolved[index];
		}
	});

	let netCents = netBaseCents;
	deductions.forEach((deduction, index) => {
		if (deduction.kind === 'percent' && deduction.basis === 'net') {
			resolved[index] = bpsOf(netBaseCents, deduction.value);
			netCents -= resolved[index];
		}
	});

	return { netBaseCents, netCents, resolved };
}

/** Resolve an allocation rule to cents given the paycheck's gross and final net. */
export function resolveRule(rule: Rule, grossCents: number, netCents: number): number {
	if (rule.kind === 'fixed') return rule.value;
	return bpsOf(rule.basis === 'gross' ? grossCents : netCents, rule.value);
}
