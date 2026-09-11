#!/usr/bin/env bash
set -euo pipefail

STEP_COMMIT="skipped"
STEP_PUSH="skipped"
STEP_PR="skipped"
STEP_MERGE="skipped"
DETAIL_COMMIT=""
DETAIL_PUSH=""
DETAIL_PR=""
DETAIL_MERGE=""
FAILED=0

TYPE=""
SUMMARY=""
BASE_OVERRIDE=""
DRY_RUN=0
SHIP="auto"
PR_TITLE=""
PR_BODY_FILE=""
STAGED_ONLY=0
UPDATE_MAIN=0
CURRENT_WORKTREE=""
MAIN_WORKTREE=""
DEFAULT_WORKTREE=""
CURRENT_WORKTREE_FOUND=0
CURRENT_WORKTREE_IS_PRIMARY=0
UPDATE_ERROR=""
UPDATE_DETAIL=""
PR_BASE=""
FEATURE_HEAD=""
PR_HEAD=""
PR_MERGE=""

usage() {
  cat <<'USAGE'
Usage: arc-git-pr-check [options]

Idempotent workflow:
1) Commit if needed
2) Push if needed
3) Create PR if missing
4) Ship per --ship mode

Options:
  --type <type>          Conventional commit type (feat|fix|chore|docs|test|refactor|perf|ci)
  --summary <text>       Conventional commit summary (used for commit message and branch slug)
  --base <branch>        Override default base branch for PR creation
  --ship <mode>          auto (default): enable squash auto-merge and stop
                         merge: squash-merge the PR now (fails if checks/permissions block it)
                         pr: stop after PR creation; do not merge or enable auto-merge
  --update-main          after a confirmed merge, fast-forward the default branch and
                         remove this clean linked worktree and its local feature branch
                         (requires --ship merge)
  --title <text>         PR title override (defaults to the conventional commit message)
  --body-file <path>     PR body file (e.g. to include 'Closes #N')
  --staged-only          Commit only what is already staged; never run 'git add -A'
  --dry-run              Print planned actions without mutating git/GitHub state
  -h, --help             Show help
USAGE
}

fail_step() {
  local step="$1"
  local message="$2"
  case "$step" in
    commit)
      STEP_COMMIT="failed"
      DETAIL_COMMIT="$message"
      ;;
    push)
      STEP_PUSH="failed"
      DETAIL_PUSH="$message"
      ;;
    pr)
      STEP_PR="failed"
      DETAIL_PR="$message"
      ;;
    merge)
      STEP_MERGE="failed"
      DETAIL_MERGE="$message"
      ;;
  esac
  FAILED=1
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

is_allowed_type() {
  case "$1" in
    feat|fix|chore|docs|test|refactor|perf|ci)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

prompt_for_type() {
  local input
  while true; do
    printf 'Enter commit type (feat|fix|chore|docs|test|refactor|perf|ci): '
    IFS= read -r input
    input="$(printf '%s' "$input" | tr '[:upper:]' '[:lower:]')"
    if is_allowed_type "$input"; then
      TYPE="$input"
      return
    fi
    echo "Invalid type: $input"
  done
}

prompt_for_summary() {
  local input
  while true; do
    printf 'Enter commit summary: '
    IFS= read -r input
    if [ -n "${input// /}" ]; then
      SUMMARY="$input"
      return
    fi
    echo "Summary cannot be empty."
  done
}

ensure_type_and_summary() {
  if [ -z "$TYPE" ]; then
    prompt_for_type
  fi
  if [ -z "$SUMMARY" ]; then
    prompt_for_summary
  fi
}

slugify() {
  printf '%s' "$1" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
    | cut -c1-48
}

has_changes() {
  [ -n "$(git status --porcelain=v1)" ]
}

has_changes_at() {
  [ -n "$(git -C "$1" status --porcelain=v1 --untracked-files=all 2>/dev/null)" ]
}

canonical_path() {
  local path="$1"
  [ -d "$path" ] || return 1
  (cd -- "$path" 2>/dev/null && pwd -P)
}

