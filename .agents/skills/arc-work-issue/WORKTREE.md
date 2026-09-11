# Worktree Setup

Load this when creating, shipping, or cleaning up a worktree for `arc-work-issue`.

## Defaults

- **Worktree root:** `.arc/worktrees/` (inside the repository root)
- **Worktree path:** use `.arc/worktrees/W-000014` for issue `14` when its story
  ID is `W-000014`; otherwise use `.arc/worktrees/issue-14`. Use one naming
  form consistently for the branch and worktree; do not mix a W-ID branch with
  an issue-number path (or vice versa).
- **Base ref:** `origin/main`, falling back to `main` or `master` if needed

## Arc Pi cwd safety

Arc Pi's native `subagent_spawn` accepts a requested `cwd` only when it is an
existing directory relative to the current project and its resolved path stays
inside that project. Keep parallel story worktrees under the repository-local
`.arc/worktrees/` root, start Arc Pi from the repository root, and pass a child
path such as `.arc/worktrees/W-000014` as the relative `cwd`. Do not pass an
absolute path, `../` escape, missing directory, or symlink that resolves outside
the project.

`.arc/worktrees/` is local runtime state, not a tracked repository change. Add
it to the clone-local `.git/info/exclude` before creating worktrees; this keeps
the worktree contents out of status while leaving the repository's tracked
ignore policy unchanged.

Validate the story key before constructing a worktree path. Accept only
`W-[0-9]{6}` or `issue-[0-9]+`; reject absolute paths, path separators, `..`,
whitespace, and other characters. Canonicalize the project, worktree root, and
target with `realpath`; use `realpath -e` for an existing target and require both
the root and target to remain inside the project before running
`git worktree add`. Re-check the root after creating it so a symlink or other
path change cannot bypass the containment check.

## Resolve W- ID to issue number

```bash
gh issue list --search "W-000014 in:title" --state open --json number,title --limit 5
```

If title search fails, search body text or list open issues and match `[W-000014]` / `W-000014`.

Ambiguous multiple matches: stop and ask the user which issue to use.

## Fetch issue

```bash
gh issue view <number> --json number,title,body,state,comments
```

Stop if `state` is not `OPEN`.

## Branch naming

```bash
# With W- ID in title, e.g. "[W-000014] Add queue retry"
feat/W-000014-add-queue-retry

# Without W- ID
feat/issue-14-add-queue-retry
```

Slug rules: lowercase, hyphens, drop punctuation, max ~40 chars.

## Create worktree

Run from the repository root (not inside an existing worktree):

