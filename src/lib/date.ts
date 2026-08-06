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
