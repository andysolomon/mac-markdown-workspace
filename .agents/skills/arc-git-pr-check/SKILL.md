---
name: arc-git-pr-check
description: Idempotent git workflow that commits if needed, pushes if needed, creates a PR if missing, and ships it per --ship mode (enable squash auto-merge, squash-merge now, or leave the PR open for review). With --update-main, it can fast-forward the local default branch and safely clean the current linked worktree after a confirmed merge. If changes exist on the default branch, it stashes changes, creates a semver feature branch, then restores changes before committing. Other skills (arc-work-issue, arc-parallel-implement) delegate PR mechanics here.
allowed-tools: Bash(git:*), Bash(gh:*), Bash(/Users/andrewsolomon/.claude/skills/arc-git-pr-check/bin/run.sh:*)
---

# ARC Git PR Check

Use this skill to run a safe, idempotent release hygiene pass:
- Commit if there are uncommitted changes
- Push if local commits are unpushed
- Create PR if branch has no PR
- Ship per `--ship` mode

## Ship modes

- `--ship auto` (default): enable squash auto-merge and stop; merges when required checks pass. Fails on repos where auto-merge is disallowed — use `merge` there.
- `--ship merge`: squash-merge the PR immediately; fails if checks or branch protection block it.
- `--ship pr`: stop after PR creation and leave the PR open — for review loops where another agent reviews, comments, and iterates before merging (see `arc-pr-review-loop`).
- `--update-main` (only with `--ship merge`): after GitHub confirms the PR is merged, fetch and fast-forward the configured default branch, then remove only the current clean linked worktree and its local feature branch. It refuses a dirty default worktree, a dirty current worktree, a primary/unrelated worktree, or a non-fast-forward update. Unrelated worktrees are left untouched.

## Safety Guard

Before committing, if on the default branch and there are local changes, this skill:
1. Stashes tracked and untracked changes
2. Creates a feature branch named `<type>/v<next-semver>-<slug>`
3. Pops the stash on the new branch

If stash pop conflicts, stop and resolve conflicts manually. `--staged-only` refuses to run on the default branch (the stash flow would drop the index) — create a feature branch first.

## Usage

```bash
/Users/andrewsolomon/.claude/skills/arc-git-pr-check/bin/run.sh
```

Optional flags:

```bash
run.sh --type feat --summary "add intake parser"
run.sh --base develop
run.sh --ship pr --title "feat: add intake parser" --body-file /tmp/pr-body.md
run.sh --staged-only --ship merge      # commit only pre-staged files, then merge
run.sh --ship merge --update-main      # merge, update the default branch, and clean this linked worktree
run.sh --dry-run
```

`--update-main` uses the detected default branch (or the branch supplied with
`--base`), requires that branch to be checked out in a separate clean worktree,
and uses `git merge --ff-only` after fetching from `origin`. Before cleanup it
binds the operation to the current feature tip and PR base/head, requires a
confirmed PR merge commit, and verifies that commit is present in the fetched
default branch. It performs no cleanup in `auto`, `pr`, or dry-run mode, and it
never removes another worktree or force-deletes a branch. If any proof or
cleanliness check fails, it leaves the worktree and branch in place.

Focused regression coverage is available with:

```bash
bash arc-git-pr-check/tests/test-update-main.sh
```

Delegation pattern (used by `arc-work-issue`): the caller stages only in-scope files and commits itself (or passes `--staged-only`), writes a PR body containing `Closes #<number>`, then invokes this script with `--ship`, `--title`, and `--body-file` so PR metadata survives the handoff.

## Commit Convention

Commit messages follow Conventional Commits:
- `feat: ...`
- `fix: ...`
- `chore: ...`
- `docs: ...`
- `test: ...`
- `refactor: ...`
- `perf: ...`
- `ci: ...`

If `--type` or `--summary` are not provided and a commit is needed, the script prompts for both.
