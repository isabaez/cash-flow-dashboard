# Cash Flow Dashboard

Locally hosted household finance tracker. SvelteKit (Svelte 5) + TypeScript + SQLite (Drizzle ORM) + SCSS/BEM.

## Setup

```bash
npm install
npm run db:push   # creates data/cashflow.db from the Drizzle schema
npm run dev
```

Production: `npm run build && npm start` (adapter-node, serves on port 3000).

## Conventions

- **Money** is stored as integer cents (`amountCents`). Use `formatCents` / `parseDollars` from `$lib/money`.
- **Percentages** (deductions, allocations) are stored as basis points: `650` = 6.5%.
- **Dates** are ISO strings (`YYYY-MM-DD`).
- **Styling**: SCSS with BEM. Global tokens in `src/lib/styles/_variables.scss`; shared blocks (`.button`, `.card`, `.field`, `.table`) in `global.scss`. Components import tokens with `@use 'variables' as *;` (resolved via `loadPaths` in `vite.config.ts`).

## Schema

- `income_streams` — title, gross `amountCents`, owner (`joint` / `me` / `spouse`)
- `deductions` — per-stream; `kind` is `fixed` (cents) or `percent` (bps)
- `funds` — buckets (Savings, Utilities, Discretionary...); `isSavings` flags accumulating funds
- `allocations` — splits a stream's net income across funds (fixed or percent)
- `categories` — expense categories
- `expenses` — title, amount, date, category (required), fund (optional)

Deleting a category with expenses requires choosing a replacement; reassignment + delete happen in one transaction (see `src/routes/categories/+page.server.ts` — this is the reference pattern for CRUD actions).

## Roadmap

- [x] Schema, DB client, layout, SCSS foundation
- [x] Categories CRUD with delete-and-reassign
- [ ] Income streams CRUD + deductions + fund allocations (validate percent splits ≤ 100%)
- [ ] Funds CRUD
- [ ] Expenses CRUD with category/fund assignment
- [ ] Dashboard charts (Chart.js): month-over-month cash flow, accumulated savings contributions, expenses by category