load_worktree_context() {
  local line path="" canonical first=1

  MAIN_WORKTREE=""
  DEFAULT_WORKTREE=""
  CURRENT_WORKTREE_FOUND=0
  CURRENT_WORKTREE_IS_PRIMARY=0

  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      "worktree "*)
        path="${line#worktree }"
        if canonical="$(canonical_path "$path")"; then
          path="$canonical"
        else
          path=""
        fi

        if [ "$first" -eq 1 ]; then
          MAIN_WORKTREE="$path"
          if [ "$path" = "$CURRENT_WORKTREE" ]; then
            CURRENT_WORKTREE_IS_PRIMARY=1
          fi
          first=0
        fi

        if [ "$path" = "$CURRENT_WORKTREE" ]; then
          CURRENT_WORKTREE_FOUND=1
        fi
        ;;
      "branch refs/heads/"*)
        if [ "${line#branch refs/heads/}" = "$DEFAULT_BRANCH" ]; then
          DEFAULT_WORKTREE="$path"
        fi
        ;;
    esac
  done < <(git worktree list --porcelain)
}

load_pr_metadata() {
  PR_STATE=""
  PR_BASE=""
  PR_HEAD=""
  PR_MERGE=""

  if ! PR_STATE="$(gh pr view "$PR_NUMBER" --json state --jq '.state')"; then
    return 1
  fi
  if ! PR_BASE="$(gh pr view "$PR_NUMBER" --json baseRefName --jq '.baseRefName')"; then
    return 1
  fi
  if ! PR_HEAD="$(gh pr view "$PR_NUMBER" --json headRefOid --jq '.headRefOid')"; then
    return 1
  fi
  if ! PR_MERGE="$(gh pr view "$PR_NUMBER" --json mergeCommit --jq '.mergeCommit.oid // empty')"; then
    return 1
  fi
}

validate_update_main_context() {
  UPDATE_ERROR=""

  load_worktree_context

  if [ "$CURRENT_WORKTREE_FOUND" -ne 1 ] || [ "$CURRENT_WORKTREE_IS_PRIMARY" -eq 1 ]; then
    UPDATE_ERROR="--update-main requires the current path to be a linked worktree; refusing an unrelated or primary worktree"
    return 1
  fi

  if [ "$CURRENT_BRANCH" = "HEAD" ] || [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ]; then
    UPDATE_ERROR="--update-main requires a linked feature branch, not '$CURRENT_BRANCH'"
    return 1
  fi

  if [ -z "$DEFAULT_WORKTREE" ]; then
    UPDATE_ERROR="--update-main could not find a worktree checked out on default branch '$DEFAULT_BRANCH'"
    return 1
  fi

  if [ "$DEFAULT_WORKTREE" = "$CURRENT_WORKTREE" ]; then
    UPDATE_ERROR="--update-main found the default branch and current worktree at the same path; refusing cleanup"
    return 1
  fi

  if [ "$(git -C "$DEFAULT_WORKTREE" symbolic-ref --quiet --short HEAD 2>/dev/null || true)" != "$DEFAULT_BRANCH" ]; then
    UPDATE_ERROR="--update-main found '$DEFAULT_WORKTREE' is not checked out on '$DEFAULT_BRANCH'"
    return 1
  fi

  if has_changes_at "$DEFAULT_WORKTREE"; then
    UPDATE_ERROR="--update-main refuses to update dirty default worktree '$DEFAULT_WORKTREE'"
    return 1
  fi

  if [ "$STAGED_ONLY" -eq 1 ] && { ! git diff --quiet || [ -n "$(git ls-files --others --exclude-standard)" ]; }; then
    UPDATE_ERROR="--update-main requires the current worktree to be clean after the staged commit; unstaged or untracked changes remain"
    return 1
  fi

  return 0
}

