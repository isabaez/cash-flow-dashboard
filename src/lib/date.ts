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

/**
 * Parse a US-format date "MM/DD/YYYY" (1–2 digit month/day accepted) into an ISO
 * "YYYY-MM-DD" string, or `null` if it isn't a real calendar date. Used by the
 * CSV expense importer; expenses are stored as ISO date strings.
 */
export function parseUsDate(input: string): string | null {
	const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(input.trim());
	if (!m) return null;
	const [, mm, dd, yyyy] = m;
	const month = Number(mm);
	const day = Number(dd);
	const year = Number(yyyy);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	// Reject impossible days (e.g. 02/30) by round-tripping through a UTC Date.
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return `${yyyy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
