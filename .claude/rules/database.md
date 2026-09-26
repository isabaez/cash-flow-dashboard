---
paths:
  - "src/lib/server/**"
  - "src/routes/**/+page.server.ts"
  - "src/routes/**/+server.ts"
  - "drizzle.config.ts"
  - "scripts/*.mjs"
---
# Drizzle on better-sqlite3

- better-sqlite3 is synchronous: queries end in `.run()`, `.get()` or `.all()`, and a transaction
  callback never `await`s, because the transaction commits at the first `await`.
  Source: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md (checked 2026-09-26)
- Inside `db.transaction((tx) => …)` every query goes through `tx`, not `db`; a nested
  `tx.transaction(…)` is a savepoint. Source: https://orm.drizzle.team/docs/transactions (checked 2026-09-26)
- `drizzle-kit push` diffs `schema.ts` against the database and applies it with no migration files;
  `--force` accepts data-loss statements without asking, which is how `docker-entrypoint.sh` runs
  it. `--verbose` prints every statement first; the installed 0.28 also has `--strict` (confirm
  each) but not the docs' newer `--explain`.
  Source: https://orm.drizzle.team/docs/drizzle-kit-push (checked 2026-09-26)
