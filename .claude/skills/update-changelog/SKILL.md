---
name: update-changelog
description: Keeps CHANGELOG.md current in Keep a Changelog format with releases named by date. Adds the current branch's changes under [Unreleased] as Added, Changed, Removed, Fixed or Security bullets that say what changed and why and end with the issue number; moves bullets that have shipped under the date their [ production deploy ] reached production; cuts a release on develop with `/update-changelog release`; and catches work that skipped the changelog (hand edits, GitHub Desktop commits, PRs merged without a bullet), asking the dev whenever a reason isn't written down. Run it before every `gh pr create` (a hook blocks the PR until CHANGELOG.md changes), and when the dev says "update the changelog", "log my changes", "I changed X by hand" or "cut a release".
argument-hint: "[release [YYYY-MM-DD]]"
allowed-tools: Bash(python3 ${CLAUDE_SKILL_DIR}/scripts/changelog.py *)
---

<!-- init-project:skill:update-changelog v1 — managed by /init-project; re-sync replaces up to the end marker, so keep project facts in "This project" below -->
# Update the changelog

CHANGELOG.md tells people what changed in each release and why. The diff already records what changed; the reason
is the part that gets lost, so every bullet carries it, and a reason nobody gave never goes in, because a guess in a
changelog reads as fact later. The format is in [reference/format.md](reference/format.md); CLAUDE.md › Changelog
has the short version.

`CL` below stands for `python3 ${CLAUDE_SKILL_DIR}/scripts/changelog.py` (read-only unless told to write, and it
writes only files named CHANGELOG.md). It never fetches: run `git -C "<dir>" fetch origin` first. `<dir>` is the
checkout you work in; draft in the session scratchpad (or `mktemp -d`), called `<scratch>`. `<repo>` is `<owner>/<name>` from
`git -C "<dir>" remote get-url origin`; every gh call names it with `-R <repo>` so it works from any folder.

## Ground rules

- CHANGELOG.md is the only file this skill edits. Everything else in the checkout, committed or not, stays exactly
  as it is: never stage, commit, stash, reset or discard anyone's other changes.
- Never commit on `main`/`master`, `develop` or the QA branch (`beta`/`deploy`). The only edit on develop is a
  release (step 7), and the dev commits it.
- Sub-branches (`…--<part>`) never write bullets; their parent does, when its PR is prepared.
- Public repo (`gh repo view <repo> --json visibility`): bullets describe features, never data; no personal paths, emails,
  names, hostnames, IPs, account IDs, tokens, or personal, financial or health data.

## Called from /init-project