update_main_after_merge() {
  local default_head remote_head

  UPDATE_ERROR=""
  UPDATE_DETAIL=""

  if ! load_worktree_context; then
    UPDATE_ERROR="could not inspect git worktrees"
    return 1
  fi

  if [ "$CURRENT_WORKTREE_FOUND" -ne 1 ] || [ "$CURRENT_WORKTREE_IS_PRIMARY" -eq 1 ]; then
    UPDATE_ERROR="current path is no longer the same linked worktree; refusing cleanup"
    return 1
  fi

  if [ -z "$DEFAULT_WORKTREE" ] || [ "$DEFAULT_WORKTREE" = "$CURRENT_WORKTREE" ]; then
    UPDATE_ERROR="default branch '$DEFAULT_BRANCH' is not checked out in a separate worktree"
    return 1
  fi

  if [ "$(git -C "$DEFAULT_WORKTREE" symbolic-ref --quiet --short HEAD 2>/dev/null || true)" != "$DEFAULT_BRANCH" ]; then
    UPDATE_ERROR="default worktree '$DEFAULT_WORKTREE' is no longer checked out on '$DEFAULT_BRANCH'"
    return 1
  fi

  if has_changes_at "$CURRENT_WORKTREE"; then
    UPDATE_ERROR="current worktree '$CURRENT_WORKTREE' is dirty; refusing removal"
    return 1
  fi

  if [ "$(git -C "$CURRENT_WORKTREE" symbolic-ref --quiet --short HEAD 2>/dev/null || true)" != "$CURRENT_BRANCH" ]; then
    UPDATE_ERROR="current worktree branch changed from '$CURRENT_BRANCH'; refusing removal"
    return 1
  fi

  if [ -z "$FEATURE_HEAD" ] || [ "$(git -C "$CURRENT_WORKTREE" rev-parse HEAD 2>/dev/null || true)" != "$FEATURE_HEAD" ]; then
    UPDATE_ERROR="current worktree tip changed after the PR merge; refusing removal"
    return 1
  fi

  if has_changes_at "$DEFAULT_WORKTREE"; then
    UPDATE_ERROR="default worktree '$DEFAULT_WORKTREE' is dirty; refusing update"
    return 1
  fi

  if [ "$DRY_RUN" -eq 1 ]; then
    UPDATE_DETAIL="would fetch origin/$DEFAULT_BRANCH, fast-forward '$DEFAULT_BRANCH', remove '$CURRENT_WORKTREE', and delete local branch '$CURRENT_BRANCH'"
    return 0
  fi

  if ! git -C "$DEFAULT_WORKTREE" fetch --no-tags origin "$DEFAULT_BRANCH" >/dev/null; then
    UPDATE_ERROR="failed to fetch origin/$DEFAULT_BRANCH; left worktrees and branch untouched"
    return 1
  fi

  if ! default_head="$(git -C "$DEFAULT_WORKTREE" rev-parse HEAD)" || ! remote_head="$(git -C "$DEFAULT_WORKTREE" rev-parse "origin/$DEFAULT_BRANCH")"; then
    UPDATE_ERROR="could not resolve fetched origin/$DEFAULT_BRANCH; left worktrees and branch untouched"
    return 1
  fi

  if [ -z "$PR_MERGE" ]; then
    UPDATE_ERROR="the merged PR has no recorded merge commit; refusing cleanup"
    return 1
  fi

  if ! git -C "$DEFAULT_WORKTREE" merge-base --is-ancestor "$PR_MERGE" "$remote_head"; then
    UPDATE_ERROR="origin/$DEFAULT_BRANCH does not contain the confirmed PR merge commit; refusing cleanup"
    return 1
  fi

  if ! git -C "$DEFAULT_WORKTREE" merge-base --is-ancestor "$default_head" "$remote_head"; then
    UPDATE_ERROR="default branch '$DEFAULT_BRANCH' is ahead of or diverged from origin/$DEFAULT_BRANCH; refusing non-fast-forward cleanup"
    return 1
  fi

  if ! git -C "$DEFAULT_WORKTREE" merge --ff-only "origin/$DEFAULT_BRANCH" >/dev/null; then
    UPDATE_ERROR="could not fast-forward '$DEFAULT_BRANCH' from origin/$DEFAULT_BRANCH; left worktree and branch untouched"
    return 1
  fi

  if has_changes_at "$DEFAULT_WORKTREE"; then
    UPDATE_ERROR="default worktree '$DEFAULT_WORKTREE' became dirty during update; refusing cleanup"
    return 1
  fi

  if ! cd -- "$DEFAULT_WORKTREE"; then
    UPDATE_ERROR="could not enter default worktree '$DEFAULT_WORKTREE'; left linked worktree and branch untouched"
    return 1
  fi

  if [ "$(git -C "$CURRENT_WORKTREE" symbolic-ref --quiet --short HEAD 2>/dev/null || true)" != "$CURRENT_BRANCH" ] || [ "$(git -C "$CURRENT_WORKTREE" rev-parse HEAD 2>/dev/null || true)" != "$FEATURE_HEAD" ]; then
    UPDATE_ERROR="current worktree changed before cleanup; refusing removal"
    return 1
  fi

  if ! git worktree remove -- "$CURRENT_WORKTREE" >/dev/null; then
    UPDATE_ERROR="could not remove clean linked worktree '$CURRENT_WORKTREE'; local branch was preserved"
    return 1
  fi

  # A squash merge does not make the feature tip an ancestor of the default
  # branch. Detach at the already-confirmed feature tip so ordinary `branch
  # -d` can remove exactly this local branch without a force delete.
  if ! git switch --detach "$CURRENT_BRANCH" >/dev/null 2>&1; then
    git switch "$DEFAULT_BRANCH" >/dev/null 2>&1 || true
    UPDATE_ERROR="removed '$CURRENT_WORKTREE' but could not prepare safe local branch deletion; branch was preserved"
    return 1
  fi

  if ! git branch -d -- "$CURRENT_BRANCH" >/dev/null 2>&1; then
    git switch "$DEFAULT_BRANCH" >/dev/null 2>&1 || true
    UPDATE_ERROR="removed '$CURRENT_WORKTREE' but local branch '$CURRENT_BRANCH' was not safely deletable"
    return 1
  fi

  if ! git switch "$DEFAULT_BRANCH" >/dev/null 2>&1; then
    UPDATE_ERROR="deleted local branch '$CURRENT_BRANCH' but could not return default worktree to '$DEFAULT_BRANCH'"
    return 1
  fi

  UPDATE_DETAIL="fast-forwarded '$DEFAULT_BRANCH', removed linked worktree '$CURRENT_WORKTREE', and deleted local branch '$CURRENT_BRANCH'"
  return 0
}

