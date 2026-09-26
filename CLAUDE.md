# Cash Flow Dashboard — working agreements

SvelteKit 2 (Svelte 5 runes) + TypeScript + SCSS + Drizzle/SQLite, with a local Ollama behind
Insights. Dev server on **5173** (`npm run dev`); the Docker build serves **3000**
(`npm run docker:up`). README.md is the product doc: read its section for the area you touch.

## Commands

Before any UI change is called done:

```bash
npm run check          # svelte-check
npm run check:contrast # WCAG 2.2 ratios in both themes — exits 1 on a failure
npm run build          # production build; also stops on client code importing $lib/server
```

No test runner. `node scripts/seed-dev-data.mjs` fills `data/cashflow.db` with fake data for UI
work; it refuses a database that already has paychecks (`--force` wipes it).

Two traps when verifying in the browser: `export const` of anything other than SvelteKit's
own names (`load`, `actions`, …) in a `+page.server.ts` is a 500 that `npm run check` does
not catch — only the running server does (a `_` prefix is allowed; shared code goes in `$lib`).
And reading a computed `opacity` immediately after `.focus()` returns the mid-transition value,
so let a transition settle before concluding a reveal is broken.

Verify in the browser rather than asserting: drive the preview, check the console, test
keyboard reachability, and screenshot both themes.

<!-- init-project:git-workflow v2 — managed by /init-project; re-sync replaces everything up to the end marker, so put project notes below it -->
## Git workflow

| Branch | Holds | Rules for Claude |
|---|---|---|
| `main` (or `master`) | Production | Never branch from it, open a PR into it or merge into it. The dev deploys by merging `develop` in a PR titled exactly `[ production deploy ]`. |
| `develop` | Reviewed work waiting for production; the base for all work | Cut every branch from an up-to-date `origin/develop` and open every PR into it. Never merge into it or commit on it. |
| `beta` (or `deploy`) | Features in review, merged together for QA | Merge a branch into it only when the dev asks. Never branch from it, merge it anywhere, or open a PR from or into it. |

**Issues.** Every feature and fix has a GitHub issue. Always ask the dev before creating an issue or linking work to
an existing one: search first (`gh issue list --search "<words>"`), then propose "link #n" or the title and body.

**Branches.** `feature/<issue>-<short-description>` or `fix/<issue>-<short-description>`, lowercase and hyphenated
(`feature/42-savings-fund-cards`). Start from the remote, whatever is checked out:
`git fetch origin && git switch --no-track -c <branch> origin/develop`. Catch up by merging `origin/develop` in;
never rebase or force-push a branch that has been pushed.

**Sub-branches.** A big feature or fix may get sub-branches cut from it, named `<branch>--<short-sub-description>`
(`feature/42-savings-fund-cards--chart`): no issue, no PR, no CHANGELOG.md edits (the parent writes the bullets).
State their dependency order and file collisions up front, then merge each back with `git merge --no-ff`: the
foundation before the ones that depend on it start, all of them before final review. Parallel ones run in worktrees
under `.claude/worktrees/`; work on one file stays in one sub-branch. Ask once before deleting merged ones.

**Pull requests.** When the branch is ready: run the project agents (Agents below), then the `update-changelog` skill
(a hook blocks `gh pr create` until CHANGELOG.md changed), and `update-readme`, `update-claude-md` or
`update-contributing` when the change touches what they cover. `git push -u origin <branch>`, then
`gh pr create --base develop` with a body that starts `Closes #<issue>`, then says what changed and why, how it was
verified, and which sub-branches were merged in and why the work was split. The dev reviews and merges.

**QA, only when the dev asks.** In the main checkout: `git fetch origin`; stop and ask if tracked files have
uncommitted changes; `git switch <qa-branch> && git pull --ff-only`; `git merge --no-ff origin/develop`, then
`git merge --no-ff <branch>`; `git push origin <qa-branch>`. Fix problems on the branch and merge it again.
Rebuilding the QA branch is described in CONTRIBUTING.md.

**Production.** Before merging `[ production deploy ]` the dev can run `/update-changelog release` on develop and
commit the result. Afterwards `main` has a merge commit `develop` lacks: expected. If `main` ever has code `develop`
lacks, tell the dev.

