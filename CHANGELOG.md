# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); releases are named by the date they reached production,
and each entry says why the change was made.

## [Unreleased]

### Added

- Project skills keep the docs in step with the code: `/update-changelog` writes each branch's changelog bullets,
  `/update-readme`, `/update-claude-md` and `/update-contributing` check README.md, CLAUDE.md and CONTRIBUTING.md
  against the code (#13)
- `gh pr create` is blocked until CHANGELOG.md has the branch's bullets, and for any pull request into `main`, so no
  change reaches `develop` without a changelog entry (#13)
- Project agents review each branch before its pull request: code, security, docs, tests, accessibility and design,
  plus a builder for one sub-branch in its own worktree (#13)
- CLAUDE.md gains commands, architecture, recipes, deployment and gotchas sections, and `.claude/rules/` holds
  Svelte, SvelteKit, database and accessibility rules drawn from the official docs (#13)
- CONTRIBUTING.md describes the workflow for people: issues, branch names, checks before a pull request, testing on
  `beta` and releasing (#13)
- The README gains a directory layout, a troubleshooting section and a Working with Claude Code section, and the
  project is released under the MIT License (#13)
- This changelog, backfilled from the project's history (#13)
- `CLAUDE.md` sets out the project's working agreements for Claude Code: branching rules under which only the
  maintainer merges pull requests, the vibe-annotations design feedback loop, the `npm run check` and
  `npm run check:contrast` gates, and code conventions (#8)
- A search field on `/categories` filters the tags as you type and keeps the query in `?q=`, so a filtered view can be
  linked and survives a reload (#12)
- Deleting a category that has expenses offers to move them to another category again (#12)

### Changed

- CLAUDE.md's branching section is replaced by the shared Git workflow: every change starts from an issue, branches
  are named `feature/<issue>-…` or `fix/<issue>-…`, and sub-branches `<branch>--<part>` (#13)
- Pull requests are merged with a merge commit only, so `develop` never loses production's history, and `beta` is the
  QA branch (#13)
- The README matches the code again: light and dark themes, tokens as CSS custom properties, the Savings & Net Worth
  page, the dashboard's tiles and charts, and `OLLAMA_URL`, which is set in `docker-compose.yml` rather than `.env`
  (#13)
- Funds and Net Worth are combined into one Savings & Net Worth page at `/savings`; `/funds` and `/net-worth` redirect
  to it, so existing bookmarks keep working (#8)
- Each fund gets its own card on Savings & Net Worth in place of the Funds and "By fund" tables, led by its current
  balance and month-to-date contribution, because the balance is the number people come for and the contribution
  shows whether the fund is still being fed; edit, deposit, withdraw and delete open modals (#8)
- Fund cards are ordered by balance, largest first, instead of by name, with non-savings funds always after the
  savings funds, since this is the savings view (#8)
- Each fund's ledger moves to its own page at `/savings/[id]`, opened from "View all transactions" on its card, with a
  period filter (This year by default) and in, out and net totals for the period (#8)
- Branching rules in `CLAUDE.md` call for one pull request per feature: branches cut from a feature branch are merged
  back into it without a PR of their own, so review happens once per feature rather than once per sub-branch (#11)
- `/categories` lists categories as wrapping tags with their expense counts instead of table rows; edit and delete are
  icons that appear on hover or keyboard focus and open modals, per the project's forms-in-modals convention (#12)
- Body text, including table cells, messages, fund descriptions and filter options, is 16px or larger (it was 15px,
  and 12–13px in places), and labels, buttons, hints and captions are 14px instead of 13px, since 16px is the floor
  the project's legibility rule sets and smaller body text is harder to read for low-vision users (#15)
- On a 320px-wide screen, page header actions drop below the title, the category forms wrap, and the category
  pickers end their list of applied categories in an ellipsis, so the larger text neither runs off the side of the
  page nor gets squeezed beside a button (#15)
- Fund cards on Savings & Net Worth fit as many across as there is room for at 15rem each, instead of four from
  1024px, so the larger totals and balances are no longer squeezed into 170px cards when the sidebar is open (#15)

### Fixed

- Dates in a fund's transaction list stay on one line at phone width, as they do on Expenses and Income (#15)
- The Transactions heading on a fund's page is sized like the other card headings instead of as large as the page
  title (#15)

### Security

- `.claude/settings.local.json`, the per-machine Claude Code permissions file, is no longer committed and is ignored
  along with `.claude/worktrees/`, so local settings stay out of the public repo (#13)

## [2026-09-17]

### Added

- A Snapshot card under the dashboard's headline tiles shows this month's spend for a fixed list of categories
  (`SNAPSHOT_CATEGORIES`), whatever period the category chart is set to; categories are matched by name and
  zero-filled, so a quiet month keeps the row stable (209e255)

### Changed

- The dashboard's headline tiles summarise everything on record instead of the current month: net worth, average net
  cash flow, average monthly spend, and a new average monthly savings tile (money paid into savings funds, less
  withdrawals) in place of the savings rate tile (4f54218)
- Dashboard averages count only complete months with data, leaving out the month in progress, so they agree with the
  Insights page (4f54218)
- The average tiles' arrow and delta compare the month in progress with the all-time average, which always has a
  number to show (209e255)
- The average tiles' hint names the month being compared (for example "Sep 2026 so far vs average"), so a
  below-average reading early in a month reads as expected rather than as bad news (209e255)
- The Expenses by category card picks its period from one dropdown instead of four selects: "All time" by default, or
  any month with expense data (`?month=YYYY-MM`); the dropdown is also the card's only visible label (d61bec7, 662edf3)
- The category period dropdown is announced as a listbox with its selected option, and works with the arrow keys,
  Home/End, Enter/Space and Escape, keeping the semantics the native selects provided (d61bec7)
- The savings rate chart's y-axis is fixed at 0–100%, so small swings no longer read as cliffs (662edf3)
- The "Savings fund growth" chart becomes "Savings overview": one unstacked line per savings fund, showing its balance
  at the start of each month, since the question is how each fund stands rather than what they add up to (net worth
  already answers that); the dashed 12-month projection is gone from it (662edf3)

### Removed

- Tiles on the dashboard and the Net Worth page no longer show sparklines (4f54218)
- The Expenses by category card no longer filters by year or by a from/to date range (d61bec7)
- Charts no longer have a "View as table" disclosure. Instead, screen readers announce each chart's canvas by its
  title and description, so they still get a text equivalent, though a weaker one than the table (662edf3)

## [2026-09-14]

### Fixed

- Chart tooltips draw on hover again. Each chart now sets its own reduced-motion animation instead of replacing
  `Chart.defaults.animation`, which had dropped the animation `type` and made every hover animation throw an error
  (eb9afbd)

## [2026-09-03]

### Added

- The Dashboard (`/`) shows five charts: net income vs expenses, savings rate, expenses by category, each savings
  fund's growth with a dashed 12-month projection, and how each month's gross income splits into deductions, fund
  allocations and take-home pay (0c1c545)
- The Dashboard leads with four headline figures (net worth, net cash flow, savings rate and total spend), each with
  its change and a 12-month trend line, so it opens on the numbers you came for (#3)
- The Dashboard's expenses-by-category chart is a bar chart rather than a pie, because an expense can carry several
  categories and count fully in each, so the totals don't make a meaningful whole. It can be narrowed to a month, a
  year or a range of months, and shows all time by default (972cf4b, b420834, 46cd195)
- Every chart has a "View as table" disclosure with the same data as a table, so screen-reader users get an
  alternative to the chart and anyone can read exact figures (#3)
- A light theme joins the dark one: a switch in the sidebar offers Light, Dark and System, System (the default)
  follows the operating system's setting, a Light or Dark choice is remembered in the browser, and charts redraw in
  the active theme (#3)
- Fund allocations send part of a paycheck into a fund, as a fixed amount or a percentage of gross or net pay
  (63619d7, cca941e)
- Paychecks can be duplicated to a new date with their deductions and fund allocations, and the copy's source can be
  edited first (cca941e, 94096d7)
- Income can be filtered by month or year, and Expenses by month, year and category (63619d7, b679093, cca941e)
- Expenses can be paid from a fund: choosing one records a matching withdrawal in that fund, which stays in step when
  the expense is edited or deleted (63619d7, b679093)
- Expenses can be duplicated to a new date with their categories and fund, and the copy's title and amount can be
  edited first (b679093, 94096d7)
- Expenses can be selected in bulk to add or remove categories, or to set or clear the fund they're paid from
  (94096d7, 46cd195)
- CSV import on Expenses reads a bank statement with Date, Title, Amount and Categories columns (dates as
  `MM/DD/YYYY`). It creates any categories that don't exist yet, skips rows that fail and lists them by line number
  (b420834, 46cd195)
- The category picker has a filter box that narrows the list as you type and gets focus when the picker opens
  (94096d7, 46cd195)
- Funds can be added, edited and deleted, each with an optional description, a savings flag and a starting balance
  from before tracking began (63619d7, 76aab80)
- The Funds page (`/funds`) lists each fund's starting balance, contributions, withdrawals and balance in a sortable
  table, and expands each fund into a ledger of its contributions and withdrawals (76aab80)
- Fund withdrawals can be added, edited and deleted from a fund's ledger. Withdrawals that mirror an expense are
  changed from Expenses instead (63619d7, 76aab80)
- Funds take manual deposits for money added by hand rather than from a paycheck: each fund's ledger has an "Add
  deposit" form, deposits are edited or removed inline like withdrawals, and they count toward fund balances, net
  worth and the Dashboard, with a new Deposited column on the Funds and Net Worth pages (#2)
- A default set of funds is created on first start, only when there are none, so funds you delete stay deleted
  (63619d7)
- The Net Worth page (`/net-worth`) charts net worth (the sum of fund balances) by month, with a dashed 12-month
  projection at the average monthly change over the last six months (or the single month's change when there is only
  one), plus a breakdown by fund (ac37dfd, 94096d7)
- Categories have a colour, set with a colour picker (new ones start with a random colour), and show as coloured tags
  on Categories and Expenses; the tag text keeps the category's hue and changes only its lightness, so it stays
  readable in both themes whatever colour is picked (63619d7, 4af95bc, #3)
- The Insights page (`/insights`) streams budgeting tips and trends about all recorded income and expenses from a
  local Ollama model, so no financial data leaves the machine. It runs two passes: a summary of totals computed on the
  server, and a read of individual transactions (the 800 most recent) (972cf4b)
- `OLLAMA_MODEL` and `OLLAMA_URL` set the model and server Insights uses. When Ollama can't be reached, the page shows
  setup steps instead of an error (972cf4b)
- On small screens, the navigation opens from a menu button as a slide-out drawer that takes keyboard focus, keeps it
  out of the page behind, and closes on Escape, on navigation or on a tap outside it (63619d7, #3)
- `./start.sh` (also `npm run docker:up`) starts the app in Docker with one command: it builds the image, creates the
  database schema, runs Ollama in its own container next to the app, so Insights works without installing Ollama,
  pulls the model if it's missing and waits until the app answers on port 3000 (12b76a3)
- `./start.sh --import-db` copies an existing local database into an empty Docker data volume on first run (12b76a3)
- `OLLAMA_MODEL` and `ORIGIN` for the Docker setup can be set in a `.env` file next to `docker-compose.yml` (12b76a3)
- `npm run check:contrast` checks the theme colours against WCAG contrast ratios in both themes, so contrast can't
  regress silently (#3)
- `node scripts/seed-dev-data.mjs` fills an empty local database with 18 months of sample paychecks and expenses, so
  the design can be checked against realistic volumes instead of empty states; it refuses a database that already has
  paychecks unless given `--force`, which wipes and reseeds (#3)

### Changed

- **Breaking:** The Income page (`/income`) records dated paychecks, each with a source, gross amount, owner and optional
  notes, instead of monthly income streams; income streams don't carry over, so re-enter income as paychecks (63619d7, cca941e)
- Percentage deductions on a paycheck apply to either gross or net pay (63619d7, cca941e)
- Expenses carry any number of categories instead of at most one (63619d7, b679093)
- Deleting a category removes it from its expenses instead of asking for a replacement category to move them to
  (4af95bc, b420834)
- A collapsible left sidebar replaces the top navigation bar on screens 1024px and wider, and pages widen from 1100px
  to 1440px, so wide tables such as Funds and Income get the room the old layout wasted (#3)
- Colour only signals state: green and red mark positive and negative amounts, and charts reuse those hues, so a
  chart's income green matches the rest of the interface (#3)
- The interface uses the Inter typeface, bundled with the app rather than loaded from a font CDN, so it keeps working
  offline and private (#3)
- Each page has its own browser tab title, the page name followed by the dashboard's name, instead of one title for
  every page (#3, f5f4624)

### Removed

- Expenses are no longer applied to income streams, and the Income split panel that divided each expense across them
  is gone (63619d7, b679093)

### Fixed

- Form control borders meet the 3:1 contrast minimum (they were 1.27:1), so input boundaries are no longer
  effectively invisible to low-vision users (#3)
- Screen readers announce CSV import progress, the bulk-selection count, streaming Insights output and form errors,
  and every table has a caption and scoped headers (#3)
- Animations, chart animations included, are turned off when the operating system's reduced-motion setting is on,
  which nothing honoured before (#3)

## [2026-08-04]

### Added

- Cash Flow Dashboard is a locally hosted household finance tracker: income, expenses, funds and categories are kept
  in a SQLite database on the machine that runs it (0205fcc)
- The Income page (`/income`) lists income streams with a monthly gross amount and an owner, each with fixed or
  percentage deductions and the net that remains (0205fcc)
- The Expenses page (`/expenses`) records dated expenses with an optional category and notes, and splits each one
  across the income streams it applies to, in proportion to their income (0205fcc)
- The Categories page (`/categories`) adds and renames categories. Deleting one that has expenses moves them to a
  replacement category first (0205fcc)
- The Funds page (`/funds`) is a read-only list of funds and the income streams that feed them (0205fcc)
