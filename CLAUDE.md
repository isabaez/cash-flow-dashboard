# Cash Flow Dashboard — working agreements

SvelteKit 5 (runes) + SCSS + Drizzle/SQLite. Dev server on **5173** (`npm run dev`);
the Docker build serves **3000** (`npm run docker:up`).

## Branching

- **Every feature starts as a branch off `develop`.** Never commit directly to `develop` or
  `main`.
- Branch names use the format **`feature/[descriptive feature name]`** — lowercase,
  hyphenated, describing the feature rather than the ticket. e.g.
  `feature/savings-fund-cards`.
- **A full feature is one branch off `develop` and one PR into `develop`.** Push it and
  open the PR with `gh pr create`; Uriel reviews and merges it. Never merge anything into
  `develop` or `main` yourself, and keep local `develop` matching `origin/develop`.
- **Branches off a feature branch get no PR.** When a feature splits into workstreams,
  branch each one off the feature branch, not off `develop`, and merge it back into the
  feature branch yourself (`git merge --no-ff`) once its checks pass. Uriel reviews the
  whole feature in its one PR, not every sub-branch. Sub-branches use the same
  `feature/[descriptive name]` format.
- Workstreams run in parallel in **separate git worktrees** under `.claude/worktrees/`.
  State the dependency order and the file collisions up front, and merge the foundation
  workstream into the feature branch before starting the ones that depend on it.
- The feature PR body lists every workstream that was merged into it, and why the work
  was split that way.
- Parts that all edit the same file are one workstream, not several — parallel branches
  there only manufacture conflicts.
- `develop` merges to `main` for release.

Setting up a worktree: symlink `node_modules` and copy `data/` in, or `npm run check`
and `npm run dev` will not run there. Run `npx svelte-kit sync` once in a fresh worktree
before `npm run check`. `.gitignore` only lists `node_modules/` (the directory form), so
the symlink is excluded repo-wide via `.git/info/exclude` instead — do not commit it.
`preview_start` launches against the primary working directory, not the worktree, so run
`npx vite dev --port <free port>` from inside the worktree when previewing a branch.

## Design feedback loop

Design feedback arrives as **vibe-annotations** on the running app at `localhost:3000`
(note: not the `npm run dev` port).

1. Pull with `read_annotations` — the annotation carries the DOM path, parent chain and
   viewport, which is enough to find the Svelte component.
2. **Resolve ambiguities before planning.** Annotations regularly hide product decisions
   (what a delta compares against, where a new view lives, what a "cumulative" chart means).
   Ask, don't guess.
3. Split the batch into workstreams per the branching rules above.
4. Once the PR is open **and the change is verified**, clean up with
   `delete_project_annotations` (`update_annotation` only handles *variant* annotations).
   List each annotation and what addressed it in the PR body, since the annotations
   themselves are gone after cleanup.

## Gates

Before any UI change is called done:

```bash
npm run check          # svelte-check
npm run check:contrast # WCAG 2.2 ratios in both themes — fails the build
```

Two traps when verifying in the browser: `export const` of anything other than SvelteKit's
own names (`load`, `actions`, …) in a `+page.server.ts` is a 500 that `npm run check` does
not catch — only the running server does. And reading a computed `opacity` immediately
after `.focus()` returns the mid-transition value, so let a transition settle before
concluding a reveal is broken.

Verify in the browser rather than asserting: drive the preview, check the console, test
keyboard reachability, and screenshot both themes.

## Conventions

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
