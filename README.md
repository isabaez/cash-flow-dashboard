# Cash Flow Dashboard

Locally hosted household finance tracker — a database of all dated financial movements (paychecks,
expenses, fund contributions/withdrawals) for two people. SvelteKit (Svelte 5) + TypeScript +
SQLite (Drizzle ORM) + SCSS/BEM, dark theme.

## Setup

```bash
npm install
npm run db:push   # creates data/cashflow.db from the Drizzle schema
npm run dev
```

Production: `npm run build && npm start` (adapter-node, serves on port 3000).

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
- `categories` — expense categories; `color` is a `#rrggbb` hex used for the category's tag
- `expenses` — title, amount, date, notes
- `expense_categories` — join table; an expense carries any number of categories
  (unique on expense + category, `restrict` on category delete)

Fund balances and net worth are **derived**: `initialCents + Σ allocations.resolvedCents − Σ withdrawals`.
Net worth is fund cost basis only — market gains/losses are not tracked.

Deleting a category either unlinks it from expenses or reassigns the links to a replacement,
in one transaction (see `src/routes/categories/+page.server.ts`).

## Pages

- **Dashboard** — five overview charts via `Chart.svelte`: monthly net income vs expenses, savings
  fund growth (cumulative, stacked per savings fund), expenses by category (current month), savings
  rate over time, and a paycheck flow breakdown (gross split into deductions / allocations / take-home)
- **Income** — paycheck CRUD + duplicate-to-date; expandable detail with deductions and fund
  allocations; month/year filter
- **Expenses** — expense CRUD + duplicate-to-date; multi-category via `MultiSelect.svelte`;
  month/year/category filter; optional "pay from fund" that records a mirrored fund withdrawal
- **Funds** — fund CRUD; per-fund ledger of contributions (from paychecks) and withdrawals
  (edited inline); running balance
- **Net Worth** — cumulative monthly series with a dashed 12-month projection (trailing 6-month
  average rate) via `Chart.svelte`; per-fund breakdown
- **Categories** — CRUD with unlink-or-reassign delete; each category has an editable color
  (`<input type="color">`) rendered as a tag via `CategoryTag.svelte` here and on Expenses

## Roadmap

- [x] Paycheck ledger: dated paychecks, deductions with gross/net basis, fund allocations
- [x] Expenses with many-to-many categories; month/year/category filtering
- [x] Funds page with withdrawal ledger and balances
- [x] Net worth page with projection chart
- [x] Dark theme, top-bar/drawer nav, modal forms, keyboard accessibility
- [x] Dashboard charts (reuse `Chart.svelte`): net income vs expenses, savings fund growth,
      expenses by category, savings rate over time, paycheck flow breakdown
- [ ] CSV export of filtered tables; text search; per-category budgets; SQLite backup
