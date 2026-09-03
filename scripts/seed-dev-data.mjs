#!/usr/bin/env node
/**
 * Development seed data. NOT part of the app — it exists so the redesign can be
 * checked against realistic volumes (18 months of paychecks, ~500 expenses) instead
 * of empty states. Writes to ./data/cashflow.db, which is gitignored.
 *
 * Refuses to run against a database that already has paychecks, so it cannot
 * clobber real data. Pass --force to wipe and reseed.
 *
 *   node scripts/seed-dev-data.mjs [--force]
 */

import Database from 'better-sqlite3';

const DB_PATH = process.env.DATABASE_PATH ?? './data/cashflow.db';
const force = process.argv.includes('--force');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const existing = db.prepare('SELECT COUNT(*) AS n FROM paychecks').get().n;
if (existing > 0 && !force) {
	console.error(`${DB_PATH} already has ${existing} paychecks. Re-run with --force to wipe it.`);
	process.exit(1);
}

// Deterministic PRNG so re-seeding produces the same figures and screenshots are
// comparable between runs.
let seed = 20260903;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (lo, hi) => Math.round(lo + rand() * (hi - lo));

const bpsOf = (base, bps) => Math.round((base * bps) / 10000);

/** Mirrors computeNet() in src/lib/paycheck.ts — the same two-pass rule. */
function computeNet(grossCents, deductions) {
	const resolved = new Array(deductions.length).fill(0);
	let netBase = grossCents;
	deductions.forEach((d, i) => {
		if (d.kind === 'fixed') {
			resolved[i] = d.value;
			netBase -= d.value;
		} else if (d.basis === 'gross') {
			resolved[i] = bpsOf(grossCents, d.value);
			netBase -= resolved[i];
		}
	});
	let net = netBase;
	deductions.forEach((d, i) => {
		if (d.kind === 'percent' && d.basis === 'net') {
			resolved[i] = bpsOf(netBase, d.value);
			net -= resolved[i];
		}
	});
	return { net, resolved };
}

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

