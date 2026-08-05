import { db } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const fundRows = await db.query.funds.findMany({
		with: { allocations: { with: { incomeStream: true } } },
		orderBy: (f, { asc }) => [asc(f.name)]
	});
	return { funds: fundRows };
};