next_version_from_type() {
  local latest major minor patch
  latest="$(git tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-version:refname | head -n 1)"

  if [ -z "$latest" ]; then
    printf '0.1.0'
    return
  fi

  latest="${latest#v}"
  IFS='.' read -r major minor patch <<EOFV
$latest
EOFV

  major="${major:-0}"
  minor="${minor:-0}"
  patch="${patch:-0}"

  if [ "$TYPE" = "feat" ]; then
    minor=$((minor + 1))
    patch=0
  else
    patch=$((patch + 1))
  fi

  printf '%s.%s.%s' "$major" "$minor" "$patch"
}

print_status_table() {
  printf '\n%-10s %-8s %s\n' "STEP" "STATUS" "DETAILS"
  printf '%-10s %-8s %s\n' "commit" "$STEP_COMMIT" "$DETAIL_COMMIT"
  printf '%-10s %-8s %s\n' "push" "$STEP_PUSH" "$DETAIL_PUSH"
  printf '%-10s %-8s %s\n' "pr" "$STEP_PR" "$DETAIL_PR"
  printf '%-10s %-8s %s\n' "merge" "$STEP_MERGE" "$DETAIL_MERGE"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --type)
      TYPE="${2:-}"
      if [ -z "$TYPE" ]; then
        echo "--type requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --summary)
      SUMMARY="${2:-}"
      if [ -z "$SUMMARY" ]; then
        echo "--summary requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --base)
      BASE_OVERRIDE="${2:-}"
      if [ -z "$BASE_OVERRIDE" ]; then
        echo "--base requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --ship)
      SHIP="${2:-}"
      case "$SHIP" in
        auto|merge|pr) ;;
        *)
          echo "--ship must be one of auto|merge|pr" >&2
          exit 1
          ;;
      esac
      shift 2
      ;;
    --title)
      PR_TITLE="${2:-}"
      if [ -z "$PR_TITLE" ]; then
        echo "--title requires a value" >&2
        exit 1
      fi
      shift 2
      ;;
    --body-file)
      PR_BODY_FILE="${2:-}"
      if [ -z "$PR_BODY_FILE" ] || [ ! -f "$PR_BODY_FILE" ]; then
        echo "--body-file requires an existing file" >&2
        exit 1
      fi
      shift 2
      ;;
    --staged-only)
      STAGED_ONLY=1
      shift
      ;;
    --update-main)
      UPDATE_MAIN=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$SHIP" != "merge" ]; then
  echo "--update-main requires --ship merge" >&2
  exit 1
