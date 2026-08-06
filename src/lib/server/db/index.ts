import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

const DB_PATH = process.env.DATABASE_PATH ?? './data/cashflow.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

const DEFAULT_FUNDS = [
	{ name: '401k', isSavings: true },
	{ name: '403b', isSavings: true },
	{ name: 'Roth IRA (mine)', isSavings: true },
	{ name: 'Roth IRA (spouse)', isSavings: true },
	{ name: 'Wedding Fund', isSavings: true },
	{ name: 'Shared Expenses Fund', isSavings: false },
	{ name: 'BTC Fund', isSavings: true },
	{ name: 'Gold Fund', isSavings: true },
	{ name: 'Silver Fund', isSavings: true }
];

// Seed only when the funds table is empty so user deletions stick.
try {
	const existing = db.select({ id: schema.funds.id }).from(schema.funds).limit(1).all();
	if (existing.length === 0) {
		db.insert(schema.funds).values(DEFAULT_FUNDS).run();
	}
} catch {
	// Table doesn't exist yet — run `npm run db:push` first.
}
