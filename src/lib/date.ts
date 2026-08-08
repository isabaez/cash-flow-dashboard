const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec'
];

/**
 * Format an ISO date (YYYY-MM-DD) as e.g. "Aug 3, 2026".
 * Parses the string directly to avoid Date's timezone shifting; non-matching
 * input (e.g. the "—" placeholder) is returned unchanged.
 */
export function formatDate(iso: string): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
	if (!m) return iso;
	const [, year, month, day] = m;
	return `${MONTH_NAMES[Number(month) - 1]} ${Number(day)}, ${year}`;
}

/** Format a month key (YYYY-MM) as e.g. "Aug 2026"; non-matching input is returned unchanged. */
export function monthLabel(month: string): string {
	const [y, m] = month.split('-');
	return `${MONTH_NAMES[Number(m) - 1] ?? m} ${y}`;
}

/** Next month key: "2026-08" -> "2026-09", rolling the year over at December. */
export function nextMonth(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** Contiguous, inclusive list of month keys from `start` to `end` (empty if start > end). */
export function monthRange(start: string, end: string): string[] {
	const months: string[] = [];
	for (let m = start; m <= end; m = nextMonth(m)) months.push(m);
	return months;
}