**Always.** Never stash, discard or reset uncommitted work (the dev may be using GitHub Desktop). Delete a branch
only when the dev approves. Never commit secrets. In a public repo keep personal paths, emails, names, hostnames,
IPs, account IDs, tokens and personal, financial or health data out of files, commits, issues and PRs.
<!-- /init-project:git-workflow -->

### Branches in this project

- Production is `main`, QA is `beta`; `develop` is the default branch.
- To test `beta`, run `npm run dev` in the main checkout after the QA merge (5173, seed
  data), never `./start.sh`: that rebuilds the real app on 3000 from `beta` and pushes its schema
  onto the real data.
- Never run `./start.sh` or `docker compose` in a worktree: the Compose project name is fixed, so
  it would replace the running app with that branch.
- Keep local `develop` matching `origin/develop`.

Setting up a worktree: symlink `node_modules` and copy `data/` in, or `npm run check`
and `npm run dev` will not run there. Run `npx svelte-kit sync` once in a fresh worktree
before `npm run check`. `.gitignore` only lists `node_modules/` (the directory form), so
the symlink is excluded repo-wide via `.git/info/exclude` instead — do not commit it.
`preview_start` launches against the primary working directory, not the worktree, so run
`npx vite dev --port <free port>` from inside the worktree when previewing a branch.

<!-- init-project:changelog v1 — managed by /init-project; re-sync replaces everything up to the end marker, so put project notes below it -->
## Changelog

`CHANGELOG.md` follows Keep a Changelog: `## [Unreleased]`, then releases `## [YYYY-MM-DD]` (the day the
`[ production deploy ]` merge reached production), newest first, each with `### Added`, `### Changed`, `### Removed`,
`### Fixed`, `### Security` in that order, only the ones that have bullets.
- One user-visible change per bullet, the reason in the wording, the issue at the end: "Export file names include
  the date, so exports from different days don't overwrite each other (#5)". Never invent a reason: ask the dev, and
  if there is none, state just the change.
- Only `[Unreleased]` is edited by hand; a correction to a release is a new bullet. The `update-changelog` skill
  writes the bullets before every PR, moves shipped bullets under their release date, and cuts a release with
  `/update-changelog release`.
- `CHANGELOG.md merge=union` in `.gitattributes` only helps local merges. After any merge that touches it, run
  `python3 .claude/skills/update-changelog/scripts/changelog.py lint CHANGELOG.md` from the repo root (`normalize
  --write` tidies it); resolve a GitHub conflict by merging `origin/develop` into the branch locally.
<!-- /init-project:changelog -->

## Architecture

- **Routes** (`src/routes/<page>/`): `+page.server.ts` loads through Drizzle (`db` from
  `$lib/server/db`) and handles every write as a named form action; `+page.svelte` renders it.
  JSON endpoints: `expenses/import/+server.ts` (CSV) and `insights/+server.ts` (streams Ollama).
- **State** lives only in SQLite (`DATABASE_PATH`, default `./data/cashflow.db`; a Docker
  volume in the container). `recomputePaycheck` stores `resolvedCents` inside each paycheck
  mutation's transaction; balances and net worth are derived in queries (README › Net pay,
  › Schema).
- **Server-only** `src/lib/server/`: `db/`, `fundMovements.ts` (actions shared by both `/savings`
  pages) and `insights/`. Client helpers are `src/lib/*.ts`; components `src/lib/components/`.
- **Theme**: an inline script in `src/app.html` sets `data-theme` before first paint, then
  `src/lib/theme.svelte.ts` takes over; charts re-read their colours from `theme.resolved`.

## Recipes

### Add a page or a form
1. `src/routes/<name>/+page.server.ts` (`load`, named `actions`) and `+page.svelte` with a
   `<svelte:head><title>` like the other routes; a new page gets a `navLinks` entry in
   `src/lib/nav.ts`.
2. Reuse `src/lib/components/` (`StatTile`, `ChartFigure`, `SortableHeader`, `PeriodFilter`,
   `Modal`) before writing a new component.
