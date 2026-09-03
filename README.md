# Cash Flow Dashboard

Locally hosted household finance tracker — a database of all dated financial movements (paychecks,
expenses, fund contributions/deposits/withdrawals) for two people. SvelteKit (Svelte 5) + TypeScript +
SQLite (Drizzle ORM) + SCSS/BEM, dark theme.

## Setup

### Docker (one command)

```bash
./start.sh
```

Builds the image, starts the app plus an Ollama sidecar, creates the schema, pulls the model if
it's missing, and serves on <http://localhost:3000>. First run downloads the model (~4.7 GB for
`llama3.1`), so give it time.

```bash
./start.sh --import-db   # first run only: copy an existing ./data/cashflow.db into the volume
docker compose logs -f app
docker compose down
```

Notes:

- **Data** lives in the `cash-flow-dashboard_cashflow-data` Docker volume, not in `./data`. Back it
  up with
  `docker run --rm -v cash-flow-dashboard_cashflow-data:/d -v "$PWD":/out alpine tar czf /out/cashflow-backup.tar.gz -C /d .`
  `docker compose down` keeps the volume; `down -v` deletes it.
- **Ollama** runs as a container so Insights works with no host install, but a Linux container on
  macOS gets no Metal/GPU access — it's CPU-only and slower than a host-native Ollama. Its port is
  intentionally not published, so it won't collide with one you already run on 11434. To use a host
  Ollama instead, set `OLLAMA_URL=http://host.docker.internal:11434` in a `.env` file.
- `OLLAMA_MODEL` and `ORIGIN` can be overridden from a `.env` file next to `docker-compose.yml`.

### Local development

```bash
npm install
npm run db:push   # creates data/cashflow.db from the Drizzle schema
npm run dev
```

Production without Docker: `npm run build && npm start` (adapter-node, serves on port 3000).

Nine default funds (401k, 403b, Roth IRAs, Wedding Fund, Shared Expenses Fund, BTC/Gold/Silver)
are seeded on first boot when the `funds` table is empty; deleted defaults stay deleted.

## Conventions

- **Money** is stored as integer cents (`amountCents`, `grossCents`, `resolvedCents`). Use
  `formatCents` / `parseDollars` / `bpsOf` from `$lib/money`.
- **Percentages** (deductions, allocations) are stored as basis points: `650` = 6.5%.
- **Dates** are ISO strings (`YYYY-MM-DD`).
- **Styling**: SCSS with BEM, dark theme. Global tokens in `src/lib/styles/_variables.scss`;
  shared blocks (`.button`, `.card`, `.field`, `.table`) in `global.scss`. Components import
  tokens with `@use 'variables' as *;` (resolved via `loadPaths` in `vite.config.ts`).
- **Forms** open in the shared `Modal.svelte` (native `<dialog>`: Escape closes, focus is
  contained). Filtering is URL-param driven (`?month=YYYY-MM`, `?year=YYYY`, `?category=N`)
  via `FilterBar.svelte`; load functions validate params and fall back to unfiltered.

## Net pay: the two-pass rule

Deductions and allocations are `fixed` (cents) or `percent` (bps), and percents have a `basis`
(`gross` or `net`). "Percent of net" would be circular (net depends on deductions), so net is
computed in two deterministic, order-independent passes (`computeNet` in `$lib/paycheck.ts`):

1. `netBase = gross − fixed deductions − gross-percent deductions`
2. `net = netBase − net-percent deductions` (applied to the pass-1 base, never the final net)

Fund allocations resolve against gross or the **final net** — they split net rather than reduce
it, so they carry no circularity.

Every deduction/allocation row stores `resolvedCents` — the cent amount its rule produced —
recomputed transactionally on any paycheck mutation (`recomputePaycheck` in
`$lib/server/db/recompute.ts`). Analysis queries are therefore plain dated `SUM`s.

## Schema

- `paychecks` — dated income entries: date, title, `grossCents`, owner (`me` / `spouse`), notes
- `paycheck_deductions` — per-paycheck; kind (`fixed` / `percent`), basis (`gross` / `net`),
  value, `resolvedCents`
- `funds` — contribution buckets (401k, Roth IRA, BTC...); `isSavings` flags accumulating funds;
  `initialCents` is an optional starting balance from before tracking began
