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
	deductions.forEach((d, i) => {
		if (d.kind === 'fixed') {
			resolved[i] = d.value;
			netBaseCents -= d.value;
		} else if (d.basis === 'gross') {
			resolved[i] = bpsOf(grossCents, d.value);
			netBaseCents -= resolved[i];
		}
	});

	let netCents = netBaseCents;
	deductions.forEach((d, i) => {
		if (d.kind === 'percent' && d.basis === 'net') {
			resolved[i] = bpsOf(netBaseCents, d.value);
			netCents -= resolved[i];
		}
	});

	return { netBaseCents, netCents, resolved };
}

/** Resolve an allocation rule to cents given the paycheck's gross and final net. */
export function resolveRule(rule: Rule, grossCents: number, netCents: number): number {
	if (rule.kind === 'fixed') return rule.value;
	return bpsOf(rule.basis === 'gross' ? grossCents : netCents, rule.value);
}
