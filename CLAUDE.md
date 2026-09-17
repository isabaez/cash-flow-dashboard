# Cash Flow Dashboard — working agreements

SvelteKit 5 (runes) + SCSS + Drizzle/SQLite. Dev server on **5173** (`npm run dev`);
the Docker build serves **3000** (`npm run docker:up`).

## Branching

- **Always branch off `develop`.** Never commit directly to `develop` or `main`.
- Branch names use the format **`feature/[descriptive feature name]`** — lowercase,
  hyphenated, describing the feature rather than the ticket. e.g.
  `feature/savings-fund-cards`.
- Work that splits into independent parts runs as **parallel workstreams in separate git
  worktrees** under `.claude/worktrees/`, one branch each. State the dependency order and
  the file collisions up front, merge the foundation workstream first, then the parallel
  ones.
- PRs target `develop`. `develop` merges to `main` for release.

## Design feedback loop

Design feedback arrives as **vibe-annotations** on the running app at `localhost:3000`
(note: not the `npm run dev` port).

1. Pull with `read_annotations` — the annotation carries the DOM path, parent chain and
   viewport, which is enough to find the Svelte component.
2. **Resolve ambiguities before planning.** Annotations regularly hide product decisions
   (what a delta compares against, where a new view lives, what a "cumulative" chart means).
   Ask, don't guess.
3. Split the batch into workstreams per the branching rules above.
4. Once shipped **and verified**, clean up with `delete_project_annotations`
   (`update_annotation` only handles *variant* annotations).

## Gates

Before any UI change is called done:

```bash
npm run check          # svelte-check
npm run check:contrast # WCAG 2.2 ratios in both themes — fails the build
```

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
