import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Funds and Net Worth were collapsed into one Savings & Net Worth view.
// 308 keeps old bookmarks and the browser's own history working.
export const load: PageServerLoad = () => {
	redirect(308, '/savings');
};