fi

if [ -n "$TYPE" ]; then
  TYPE="$(printf '%s' "$TYPE" | tr '[:upper:]' '[:lower:]')"
  if ! is_allowed_type "$TYPE"; then
    echo "Invalid --type '$TYPE'. Must be one of feat|fix|chore|docs|test|refactor|perf|ci" >&2
    exit 1
  fi
fi

require_cmd git
require_cmd gh

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not inside a git repository." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

DEFAULT_BRANCH="$BASE_OVERRIDE"
if [ -z "$DEFAULT_BRANCH" ]; then
  if ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null)"; then
    DEFAULT_BRANCH="${ref#origin/}"
  else
    DEFAULT_BRANCH="main"
  fi
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

if [ "$UPDATE_MAIN" -eq 1 ]; then
  CURRENT_WORKTREE="$(canonical_path "$(git rev-parse --show-toplevel)")"
  if ! validate_update_main_context; then
    echo "$UPDATE_ERROR" >&2
    exit 1
  fi
fi

if [ "$STAGED_ONLY" -eq 1 ] && [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ] && has_changes; then
  echo "--staged-only requires a feature branch; the stash-and-branch flow would drop the index. Create a branch first." >&2
  exit 1
fi

if has_changes && [ "$CURRENT_BRANCH" = "$DEFAULT_BRANCH" ]; then
  ensure_type_and_summary
  NEXT_VERSION="$(next_version_from_type)"
  SLUG="$(slugify "$SUMMARY")"
  [ -z "$SLUG" ] && SLUG="change"

  NEW_BRANCH="${TYPE}/v${NEXT_VERSION}-${SLUG}"
  CANDIDATE="$NEW_BRANCH"
  N=2
  while git show-ref --verify --quiet "refs/heads/$CANDIDATE" || git ls-remote --heads origin "$CANDIDATE" | grep -q .; do
    CANDIDATE="${NEW_BRANCH}-${N}"
    N=$((N + 1))
  done
  NEW_BRANCH="$CANDIDATE"

  if [ "$DRY_RUN" -eq 1 ]; then
    DETAIL_COMMIT="would stash, create '$NEW_BRANCH', and restore stash"
  else
    STASH_NAME="arc-git-pr-check-$(date +%s)"
    git stash push --include-untracked -m "$STASH_NAME" >/dev/null
    git checkout -b "$NEW_BRANCH" >/dev/null

    if git stash list | grep -q "$STASH_NAME"; then
      if ! git stash pop >/dev/null; then
        fail_step commit "stash pop conflicted on '$NEW_BRANCH'; resolve conflicts manually"
        print_status_table
        exit 1
      fi
    fi
  fi
  CURRENT_BRANCH="$NEW_BRANCH"
fi

if has_changes; then
  ensure_type_and_summary
  COMMIT_MSG="${TYPE}: ${SUMMARY}"

  if [ "$DRY_RUN" -eq 1 ]; then
    STEP_COMMIT="done"
    DETAIL_COMMIT="would commit '$COMMIT_MSG'"
  else
    if [ "$STAGED_ONLY" -eq 0 ]; then
      git add -A
    fi
    if git diff --cached --quiet; then
      STEP_COMMIT="skipped"
      DETAIL_COMMIT="no staged diff after add"
    else
      if git commit -m "$COMMIT_MSG" >/dev/null; then
        STEP_COMMIT="done"
        DETAIL_COMMIT="created commit '$COMMIT_MSG'"
      else
        fail_step commit "git commit failed"
      fi
    fi
  fi
else
  STEP_COMMIT="skipped"
  DETAIL_COMMIT="working tree clean"
fi

UPSTREAM=""
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}')"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  if [ -z "$UPSTREAM" ]; then
    STEP_PUSH="done"
    DETAIL_PUSH="would push '$CURRENT_BRANCH' and set upstream"
  else
    AHEAD_COUNT="$(git rev-list --count '@{u}..HEAD')"
    if [ "$AHEAD_COUNT" -gt 0 ]; then
      STEP_PUSH="done"
      DETAIL_PUSH="would push $AHEAD_COUNT commit(s)"
    else
      STEP_PUSH="skipped"
      DETAIL_PUSH="no unpushed commits"
    fi
  fi
