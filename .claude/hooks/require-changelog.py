#!/usr/bin/env python3
# init-project-file v1 — managed by /init-project; re-sync replaces this file
"""Claude Code PreToolUse hook for Bash: guard `gh pr create`.

Blocks (exit 2, stderr shown to Claude) a pull request that
  - targets main or master (only the dev opens `[ production deploy ]` PRs),
  - comes from a permanent branch (main, master, develop, beta, deploy), or
  - doesn't change CHANGELOG.md compared with origin/<base> (run the update-changelog skill first).
Anything else exits 0. An internal error exits 1: Claude Code shows it and lets the command run.
It never fetches or touches the network: it compares with the local origin/<base> ref.
This is a guardrail for Claude's own commands, not a security boundary.
"""
import json
import os
import re
import shlex
import subprocess
import sys

PRODUCTION = ("main", "master")
PERMANENT = PRODUCTION + ("develop", "beta", "deploy")
SEPARATORS = {"&&", "||", ";", "|", "&", ";;", "|&"}
ASSIGNMENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")


def git(cwd, *args):
    r = subprocess.run(["git", "-C", cwd] + list(args), capture_output=True, text=True)
    return r.returncode, r.stdout.strip()


def segments(command):
    """Split a shell command into simple commands (lists of words). Newlines separate commands too."""
    lexer = shlex.shlex(command.replace("\n", " ; "), posix=True, punctuation_chars=";&|")
    lexer.whitespace_split = True
    current, out = [], []
    for token in lexer:
        if token in SEPARATORS:
            if current:
                out.append(current)
            current = []
        else:
            current.append(token)
    if current:
        out.append(current)
    return out


def pr_create_args(words):
    """The words after `gh [flags] pr [flags] create`, or None when this isn't a PR create."""
    while words and ASSIGNMENT_RE.match(words[0]):
        words = words[1:]
    if not words or os.path.basename(words[0]) != "gh":
        return None
    rest = words[1:]
    if "pr" not in rest:
        return None
    pr_at = rest.index("pr")
    # `create` must be the next bare word after `pr`; flags (and a -R/--repo value) may sit between
    index = pr_at + 1
    while index < len(rest):
        word = rest[index]
        if word in ("-R", "--repo"):
            index += 2
            continue
        if word.startswith("-"):
            index += 1
            continue
        break
    if index >= len(rest) or rest[index] != "create":
        return None
    return rest[:pr_at] + rest[pr_at + 1:index] + rest[index + 1:]


def flag(args, long_name, short_name):
    for i, w in enumerate(args):
        if w in (long_name, short_name) and i + 1 < len(args):
            return args[i + 1]
        if w.startswith(long_name + "="):
            return w.split("=", 1)[1]
        if short_name and w.startswith(short_name) and len(w) > len(short_name) and not w.startswith("--"):
            return w[len(short_name):]
    return None


def block(message):
    print(message, file=sys.stderr)
    sys.exit(2)


def check(args, cwd):
    base = flag(args, "--base", "-B") or "develop"
    if base in PRODUCTION:
        block("Blocked: Claude never opens pull requests into %s. Feature and fix branches go into develop; "
              "the dev opens the `[ production deploy ]` PR (CLAUDE.md > Git workflow)." % base)
    code, top = git(cwd, "rev-parse", "--show-toplevel")
    if code != 0:
        return
    if git(top, "rev-parse", "--verify", "-q", "refs/remotes/origin/%s" % base)[0] != 0:
        return  # this repo isn't set up with origin/<base>: nothing to compare with
    head = flag(args, "--head", "-H")
    if head and ":" in head:
        head = head.split(":", 1)[1]
    if not head:
        code, head = git(top, "symbolic-ref", "--short", "-q", "HEAD")
        if code != 0:
            return
    if head in PERMANENT:
        block("Blocked: pull requests come from a feature/ or fix/ branch, not from %s "
              "(CLAUDE.md > Git workflow)." % head)
    remote = "refs/remotes/origin/%s" % head
    ref = remote if git(top, "rev-parse", "--verify", "-q", remote)[0] == 0 else "refs/heads/%s" % head
    if git(top, "rev-parse", "--verify", "-q", ref)[0] != 0:
        ref = "HEAD"
    changed = git(top, "diff", "--quiet", "origin/%s...%s" % (base, ref), "--", "CHANGELOG.md")[0] == 1
    if changed:
        return
    dirty = git(top, "status", "--porcelain", "--", "CHANGELOG.md")[1]
    local_changed = git(top, "diff", "--quiet", "origin/%s...HEAD" % base, "--", "CHANGELOG.md")[0] == 1
    if dirty:
        block("Blocked: CHANGELOG.md has uncommitted changes. Commit it on %s, push, then create the PR again." % head)
    if local_changed:
        block("Blocked: the CHANGELOG.md bullets are committed but not pushed. Push %s, then create the PR again." % head)
    block("Blocked: CHANGELOG.md has no changes on %s compared with origin/%s. Run the update-changelog skill "
          "(/update-changelog), commit and push CHANGELOG.md, then create the PR again." % (head, base))


def main():
    try:
        data = json.load(sys.stdin)
        command = (data.get("tool_input") or {}).get("command") or ""
        cwd = data.get("cwd") or os.getcwd()
        if "gh" not in command or "create" not in command:
            return 0
        try:
            parts = segments(command)
        except ValueError:
            parts = None
        if parts is None:
            if re.search(r"\bgh\b.*\bpr\b.*\bcreate\b", command):
                check([], cwd)
            return 0
        for words in parts:
            if words and words[0] == "cd" and len(words) > 1:
                target = os.path.expanduser(words[1])
                cwd = target if os.path.isabs(target) else os.path.normpath(os.path.join(cwd, target))
                continue
            args = pr_create_args(words)
            if args is not None:
                check(args, cwd)
        return 0
    except SystemExit:
        raise
    except Exception as exc:  # never block on our own bug; make it visible instead
        print("require-changelog hook error (not blocking): %s" % exc, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
