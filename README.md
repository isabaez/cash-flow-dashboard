# Cash Flow Dashboard

Locally hosted household finance tracker — a database of all dated financial movements (paychecks,
expenses, fund contributions/deposits/withdrawals) for two people. SvelteKit (Svelte 5) + TypeScript +
SQLite (Drizzle ORM) + SCSS/BEM, with light and dark themes.

## Setup

Prerequisites: [Docker Desktop](https://docs.docker.com/get-docker/) for the one-command setup, or Node 22
(the version the Docker image uses) for local development.

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
  Ollama instead, change `OLLAMA_URL` in `docker-compose.yml` to `http://host.docker.internal:11434`;
  unlike the two settings below, it isn't read from `.env`.
- `OLLAMA_MODEL` and `ORIGIN` can be overridden from a `.env` file next to `docker-compose.yml`.

### Local development

```bash
npm install
npm run db:push   # creates data/cashflow.db from the Drizzle schema
npm run dev
```

The dev server answers on <http://localhost:5173>. `node scripts/seed-dev-data.mjs` fills a fresh database
with realistic fake data for UI work; it refuses a database that already has paychecks (`--force` wipes it).

Production without Docker: `npm run build && npm start` (adapter-node, serves on port 3000).

Nine default funds (401k, 403b, Roth IRAs, Wedding Fund, Shared Expenses Fund, BTC/Gold/Silver)
are seeded on first boot when the `funds` table is empty; deleted defaults stay deleted.

## Layout

```text
src/routes/          one folder per page: +page.server.ts (load and form actions) and +page.svelte
src/lib/components/  shared UI: Modal, ChartFigure, StatTile, SortableHeader, PeriodFilter, FundCard, …
src/lib/server/      server-only code: db/ (connection, schema, recompute), fund movements, insights/
src/lib/styles/      design tokens for both themes, breakpoints, mixins and global.scss
src/lib/*.ts         money, dates, paycheck maths, CSV parsing, chart and colour helpers
scripts/             check-contrast.mjs (npm run check:contrast) and seed-dev-data.mjs
static/fonts/        the self-hosted Inter font
data/                the local SQLite database (not committed)
start.sh             one-command Docker start: build, run, pull the model, wait until healthy
docker-compose.yml   the app plus an Ollama sidecar; Dockerfile and docker-entrypoint.sh build and start it
.claude/             Claude Code: skills, agents, rules and the pull-request check
```

## Conventions

- **Money** is stored as integer cents (`amountCents`, `grossCents`, `resolvedCents`). Use
  `formatCents` / `parseDollars` / `bpsOf` from `$lib/money`.
- **Percentages** (deductions, allocations) are stored as basis points: `650` = 6.5%.
- **Dates** are ISO strings (`YYYY-MM-DD`).
- **Styling**: SCSS with BEM, light and dark themes. Design tokens are CSS custom properties in
  `src/lib/styles/_tokens.scss`, used directly as `var(--surface-1)`; body text is 16px
  (`--text-base`) and labels 14px (`--text-sm`); shared blocks (`.button`, `.card`, `.field`,
  `.table`, `.form-error`) are in `global.scss`. Breakpoints stay Sass: components write
  `@use 'breakpoints' as *;` (resolved via `loadPaths` in `vite.config.ts`).
- **Forms** open in the shared `Modal.svelte` (native `<dialog>`: Escape closes, focus is
  contained). Filtering is URL-param driven (`?month=YYYY-MM`, `?year=YYYY`, `?category=N`)
  via `FilterBar.svelte`, plus `?q=` on Categories and `?period=` on a fund's transactions; load
  functions validate params and fall back to unfiltered.

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
income and expenses using a local LLM — inference goes only to a local [Ollama](https://ollama.com) (loopback in
development, the Compose network in Docker), so no financial data leaves the machine. Two complementary passes (`src/routes/insights/+server.ts`,
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

- **Dashboard** — all-time headline tiles (net worth, average net cash flow, monthly spend and
  savings), a Snapshot of the current month so far, and five charts via `ChartFigure.svelte`: net
  income vs expenses, savings rate, expenses by category for a chosen month or all time, a savings
  overview (each savings fund's balance at the start of every month), and where each month's income
  goes (gross split into deductions / fund contributions / take-home)
- **Income** — paycheck CRUD + duplicate-to-date; expandable detail with deductions and fund
  allocations; month/year filter
- **Expenses** — expense CRUD + duplicate-to-date; multi-category via `MultiSelect.svelte`;
  month/year/category filter; optional "pay from fund" that records a mirrored fund withdrawal;
  bulk category and fund changes on selected rows; CSV import of a bank statement
- **Savings & Net Worth** (`/savings`) — net worth over time with a dashed 12-month projection
  (trailing 6-month average rate), and a card per fund. Each fund opens its transactions view
  (`/savings/[id]`): current balance, contributions from paychecks, and manual deposits and
  withdrawals edited inline. The old `/funds` and `/net-worth` routes redirect here
- **Categories** — a searchable tag cloud; CRUD with unlink-or-reassign delete; each category has an editable color
  (`<input type="color">`) rendered as a tag via `CategoryTag.svelte` here and on Expenses
- **Insights** — local-LLM analysis of all recorded data; two streaming passes: a summary over a
  server-computed digest and a raw pass over individual transactions (see "AI insights" above)

## Roadmap

- [x] Paycheck ledger: dated paychecks, deductions with gross/net basis, fund allocations
- [x] Expenses with many-to-many categories; month/year/category filtering
- [x] Savings & Net Worth view: fund cards, a per-fund transactions view with deposits and
      withdrawals, and net worth over time with a 12-month projection
- [x] Light and dark themes (system or pinned), sidebar/drawer nav, modal forms, keyboard accessibility
- [x] Dashboard: all-time headline tiles, a monthly Snapshot, and charts for net income vs
      expenses, savings rate, expenses by category, savings overview and where income goes
- [x] CSV import of bank statements; bulk category and fund changes on expenses
- [x] Categories as a searchable tag cloud
- [x] AI insights page: local on-device LLM (Ollama) — a summary pass over a server-computed
      digest and a raw pass over individual transactions
- [ ] CSV export of filtered tables; text search; per-category budgets; SQLite backup

## Troubleshooting

- **Every form fails with "Cross-site POST form submissions are forbidden"**: form posts are checked
  against `ORIGIN`, which defaults to `http://localhost:3000`. Browsing by any other address (a LAN IP,
  a hostname) needs `ORIGIN` set to that URL in `.env`, then `docker compose up -d`.
- **Insights says it couldn't reach a local Ollama server**: in Docker, check
  `docker compose logs ollama` (the first model pull takes a while); locally, run `ollama serve` and
  `ollama pull llama3.1`.
- **A large CSV import fails without Docker**: adapter-node accepts 512kB request bodies by default,
  and Compose raises that to 10M. Start it with `BODY_SIZE_LIMIT=10M npm start`.

## Working with Claude Code

This project is set up for [Claude Code](https://code.claude.com/docs). [CLAUDE.md](CLAUDE.md) holds the rules
Claude follows here; [CONTRIBUTING.md](CONTRIBUTING.md) describes the same workflow for people.

**Skills** (run with `/<name>`, or Claude runs them when they apply):

- `/update-changelog` — adds this branch's changes to CHANGELOG.md; Claude runs it before every pull request
- `/update-readme` — checks this README against the code and fixes what drifted
- `/update-claude-md` — keeps CLAUDE.md accurate; `/update-claude-md deep` audits it thoroughly
- `/update-contributing` — keeps CONTRIBUTING.md in step with the workflow

**Agents** (Claude runs the ones that apply before opening a pull request):

- `code-reviewer` — correctness, regressions, conventions and the git workflow, on every pull request
- `security-auditor` — security and, since the repo is public, sensitive information in the change
- `docs-reviewer` — README, CLAUDE.md, CONTRIBUTING.md and CHANGELOG.md claims the change affects
- `test-engineer` — tests for changed logic; with no test runner yet, it proposes one instead
- `accessibility-auditor` — WCAG 2.2 AA in the running app, both themes, when UI files change
- `design-reviewer` — tokens, themes and layout at every breakpoint, after the accessibility audit
- `workstream-builder` — builds one sub-branch of a big feature inside its own worktree

**Rules:** `.claude/rules/` holds stack conventions that load with matching files: `svelte.md`, `sveltekit.md`,
`database.md` and `accessibility.md`.

**Hooks:** `gh pr create` is blocked until CHANGELOG.md has this branch's bullets, and for any pull request into
`main`.

## License

Released under the MIT License; see [LICENSE](LICENSE).
