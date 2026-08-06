import { goto } from '$app/navigation';

/**
 * Navigate the current page with its repeated `category` params replaced by the
 * given ids (used for the AND category filter on the Expenses page). Other query
 * params (month/year) are preserved.
 */
export function applyCategoryFilters(url: URL, ids: number[]): void {
	const params = new URLSearchParams(url.searchParams);
	params.delete('category');
	for (const id of ids) params.append('category', String(id));
	const query = params.toString();
	goto(query ? `?${query}` : url.pathname, { keepFocus: true, noScroll: true });
}