```bash
set -euo pipefail

fail() {
  printf 'Refusing worktree setup: %s\n' "$*" >&2
  exit 1
}

REPO_ROOT="$(git rev-parse --show-toplevel)" || fail 'not inside a git repository'
ISSUE=14
W_ID="W-000014"
BRANCH="feat/W-000014-add-queue-retry"
STORY_KEY="${W_ID:-issue-${ISSUE}}"

if [[ ! "$STORY_KEY" =~ ^(W-[0-9]{6}|issue-[0-9]+)$ ]]; then
  fail "unsafe story key: $STORY_KEY"
fi

WORKTREE_ROOT="$REPO_ROOT/.arc/worktrees"
WT_DIR="$WORKTREE_ROOT/$STORY_KEY"

command -v realpath >/dev/null 2>&1 || fail 'realpath is required'

PROJECT_REAL="$(realpath -e -- "$REPO_ROOT")" || fail 'cannot resolve repository root'
WORKTREE_ROOT_REAL="$(realpath -m -- "$WORKTREE_ROOT")" || fail 'cannot resolve worktree root'

case "$WORKTREE_ROOT_REAL" in
  "$PROJECT_REAL"/*) ;;
  *)
    fail "worktree root outside project: $WORKTREE_ROOT_REAL"
    ;;
esac

if [[ -e "$WT_DIR" || -L "$WT_DIR" ]]; then
  WT_REAL="$(realpath -e -- "$WT_DIR")" || fail "cannot resolve existing worktree target: $WT_DIR"
else
  WT_REAL="$(realpath -m -- "$WT_DIR")" || fail 'cannot resolve worktree target'
fi

case "$WT_REAL" in
  "$PROJECT_REAL"/*) ;;
  *)
    fail "worktree path outside project: $WT_REAL"
    ;;
esac

if [[ "$WT_REAL" != "$WORKTREE_ROOT_REAL/$STORY_KEY" ]]; then
  fail "canonicalized worktree path is not the requested target: $WT_REAL"
fi

if git remote get-url origin >/dev/null 2>&1; then
  git fetch origin || fail 'git fetch origin failed'
fi

BASE_REF=""
for CANDIDATE in origin/main main master; do
  if git rev-parse --verify --quiet "$CANDIDATE^{commit}" >/dev/null 2>&1; then
    BASE_REF="$CANDIDATE"
    break
  fi
done
[[ -n "$BASE_REF" ]] || fail 'no usable base ref (tried origin/main, main, master)'

mkdir -p -- "$WORKTREE_ROOT" || fail 'cannot create worktree root'
WORKTREE_ROOT_AFTER="$(realpath -e -- "$WORKTREE_ROOT")" || fail 'cannot re-resolve worktree root'
[[ "$WORKTREE_ROOT_AFTER" == "$WORKTREE_ROOT_REAL" ]] || fail "worktree root changed during setup: $WORKTREE_ROOT_AFTER"

if [[ -e "$WT_DIR" || -L "$WT_DIR" ]]; then
  fail "worktree target already exists: $WT_DIR"
fi

EXCLUDE="$REPO_ROOT/.git/info/exclude"
if ! grep -qxF '.arc/worktrees/' "$EXCLUDE" 2>/dev/null; then
  printf '%s\n' '.arc/worktrees/' >> "$EXCLUDE" || fail 'cannot update .git/info/exclude'
fi

if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WT_DIR" "$BRANCH" || fail 'git worktree attach failed'
else
  git worktree add -b "$BRANCH" "$WT_DIR" "$BASE_REF" || fail 'git worktree creation failed'
fi

cd -- "$WT_DIR" || fail 'cannot enter worktree'
```

If the branch already exists locally, attach with `git worktree add "$WT_DIR" "$BRANCH"` instead of `-b`.

The executable base-ref order is `origin/main`, then `main`, then `master`. If
an `origin` remote exists but fetching it fails, stop; only a repository without
that remote may proceed directly to a local fallback ref.

## Commit (Conventional Commits)

Load `arc-conventional-commits` and choose the correct type:

- `feat:` for new behavior
- `fix:` for defect repair
- `test:`, `refactor:`, `docs:`, etc. when that is the sole change

```bash
git add <issue-scoped-files>

git commit -m "$(cat <<'EOF'
feat: add queue dispatch retry with backoff

Closes #14
EOF
)"
```

Include the `W-XXXXXX` ID in the subject when the issue uses one.

## Push and open PR

```bash
git push -u origin HEAD

gh pr create \
  --base main \
  --title "feat: <short title>" \
  --body "$(cat <<'EOF'
## Summary
<what changed>

## Related Issue
Closes #<number>
EOF
)"
```

## Merge PR

Prefer squash merge after checks pass:

```bash
gh pr checks <pr-number> --watch
gh pr merge <pr-number> --squash --delete-branch
```

If the repo uses required checks that cannot complete in this environment, enable auto-merge and report the PR URL:

```bash
gh pr merge <pr-number> --squash --auto --delete-branch
```

## Cleanup worktree (required after merge)

Run from the repository root:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git fetch origin

git worktree remove "$WT_DIR"
git worktree prune
git branch -d "$BRANCH" 2>/dev/null || true

cd "$REPO_ROOT"
git pull origin main
```

Do not delete the remote branch manually when `gh pr merge --delete-branch` already removed it.