- `allocations` — a portion of one paycheck funneled into a fund (contribution); same
  kind/basis/value/`resolvedCents` shape
- `fund_withdrawals` — dated withdrawals from a fund; `expenseId` is set when the withdrawal
  mirrors an expense paid from the fund (synced on expense create/edit/delete, read-only in the
  fund ledger)
- `fund_deposits` — dated manual deposits into a fund, for money that doesn't come from a
  paycheck allocation
- `categories` — expense categories; `color` is a `#rrggbb` hex used for the category's tag
- `expenses` — title, amount, date, notes
- `expense_categories` — join table; an expense carries any number of categories
  (unique on expense + category, `restrict` on category delete)

Fund balances and net worth are **derived**:
`initialCents + Σ allocations.resolvedCents + Σ deposits − Σ withdrawals`.
Net worth is fund cost basis only — market gains/losses are not tracked.

Deleting a category either unlinks it from expenses or reassigns the links to a replacement,
in one transaction (see `src/routes/categories/+page.server.ts`).

## AI insights (local, on-device)

The **Insights** page generates budgeting tips and trend findings from **all** your recorded
income and expenses using a local LLM — inference is loopback-only to [Ollama](https://ollama.com),
so no financial data leaves the machine. Two complementary passes (`src/routes/insights/+server.ts`,
`?mode=`):

- **Summary insights** — the model interprets an exact, server-computed digest
  (`src/lib/server/insights/digest.ts`) of pre-aggregated figures, so every number it cites is correct.
- **Raw transaction analysis** — the model reads the individual transactions
  (`src/lib/server/insights/raw.ts`) and finds patterns a totals summary would miss (recurring
  charges, frequent small purchases, outliers). Capped at the 800 most recent rows to fit the
  model's context.

Prerequisite — install Ollama, then pull a model and make sure the server is running:

```bash
ollama pull llama3.1   # ~4.7 GB; the default model
ollama serve           # usually auto-runs after install
```

Configure via environment variables (both optional):

- `OLLAMA_MODEL` — model tag to use (default `llama3.1`). On lower-RAM Macs a smaller model such
  as `llama3.2:3b` or `qwen2.5:3b` is faster; remember to `ollama pull` it first.
- `OLLAMA_URL` — base URL of the Ollama server (default `http://127.0.0.1:11434`).

If Ollama isn't reachable, the page shows a setup hint instead of failing hard.

## Pages

- **Dashboard** — five overview charts via `Chart.svelte`: monthly net income vs expenses, savings
  fund growth (cumulative, stacked per savings fund), expenses by category (current month), savings
  rate over time, and a paycheck flow breakdown (gross split into deductions / allocations / take-home)
- **Income** — paycheck CRUD + duplicate-to-date; expandable detail with deductions and fund
  allocations; month/year filter
- **Expenses** — expense CRUD + duplicate-to-date; multi-category via `MultiSelect.svelte`;
  month/year/category filter; optional "pay from fund" that records a mirrored fund withdrawal
- **Funds** — fund CRUD; per-fund ledger of contributions (from paychecks) plus manual deposits
  and withdrawals (both edited inline); running balance
- **Net Worth** — cumulative monthly series with a dashed 12-month projection (trailing 6-month
  average rate) via `Chart.svelte`; per-fund breakdown
- **Categories** — CRUD with unlink-or-reassign delete; each category has an editable color
  (`<input type="color">`) rendered as a tag via `CategoryTag.svelte` here and on Expenses
- **Insights** — local-LLM analysis of all recorded data; two streaming passes: a summary over a
  server-computed digest and a raw pass over individual transactions (see "AI insights" above)

## Roadmap

- [x] Paycheck ledger: dated paychecks, deductions with gross/net basis, fund allocations
- [x] Expenses with many-to-many categories; month/year/category filtering
- [x] Funds page with deposit/withdrawal ledger and balances
- [x] Net worth page with projection chart
- [x] Dark theme, top-bar/drawer nav, modal forms, keyboard accessibility
- [x] Dashboard charts (reuse `Chart.svelte`): net income vs expenses, savings fund growth,
      expenses by category, savings rate over time, paycheck flow breakdown
- [x] AI insights page: local on-device LLM (Ollama) — a summary pass over a server-computed
      digest and a raw pass over individual transactions
- [ ] CSV export of filtered tables; text search; per-category budgets; SQLite backup
