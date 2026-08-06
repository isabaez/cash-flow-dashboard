/** Format integer cents as a currency string, e.g. 123456 -> "$1,234.56" */
export function formatCents(cents: number, currency = 'USD'): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Parse a user-entered dollar string, e.g. "1,234.56" -> 123456 cents. Returns null if invalid. */
export function parseDollars(input: string): number | null {
	const cleaned = input.replace(/[$,\s]/g, '');
	if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
	return Math.round(parseFloat(cleaned) * 100);
}

/** Format basis points as a percentage, e.g. 650 -> "6.5%" */
export function formatBps(bps: number): string {
	return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

/** Basis points of a base amount, rounded to cents: bpsOf(500000, 650) -> 32500 */
export function bpsOf(baseCents: number, bps: number): number {
	return Math.round((baseCents * bps) / 10000);
}

/** Parse a user-entered percentage, e.g. "6.5" or "6.5%" -> 650 basis points. Returns null if invalid. */
export function parseBps(input: string): number | null {
	const cleaned = input.replace(/[%\s]/g, '');
	if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
	return Math.round(parseFloat(cleaned) * 100);
}