db.exec('BEGIN');
try {
	for (const t of [
		'expense_categories', 'fund_withdrawals', 'fund_deposits', 'expenses',
		'categories', 'allocations', 'paycheck_deductions', 'paychecks', 'funds'
	]) {
		db.prepare(`DELETE FROM ${t}`).run();
	}

	// --- funds --------------------------------------------------------------
	const FUNDS = [
		['401k', 'Employer plan, 6% of gross', 1, 4_820_000],
		['403b', "Spouse's employer plan", 1, 2_140_000],
		['Roth IRA (mine)', null, 1, 1_560_000],
		['Roth IRA (spouse)', null, 1, 1_310_000],
		['Wedding Fund', 'Target: $32,000 by Jun 2027', 1, 180_000],
		['Shared Expenses Fund', 'Joint float for household bills', 0, 250_000],
		['BTC Fund', null, 1, 640_000],
		['Gold Fund', null, 1, 310_000],
		['Silver Fund', null, 1, 95_000]
	];
	const insFund = db.prepare(
		'INSERT INTO funds (name, description, is_savings, initial_cents) VALUES (?,?,?,?)'
	);
	const fundId = {};
	for (const [name, desc, savings, initial] of FUNDS) {
		fundId[name] = insFund.run(name, desc, savings, initial).lastInsertRowid;
	}

	// --- categories ---------------------------------------------------------
	const CATEGORIES = [
		['Groceries', '#5fb98f'], ['Dining', '#e8804f'], ['Housing', '#7c9aff'],
		['Transport', '#54b8c9'], ['Utilities', '#c0a44e'], ['Health', '#e0699b'],
		['Subscriptions', '#9b7ede'], ['Travel', '#4fa3e8'], ['Shopping', '#d4756b'],
		['Pets', '#8db84a']
	];
	const insCat = db.prepare('INSERT INTO categories (name, color) VALUES (?,?)');
	const catId = {};
	for (const [name, color] of CATEGORIES) catId[name] = insCat.run(name, color).lastInsertRowid;

	// --- paychecks, deductions, allocations ---------------------------------
	const insPay = db.prepare(
		'INSERT INTO paychecks (date, title, gross_cents, owner, notes) VALUES (?,?,?,?,?)'
	);
	const insDed = db.prepare(
		'INSERT INTO paycheck_deductions (paycheck_id, title, kind, basis, value, resolved_cents) VALUES (?,?,?,?,?,?)'
	);
	const insAlloc = db.prepare(
		'INSERT INTO allocations (paycheck_id, fund_id, kind, basis, value, resolved_cents) VALUES (?,?,?,?,?,?)'
	);

	const EARNERS = [
		{ owner: 'me', title: 'Northwind Labs', gross: 425_000, plan: '401k' },
		{ owner: 'spouse', title: 'Cedar Health', gross: 362_000, plan: '403b' }
	];
	const DEDUCTIONS = [
		{ title: 'Federal income tax', kind: 'percent', basis: 'gross', value: 1_800 },
		{ title: 'State income tax', kind: 'percent', basis: 'gross', value: 520 },
		{ title: 'Social Security & Medicare', kind: 'percent', basis: 'gross', value: 765 },
		{ title: 'Health insurance', kind: 'fixed', basis: 'gross', value: 18_400 },
		{ title: 'Dental & vision', kind: 'fixed', basis: 'gross', value: 4_200 }
	];

	// 18 months ending with the current month.
	const END = { y: 2026, m: 9 };
	const months = [];
	for (let i = 17; i >= 0; i--) {
		const t = END.y * 12 + (END.m - 1) - i;
		months.push({ y: Math.floor(t / 12), m: (t % 12) + 1 });
	}

	for (const { y, m } of months) {
		for (const day of [15, lastDay(y, m)]) {
			for (const earner of EARNERS) {
				// Small variance so the charts are not perfectly flat lines.
				const gross = earner.gross + between(-9_000, 14_000);
				const payId = insPay.run(iso(y, m, day), earner.title, gross, earner.owner, null)
					.lastInsertRowid;

				const { net, resolved } = computeNet(gross, DEDUCTIONS);
				DEDUCTIONS.forEach((d, i) =>
					insDed.run(payId, d.title, d.kind, d.basis, d.value, resolved[i])
				);

				const allocs = [
					{ fund: earner.plan, kind: 'percent', basis: 'gross', value: 600 },
					{ fund: `Roth IRA (${earner.owner === 'me' ? 'mine' : 'spouse'})`, kind: 'fixed', basis: 'net', value: 25_000 },
					{ fund: 'Wedding Fund', kind: 'fixed', basis: 'net', value: 30_000 },
					{ fund: 'BTC Fund', kind: 'percent', basis: 'net', value: 200 }
				];
				for (const a of allocs) {
					const cents =
						a.kind === 'fixed' ? a.value : bpsOf(a.basis === 'gross' ? gross : net, a.value);
					insAlloc.run(payId, fundId[a.fund], a.kind, a.basis, a.value, cents);
				}
			}
		}
	}

	// --- expenses -----------------------------------------------------------
	const RECURRING = [
		['Rent', 'Housing', 245_000, 1], ['Electric', 'Utilities', 9_800, 8],
		['Internet', 'Utilities', 7_500, 8], ['Water & sewer', 'Utilities', 5_400, 12],
		['Car insurance', 'Transport', 14_200, 5], ['Phone plan', 'Utilities', 8_500, 18],
		['Streaming bundle', 'Subscriptions', 4_299, 22], ['Gym', 'Health', 5_600, 3],
		['Cloud storage', 'Subscriptions', 999, 26], ['Pet insurance', 'Pets', 4_800, 14]
	];
	const VARIABLE = [
		['Grocery run', ['Groceries'], 6_000, 21_000], ['Farmers market', ['Groceries'], 2_200, 6_500],
		['Coffee', ['Dining'], 500, 1_800], ['Dinner out', ['Dining'], 4_500, 14_000],
		['Takeout', ['Dining'], 2_400, 6_800], ['Gas', ['Transport'], 3_800, 7_200],
		['Rideshare', ['Transport'], 1_200, 4_400], ['Pharmacy', ['Health'], 1_500, 8_000],
		['Vet visit', ['Pets'], 7_500, 26_000], ['Dog food', ['Pets', 'Groceries'], 4_000, 9_500],
		['Hardware store', ['Shopping', 'Housing'], 2_000, 12_000],
		['Clothing', ['Shopping'], 3_500, 18_000], ['Books', ['Shopping'], 1_200, 5_500],
		['Weekend trip', ['Travel', 'Dining'], 22_000, 68_000]
	];
	const insExp = db.prepare(
		'INSERT INTO expenses (title, amount_cents, date, notes) VALUES (?,?,?,?)'
	);
	const insLink = db.prepare(
		'INSERT OR IGNORE INTO expense_categories (expense_id, category_id) VALUES (?,?)'
	);
	const insWd = db.prepare(
		'INSERT INTO fund_withdrawals (fund_id, amount_cents, date, notes, expense_id) VALUES (?,?,?,?,?)'
	);

	let expenseCount = 0;
	for (const { y, m } of months) {
		for (const [title, cat, cents, day] of RECURRING) {
			const id = insExp.run(title, cents + between(-400, 900), iso(y, m, Math.min(day, lastDay(y, m))), null)
				.lastInsertRowid;
			insLink.run(id, catId[cat]);
			expenseCount++;
		}
		for (let i = 0; i < between(16, 26); i++) {
			const [title, cats, lo, hi] = pick(VARIABLE);
			const day = between(1, lastDay(y, m));
			const id = insExp.run(title, between(lo, hi), iso(y, m, day), null).lastInsertRowid;
			for (const c of cats) insLink.run(id, catId[c]);
			expenseCount++;
			// A few large expenses are paid straight out of the shared fund, which also
			// records a mirrored withdrawal — exercises the linked-ledger path.
			if (title === 'Weekend trip' && rand() < 0.5) {
				const amount = db.prepare('SELECT amount_cents AS a FROM expenses WHERE id = ?').get(id).a;
				insWd.run(fundId['Shared Expenses Fund'], amount, iso(y, m, day), null, id);
			}
		}
	}

	// --- manual fund movements ----------------------------------------------
	const insDep = db.prepare(
		'INSERT INTO fund_deposits (fund_id, amount_cents, date, notes) VALUES (?,?,?,?)'
	);
	for (const { y, m } of months) {
		if (rand() < 0.45) insDep.run(fundId['Gold Fund'], between(15_000, 60_000), iso(y, m, between(3, 26)), 'Monthly metals buy');
		if (rand() < 0.3) insDep.run(fundId['Silver Fund'], between(8_000, 30_000), iso(y, m, between(3, 26)), null);
		if (rand() < 0.25) insDep.run(fundId['Wedding Fund'], between(50_000, 180_000), iso(y, m, between(3, 26)), 'Gift / bonus');
		if (rand() < 0.15) {
			insWd.run(fundId['Shared Expenses Fund'], between(40_000, 120_000), iso(y, m, between(3, 26)), 'Quarterly true-up', null);
		}
	}

	db.exec('COMMIT');
	const n = (t) => db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
	console.log(
		`Seeded ${months.length} months: ${n('paychecks')} paychecks, ${n('paycheck_deductions')} deductions, ` +
			`${n('allocations')} allocations, ${expenseCount} expenses, ${n('categories')} categories, ` +
			`${n('funds')} funds, ${n('fund_deposits')} deposits, ${n('fund_withdrawals')} withdrawals.`
	);
} catch (error) {
	db.exec('ROLLBACK');
	throw error;
}