else
  if [ -z "$UPSTREAM" ]; then
    if git push -u origin "$CURRENT_BRANCH" >/dev/null; then
      STEP_PUSH="done"
      DETAIL_PUSH="pushed '$CURRENT_BRANCH' and set upstream"
    else
      fail_step push "initial push failed"
    fi
  else
    AHEAD_COUNT="$(git rev-list --count '@{u}..HEAD')"
    if [ "$AHEAD_COUNT" -gt 0 ]; then
      if git push >/dev/null; then
        STEP_PUSH="done"
        DETAIL_PUSH="pushed $AHEAD_COUNT commit(s)"
      else
        fail_step push "git push failed"
      fi
    else
      STEP_PUSH="skipped"
      DETAIL_PUSH="no unpushed commits"
    fi
  fi
fi

PR_EXISTS="$(gh pr list --head "$CURRENT_BRANCH" --state all --json number --limit 1 --jq 'length')"

if [ "$PR_EXISTS" = "0" ]; then
  if [ -z "$PR_TITLE" ]; then
    ensure_type_and_summary
    PR_TITLE="${TYPE}: ${SUMMARY}"
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    STEP_PR="done"
    DETAIL_PR="would create PR '$CURRENT_BRANCH' -> '$DEFAULT_BRANCH'"
    case "$SHIP" in
      auto) STEP_MERGE="done"; DETAIL_MERGE="would enable squash auto-merge after PR creation" ;;
      merge)
        STEP_MERGE="done"
        DETAIL_MERGE="would squash-merge after PR creation"
        if [ "$UPDATE_MAIN" -eq 1 ]; then
          DETAIL_MERGE="$DETAIL_MERGE; would fetch origin/$DEFAULT_BRANCH, fast-forward '$DEFAULT_BRANCH', remove '$CURRENT_WORKTREE', and delete local branch '$CURRENT_BRANCH'"
        fi
        ;;
      pr) STEP_MERGE="skipped"; DETAIL_MERGE="--ship pr: PR left open for review" ;;
    esac
    print_status_table
    exit 0
  else
    PR_CREATE_ARGS=(--base "$DEFAULT_BRANCH" --head "$CURRENT_BRANCH" --title "$PR_TITLE")
    if [ -n "$PR_BODY_FILE" ]; then
      PR_CREATE_ARGS+=(--body-file "$PR_BODY_FILE")
    else
      PR_CREATE_ARGS+=(--body "Automated PR created by arc-git-pr-check.")
    fi
    if gh pr create "${PR_CREATE_ARGS[@]}" >/dev/null; then
      STEP_PR="done"
      DETAIL_PR="created PR '$CURRENT_BRANCH' -> '$DEFAULT_BRANCH'"
    else
      fail_step pr "gh pr create failed"
    fi
  fi
else
  STEP_PR="skipped"
  DETAIL_PR="PR already exists for '$CURRENT_BRANCH'"
fi

PR_STATE="$(gh pr list --head "$CURRENT_BRANCH" --state all --json state --limit 1 --jq '.[0].state')"
PR_NUMBER="$(gh pr list --head "$CURRENT_BRANCH" --state all --json number --limit 1 --jq '.[0].number')"
PR_URL="$(gh pr list --head "$CURRENT_BRANCH" --state all --json url --limit 1 --jq '.[0].url')"
HAS_AUTOMERGE="$(gh pr list --head "$CURRENT_BRANCH" --state all --json autoMergeRequest --limit 1 --jq '.[0].autoMergeRequest != null')"

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
  FEATURE_HEAD="$(git rev-parse HEAD)"
  if ! load_pr_metadata; then
    fail_step merge "could not inspect PR #$PR_NUMBER metadata; --update-main stopped"
  elif [ "$PR_BASE" != "$DEFAULT_BRANCH" ]; then
    fail_step merge "PR #$PR_NUMBER targets '$PR_BASE', not '$DEFAULT_BRANCH'; --update-main stopped"
  elif [ -z "$PR_HEAD" ] || [ "$PR_HEAD" != "$FEATURE_HEAD" ]; then
    fail_step merge "PR #$PR_NUMBER head does not match current feature tip; --update-main stopped"
  fi
