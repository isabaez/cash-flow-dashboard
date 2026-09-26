# Contributing to Cash Flow Dashboard

For people changing the code. Getting it running is in the [README](README.md); the same workflow, written for
Claude Code, is in [CLAUDE.md](CLAUDE.md).

<!-- init-project:contributing-workflow v2 — managed by /init-project; re-sync replaces everything up to the end marker, so put project notes below it -->
## How changes flow

| Branch | What it holds | How code gets in |
|---|---|---|
| `main` (or `master`) | What's live in production | A pull request from `develop` titled exactly `[ production deploy ]`, merged with a merge commit |
| `develop` | Reviewed work waiting to ship | Pull requests from `feature/` and `fix/` branches, reviewed and merged by the maintainer (plus the release commit, below) |
| `beta` (or `deploy`) | Features still in review, merged together for testing | Branches merged in for QA; it is never merged anywhere else |

### Making a change

1. **Start from an issue.** Find one that covers the change, or open one that describes the problem and
   what "done" looks like.
2. **Branch from an up-to-date `develop`:**
   `git fetch origin && git switch --no-track -c feature/<issue>-<short-description> origin/develop`
   (`fix/` for fixes), lowercase and hyphenated: `feature/42-savings-fund-cards`.
3. **Commit** in small steps with clear, sentence-case messages. To pick up newer work, merge
   `origin/develop` into your branch; don't rebase or force-push a branch you have pushed.
4. **Add a changelog bullet** under `## [Unreleased]` in `CHANGELOG.md`, in the right category, saying
   what changed and why and ending with the issue number: "Export file names include the date, so exports
   from different days don't overwrite each other (#5)". With Claude Code: `/update-changelog`.
5. **Open a pull request into `develop`** that starts with `Closes #<issue>`, then says what changed, why,
   and how you checked it. Run the checks below first.

### Big changes

A large feature or fix can be split into sub-branches named `<branch>--<part>`
(`feature/42-savings-fund-cards--chart`), each merged back into its branch with `git merge --no-ff`. They
get no issue or pull request of their own, and all of them are merged back before the branch is reviewed.
Say up front which parts depend on which and which files they share, and merge the part the others build
on first. The branch's pull request lists the parts and why the work was split.

### Testing on the QA branch

The QA branch is `beta` (or `deploy` where the project uses that name). Commit your work first, then:
`git fetch origin && git switch beta && git pull --ff-only && git merge --no-ff origin/develop &&
git merge --no-ff <your-branch> && git push origin beta`. Found a problem? Fix it on your branch and merge
again. Never branch from the QA branch or merge it into anything.

**Rebuilding it** (when it still holds work whose pull request was closed unmerged): note
`git rev-parse origin/beta` as `<old>`; `git worktree add --detach .claude/worktrees/qa-rebuild
origin/develop`; in that worktree run `git merge --no-ff origin/<branch>` for each branch with an open pull
request; then `git push --force-with-lease=beta:<old> origin HEAD:refs/heads/beta` and remove the worktree.
This is the only force push the workflow allows.

### Releasing to production

1. On an up-to-date `develop`, move `[Unreleased]` under today's date: with Claude Code,
   `/update-changelog release`; by hand, rename the heading to `## [YYYY-MM-DD]` and add an empty
   `## [Unreleased]` above it. Commit and push.
2. Open a pull request from `develop` into `main` titled exactly `[ production deploy ]` and merge it with a
   merge commit. Don't merge `main` back into `develop`; the extra merge commit on `main` is expected.

### Working with Claude Code

Claude follows this same workflow, with a few more limits: it asks before creating or linking an issue,
never merges into `develop` or `main`, never opens a pull request into `main`, and merges into the QA
branch only when asked.
<!-- /init-project:contributing-workflow -->

## Checks before a pull request

```bash
npm run check          # svelte-check: types and Svelte diagnostics
npm run check:contrast # WCAG 2.2 contrast ratios of the design tokens, in both themes
npm run build          # production build; stops on client code that imports $lib/server
```

- None of them needs a running service, and there is no test runner yet.
- Check UI changes in the browser too: `npm run dev` (port 5173), in both themes and by keyboard alone.
- In a fresh worktree, symlink `node_modules` from the main checkout and run `npx svelte-kit sync` before
  `npm run check`.

## QA in this project

The QA branch is `beta`. After merging into it, test it with `npm run dev` in the main checkout (port 5173,
against the seed data in `data/`). Don't run `./start.sh` from `beta`: it rebuilds the real app on port 3000
from the working tree and pushes `beta`'s schema onto the real data.

## Releasing this project

Nothing deploys remotely: the app runs on this machine in Docker. After `[ production deploy ]` merges, check out
`main` in the main checkout and run `./start.sh` (`npm run docker:up`). It rebuilds the image from the working
tree, applies the schema with `drizzle-kit push --force` and serves the app on port 3000, so run it only from
`main`. A schema change that renames or drops a column loses that data here without asking: preview the SQL first
with `npm run db:push -- --verbose --strict` against the dev database. The data itself stays in the
`cashflow-data` Docker volume; backup and import are in the README's Setup section.

## Code style

Conventions and accessibility rules are in [CLAUDE.md](CLAUDE.md) (Code conventions and accessibility, plus
`.claude/rules/`); they apply to changes made by hand too.