3. Actions parse amounts with `parseDollars` / `parseBps` and return `fail(400, { error })`.
4. Writes go through `tx` in `db.transaction((tx) => …)`; paycheck changes call
   `recomputePaycheck`.
5. Forms sit in `Modal.svelte` with `method="POST"` and `use:enhance`.
6. A new column: `src/lib/server/db/schema.ts`, `npm run db:push`, README › Schema (see
   Gotchas). A merged or renamed page leaves a 308 redirect (`src/routes/funds/+page.server.ts`).

### Change a design element
1. Edit the token in both theme mixins (`theme-dark`, `theme-light`) in
   `src/lib/styles/_tokens.scss`.
2. `npm run check:contrast` must pass. Shared blocks (`.button`, `.card`, `.field`, `.table`)
   are in `global.scss`.
3. Check both themes at phone width, 768px and 1024px.

<!-- init-project:conventions v1 — managed by /init-project; re-sync replaces everything up to the end marker, so put project notes below it -->
## Code conventions and accessibility

These apply to new and changed code; existing code is brought in line through its refactor issue, not in passing.
Stack-specific practice from the official docs is in `.claude/rules/`, which loads with the files it covers.
- **Names:** descriptive, not verbose. No single-letter names, loop counters and callback parameters included
  (`index`, `event`, `error`).
- **CSS:** BEM with descriptive block names (`savings-card__total--negative`); never style by id. Style state through
  its semantic attribute when one exists (`[aria-expanded="true"]`, `[aria-current]`, `:disabled`), else a modifier.
- **JS hooks:** prefer the framework's refs. When a script has to find an element, use a `js-` prefixed class
  (`js-period-toggle`) that is never styled; never hook onto a styling class.
- **Accessibility (WCAG 2.2 AA):** native elements first; everything works by keyboard alone, in a logical order,
  with a visible focus indicator and no traps; every control has an accessible name; text contrast 4.5:1 (3:1 for
  large text and UI parts); colour is never the only signal; respect `prefers-reduced-motion`; targets ≥ 24×24 px.
- **Legibility:** body text 16px or more, set in `rem`; line-height 1.5 or more; lines of about 80 characters at
  most; layouts survive 200% zoom and a 320px-wide viewport.
- **Helpers:** reuse the project's accessibility helpers (listed below). When a pattern repeats (visually hidden
  text, skip link, focus management, live announcements), add a helper instead of a one-off.
<!-- /init-project:conventions -->

### Conventions in this project

- **Money is integer cents** end to end. `formatCents` / `parseDollars` / `bpsOf` from
  `$lib/money`; percentages are basis points; dates are ISO strings.
- **Design tokens** are CSS custom properties in `src/lib/styles/_tokens.scss` (OKLCH, dark
  default + light override). Component CSS writes `var(--surface-1)` directly — there is no
  Sass variable bridge. Breakpoints stay Sass in `_breakpoints.scss` because media queries
  cannot read custom properties.
- **Colour means state.** Green and red are reserved for financial polarity, never
  decoration, and never the sole carrier of meaning — pair them with a sign, an arrow, a
  dash pattern or a label.
- **No icon library.** Icons are hand-drawn inline SVGs: `viewBox="0 0 24 24"`, a single
  `<path>`, `fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
  stroke-linejoin="round"`, `aria-hidden="true" focusable="false"`, sized in CSS.
- **Forms open in the shared `Modal.svelte`** (native `<dialog>`), not inline panels.
- **Filtering is URL-param driven** so views are linkable and survive a reload.
- Two grid traps that have bitten before: a grid item with `margin: 0 auto` is sized to
  fit-content, not stretched (needs `inline-size: 100%`), and grid items default to
  `min-width: auto`, so any track holding a card or a wide table needs `minmax(0, 1fr)`
  or `min-inline-size: 0` or it overflows.
- Hover-revealed controls must also appear on `:focus-within`, and be permanently visible
  under `@media (hover: none)`. Hit areas meet `--target-min`.
- **Form errors** come back as `fail(400, { error })` and render in
  `<p class="form-error" role="alert">`.
- **Sass modules:** `@use` only (`@import` is deprecated); `loadPaths` in `vite.config.ts`
  resolves `@use 'breakpoints' as *;` from `src/lib/styles/`.