init-project passes the setup worktree (already on its branch), the setup issue `#N`, a scratch directory, whether
the repo is public, and a mode: `backfill` (create CHANGELOG.md from history, then add the setup's bullets) or
`resync`. Skip *Where to work* and *Finish*: draft only in the scratch directory, list your decisions for
init-project's plan card instead of asking them yourself (plain-text reason questions still go out first), and let
init-project apply, verify and commit.

## 1. Where to work

`CL status "<dir>"` prints the branch `kind`:

| kind | Do |
|---|---|
| `feature`, `fix` | This branch's bullets: steps 2–6. |
| `sub-branch` | Nothing to write here: the bullets go on the parent (`parent:`) when its PR is prepared. Say so. |
| `develop` | `release` → step 7. Anything else changed here needs a branch: ask "Link #n / Create an issue / Draft only" (always ask before creating or linking an issue), then `git -C "<dir>" worktree add --no-track -b fix/<issue>-<short-description> "<dir>/.claude/worktrees/<short-description>" origin/develop` and work there. If the change is the dev's own uncommitted edits on develop, offer instead to carry them onto the new branch in place (`git switch --no-track -c <branch> origin/develop`), only if the dev agrees. |
| `production`, `qa` | Never edit here. Find the branch each change came from (the merge that brought it in, or `git -C "<dir>" branch -a --contains <sha>`) and offer the bullet text for it. |
| `other`, `detached` | Ask which issue the work belongs to. |

## 2. Catch up on releases first

`pending_moves:` above 0 means bullets that have shipped still sit under `[Unreleased]` or the wrong date. Draft:
`cp "<dir>/CHANGELOG.md" "<scratch>/CHANGELOG.md"`, then `CL releases "<dir>" --apply "<scratch>/CHANGELOG.md"`.
Each `move:` line says why; the moves go into the same diff as the new bullets. `unresolved:` refs (no matching
merge on develop) stay put; mention them. No CHANGELOG.md at all → [reference/backfill.md](reference/backfill.md)
creates it from history; then come back here.

## 3. Read what changed

- This branch: `git -C "<dir>" diff --stat origin/develop...HEAD`, then the hunks that matter;
  `git -C "<dir>" log --format='%h %s%n%b' origin/develop..HEAD`; the issue (`gh issue view <N> -R <repo> --json title,body`);
  what the dev said in this conversation.
- Commits after the bullets were last touched (`since_bullets:`) and uncommitted edits (`files:`): read these too,
  since the dev may have changed things by hand.
- `gaps:` in status is merged work on develop with no bullet. It isn't this branch's business: list it and offer
  a catch-up (step 6).

Sort each change. **Notable** (behaviour, commands, config, env vars, ports, data or schema, dependencies, security,
docs people rely on) gets a bullet. **Noise** (formatting, typos, comment-only edits, refactors with no visible
effect) folds into a related bullet or is left out. **Not the project's** (personal scratch files, editor files) is
never logged or touched. Name what you left out on the card.

## 4. The reason: find it, or ask

Sources, best first: the dev's words in this conversation; commit message bodies; the issue and PR text; a comment
the change itself adds. Note the source for the card. No written reason → ask with one AskUserQuestion (up to 4
questions; more changes → another round before drafting): a header naming the change, "Why did you <the change,
plainly>?", at most two reasons the diff suggests, each labelled "Guess: …", and "No reason (state just the
change)". The dev's own words come through Other. No plausible guess → ask in plain text, numbered, and end the turn.
A picked guess is the dev's answer; a skipped one means the bullet states just the change.

## 5. Write the bullets

Per [reference/format.md](reference/format.md): under `[Unreleased]`, in the right category, one change per bullet,
the reason in the wording, `(#<issue>)` at the end. A second run on the same branch updates this branch's bullets
(those ending `(#<issue>)`) instead of adding duplicates. A correction to something already released is a new bullet
under `[Unreleased]`, never an edit to the release. Then `CL normalize "<scratch>/CHANGELOG.md" --write` and
`CL lint "<scratch>/CHANGELOG.md"`, which must say ok (explain any warning on the card).

## 6. Show, ask, apply

Card: `git diff --no-index "<dir>/CHANGELOG.md" "<scratch>/CHANGELOG.md"`, the source of each reason, what was left
out and why, and any release moves. One AskUserQuestion: Q1 "Apply the changelog update?" (Apply / Skip). On a
feature or fix branch, Q2 decides the commit:
- the dev's own edits are still uncommitted → "Leave CHANGELOG.md uncommitted, to commit with your edits
  (Recommended)" / "Commit CHANGELOG.md alone now";
- otherwise → "Commit and push (Recommended)" when the branch is already pushed (it updates the PR), else
  "Commit (Recommended)"; and "Leave it uncommitted".

Apply: `cp "<scratch>/CHANGELOG.md" "<dir>/CHANGELOG.md"`, then
`git -C "<dir>" commit -m "Update the changelog" -- CHANGELOG.md` (the pathspec commits CHANGELOG.md alone and leaves
anything else staged as it was); `git -C "<dir>" push` only if chosen.

**Catch-up** of `gaps:` (from develop, or when asked): ask "Open a catch-up PR for the k missing bullets
(Recommended)" / "Draft them only". A catch-up follows CLAUDE.md › Git workflow like any fix: ask about the issue,
branch `fix/<issue>-changelog-catch-up` from `origin/develop` in a worktree, one bullet per merged PR under the
release it shipped in (`CL history "<dir>"` says which), commit, push, `gh pr create -R <repo> --base develop`. A PR that only changes
CHANGELOG.md needs no bullet about itself.

## 7. release (on develop, before a production deploy)

`/update-changelog release [YYYY-MM-DD]` (default: today). Only where `develop` is checked out; stop if it is behind
`origin/develop` (`git -C "<dir>" status -sb`) or CHANGELOG.md has uncommitted changes. Draft: catch up first (step
2), then `CL cut "<scratch>/CHANGELOG.md" --date <date> --write` and lint; show the diff and ask "Apply?". Apply
copies the file into the develop checkout and stops there: **the dev commits and pushes it**, then merges the
`[ production deploy ]` PR. If the deploy lands on a later day, a later run re-dates the section by itself.

## 8. Finish

Verify: `CL lint "<dir>/CHANGELOG.md"` is ok, and `CL status "<dir>"` shows the changelog changed against develop and
no pending moves. Report in two or three lines: bullets added or updated, reasons the dev skipped, anything noticed
but not logged, and whether CHANGELOG.md is committed, pushed or left for the dev. If you had to discover a project
fact that "This project" below lacks (for example that the first PRs were imports), propose adding it.
<!-- /init-project:skill:update-changelog -->

## This project

<!-- Filled in by /init-project. Facts this skill needs: the production and QA branch names; public or private; history notes (import PRs, refs that are PR numbers rather than issues); anything unusual about releases. Facts only; nothing sensitive in a public repo. -->
- Production is `main` and QA is `beta`. The repo is public.
- `#1`–`#12` are pull requests, not issues: the first issue is #13 (the Claude Code setup), so bullets for older work
  end with a PR number or a commit hash.
- `main`'s root commit, "Initial commit" (2026-08-04), is the project's first build (pages, schema, styles), not an
  empty scaffold, so it is the first release.
- Until 2026-09-03, work was committed straight to `develop` without pull requests; it first reached `main` through
  #1 on 2026-09-03. #3 (the redesign) was merged straight into `main`, not through `develop`. Deploy PRs #1 and #5
  are titled `[ production deploy ]`; #6 and #7 are `develop` → `main` deploys under feature titles.
- On 2026-09-17, two workstream merges and two direct commits landed on `develop` without pull requests, before the
  one-PR-per-feature rule (#11). #9 and #10 merged into #8's branch, not `develop`, so their changes are logged under
  #8. #4's own change (a static title in `src/app.html`) was lost in a merge and never shipped, so no bullet cites it.
- Deliberately without a bullet: the README-only commits 65b0dce and b60cc73; `gaps --all` lists exactly these.