fi

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$FAILED" -ne 0 ]; then
  :
elif [ "$PR_STATE" = "MERGED" ]; then
  STEP_MERGE="skipped"
  DETAIL_MERGE="PR already merged: $PR_URL"
elif [ "$PR_STATE" = "CLOSED" ]; then
  fail_step merge "PR is closed (not merged): $PR_URL"
elif [ "$PR_STATE" = "OPEN" ]; then
  case "$SHIP" in
    pr)
      STEP_MERGE="skipped"
      DETAIL_MERGE="--ship pr: PR #$PR_NUMBER left open for review: $PR_URL"
      ;;
    merge)
      if [ "$DRY_RUN" -eq 1 ]; then
        STEP_MERGE="done"
        DETAIL_MERGE="would squash-merge PR #$PR_NUMBER"
      else
        if gh pr merge "$PR_NUMBER" --squash >/dev/null; then
          STEP_MERGE="done"
          DETAIL_MERGE="squash-merged PR #$PR_NUMBER"
        else
          fail_step merge "failed to squash-merge PR #$PR_NUMBER (checks pending or blocked?)"
        fi
      fi
      ;;
    auto)
      if [ "$HAS_AUTOMERGE" = "true" ]; then
        STEP_MERGE="skipped"
        DETAIL_MERGE="auto-merge already enabled on PR #$PR_NUMBER"
      else
        if [ "$DRY_RUN" -eq 1 ]; then
          STEP_MERGE="done"
          DETAIL_MERGE="would enable squash auto-merge on PR #$PR_NUMBER"
        else
          if gh pr merge "$PR_NUMBER" --auto --squash >/dev/null; then
            STEP_MERGE="done"
            DETAIL_MERGE="enabled squash auto-merge on PR #$PR_NUMBER"
          else
            fail_step merge "failed to enable auto-merge on PR #$PR_NUMBER (repo may disallow auto-merge; use --ship merge)"
          fi
        fi
      fi
      ;;
  esac
else
  fail_step merge "unable to determine PR state for '$CURRENT_BRANCH'"
fi

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$DRY_RUN" -eq 0 ] && [ "$STEP_MERGE" = "done" ] && [ "$PR_STATE" = "OPEN" ]; then
  if ! load_pr_metadata; then
    fail_step merge "could not confirm that PR #$PR_NUMBER was merged; --update-main stopped"
  elif [ "$PR_STATE" != "MERGED" ]; then
    fail_step merge "PR #$PR_NUMBER did not confirm as merged; --update-main stopped"
  elif [ "$PR_BASE" != "$DEFAULT_BRANCH" ]; then
    fail_step merge "PR #$PR_NUMBER base changed to '$PR_BASE'; --update-main stopped"
  elif [ -z "$PR_HEAD" ] || [ "$PR_HEAD" != "$FEATURE_HEAD" ]; then
    fail_step merge "PR #$PR_NUMBER head changed after merge; --update-main stopped"
  fi
fi

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$DRY_RUN" -eq 1 ] && [ "$SHIP" = "merge" ] && { [ "$STEP_MERGE" = "done" ] || [ "$PR_STATE" = "MERGED" ]; }; then
  DETAIL_MERGE="$DETAIL_MERGE; would fetch origin/$DEFAULT_BRANCH, fast-forward '$DEFAULT_BRANCH', remove '$CURRENT_WORKTREE', and delete local branch '$CURRENT_BRANCH'"
fi

if [ "$UPDATE_MAIN" -eq 1 ] && [ "$DRY_RUN" -eq 0 ] && [ "$PR_STATE" = "MERGED" ] && [ "$FAILED" -eq 0 ]; then
  if update_main_after_merge; then
    DETAIL_MERGE="$DETAIL_MERGE; $UPDATE_DETAIL"
  else
    fail_step merge "PR is merged, but --update-main was not completed: $UPDATE_ERROR"
  fi
fi

print_status_table

if [ "$FAILED" -ne 0 ]; then
  exit 1
fi