- **Exception, approved:** colour maths (`scripts/check-contrast.mjs`, `src/lib/color.ts`)
  keeps the standard single-letter names of colour-space components (`L`, `C`, `h`, `a`, `b`,
  and the LMS `l`, `m`, `s`).

### Accessibility in this project

- `global.scss` holds `.visually-hidden`, `.skip-link` (first in `+layout.svelte`), the
  `:focus-visible` ring and the one `prefers-reduced-motion` override; `scrollable`
  (`src/lib/actions.ts`) gives an overflowing table a tab stop. `--target-min` is 24px.
- `npm run check:contrast` gates text (4.5:1), borders, the focus ring and chart series (3:1) in
  both themes. Dialogs, listboxes, sortable headers and meters: `.claude/rules/accessibility.md`.

<!-- init-project:agents v1 — managed by /init-project; re-sync replaces everything up to the end marker, so put project notes below it -->
## Agents

Project agents live in `.claude/agents/`. Before opening or updating a PR, run the ones this project has that apply,
giving each the absolute path of the checkout or worktree. `test-engineer` goes first, alone; then the rest in one
message, except `design-reviewer`, which starts after `accessibility-auditor` returns (they share the browser).
- `test-engineer`: logic changed without matching tests. `code-reviewer`: always.
- `security-auditor`: the diff touches an area its "This project" section lists, or adds dependencies, endpoints,
  file or network access, or secret handling.
- `accessibility-auditor`, then `design-reviewer`: UI files changed.
- `docs-reviewer`: behaviour, commands, config, env vars or ports changed; it also checks CHANGELOG.md,
  CONTRIBUTING.md and the README's Claude section. `workstream-builder`: one sub-branch, in a worktree Claude made.
Fix each finding or list it as deferred in the PR body. Prefer these agents over the built-in `/code-review` and
`/security-review`: they know this project.
<!-- /init-project:agents -->

## Deployment

- Self-hosted. `./start.sh` (`npm run docker:up`) builds the image from the working tree, starts
  the app and an Ollama sidecar, runs `drizzle-kit push --force` (`docker-entrypoint.sh`) and
  waits for the health check on **3000**. Data lives in the `cashflow-data` volume (`down -v`
  deletes it); backup and import are in README › Setup.
- The app on 3000 runs `main`: after the `[ production deploy ]` merge, the dev checks out
  `main` in the main checkout and runs `./start.sh`. Never from `beta`.

## Gotchas

- **Schema pushes are destructive**: the container runs `drizzle-kit push --force` on every start,
  so a renamed or dropped column loses its data unprompted. Preview the SQL with
  `npm run db:push -- --verbose --strict` on the dev database.
- **Don't replace Chart.js global defaults**: replacing `Chart.defaults.animation` dropped its
  `type` key and broke every tooltip (eb9afbd); set options per chart.
- **`ORIGIN` must match the URL you browse to**, or adapter-node's CSRF check rejects every
  form action.
- **The CSV import posts the whole file as one JSON body**: Compose sets `BODY_SIZE_LIMIT: 10M`;
  plain `npm start` keeps adapter-node's 512kB default.
- **A fresh dev database needs `npm run db:push`** before the default funds can seed
  (`src/lib/server/db/index.ts`). Copy `data/` whole: WAL keeps recent writes in the `-wal`
  and `-shm` files.

## Design feedback loop

Design feedback arrives as **vibe-annotations** on the running app at `localhost:3000`
(note: not the `npm run dev` port).

1. Pull with `read_annotations` — the annotation carries the DOM path, parent chain and
   viewport, which is enough to find the Svelte component.
2. **Resolve ambiguities before planning.** Annotations regularly hide product decisions
   (what a delta compares against, where a new view lives, what a "cumulative" chart means).
   Ask, don't guess.
3. Split the batch into sub-branches per the Git workflow above.
4. Once the PR is open **and the change is verified**, clean up with
   `delete_project_annotations` (`update_annotation` only handles *variant* annotations).
   List each annotation and what addressed it in the PR body, since the annotations
   themselves are gone after cleanup.
