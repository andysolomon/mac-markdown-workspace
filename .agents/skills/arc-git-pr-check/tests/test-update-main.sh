#!/usr/bin/env bash
set -euo pipefail

SCRIPT_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../bin" && pwd -P)/run.sh"
FIXTURE_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/fixtures" && pwd -P)"
DOC_PATH="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)/SKILL.md"
ORIGINAL_PATH="$PATH"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/arc-git-pr-check-test.XXXXXX")"
CASE_ROOT=""
MAIN_WORKTREE=""
FEATURE_WORKTREE=""
UNRELATED_WORKTREE=""
GH_MODE="normal"

cleanup() {
  if [ -n "${TEST_ROOT:-}" ] && [ -d "$TEST_ROOT" ]; then
    rm -r -- "$TEST_ROOT"
  fi
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local haystack="$1"
  local needle="$2"
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_exists() {
  [ -e "$1" ] || fail "expected path to exist: $1"
}

assert_missing() {
  [ ! -e "$1" ] || fail "expected path to be absent: $1"
}

assert_branch_exists() {
  git -C "$MAIN_WORKTREE" show-ref --verify --quiet "refs/heads/$1" || fail "expected branch to exist: $1"
}

assert_branch_missing() {
  if git -C "$MAIN_WORKTREE" show-ref --verify --quiet "refs/heads/$1"; then
    fail "expected branch to be absent: $1"
  fi
}

new_repo() {
  local name="$1"

  CASE_ROOT="$TEST_ROOT/$name"
  MAIN_WORKTREE="$CASE_ROOT/main"
  FEATURE_WORKTREE="$CASE_ROOT/feature"
  UNRELATED_WORKTREE="$CASE_ROOT/unrelated"
  mkdir -p "$CASE_ROOT"

  git init --bare -q "$CASE_ROOT/remote.git"
  git init -q "$MAIN_WORKTREE"
  git -C "$MAIN_WORKTREE" config user.name "ARC Test"
  git -C "$MAIN_WORKTREE" config user.email arc-test@example.test
  git -C "$MAIN_WORKTREE" switch -q -c main
  git -C "$MAIN_WORKTREE" remote add origin "$CASE_ROOT/remote.git"
  printf 'base\n' >"$MAIN_WORKTREE/README.md"
  git -C "$MAIN_WORKTREE" add README.md
  git -C "$MAIN_WORKTREE" commit -qm 'chore: initialize test repository'
  git -C "$MAIN_WORKTREE" push -q -u origin main
  git --git-dir "$CASE_ROOT/remote.git" symbolic-ref HEAD refs/heads/main
  git -C "$MAIN_WORKTREE" remote set-head origin -a >/dev/null 2>&1 || true
  git -C "$MAIN_WORKTREE" worktree add -q -b feature "$FEATURE_WORKTREE" main
  GH_MODE="normal"
}

run_feature() {
  (
    cd -- "$FEATURE_WORKTREE"
    ARC_TEST_GH_STATE="$CASE_ROOT/gh-state" \
      ARC_TEST_GH_REMOTE="$CASE_ROOT/remote.git" \
      ARC_TEST_GH_MODE="$GH_MODE" \
      PATH="$FIXTURE_PATH:$ORIGINAL_PATH" \
      "$SCRIPT_PATH" "$@"
  )
}

run_main() {
  (
    cd -- "$MAIN_WORKTREE"
    ARC_TEST_GH_STATE="$CASE_ROOT/gh-state" \
      ARC_TEST_GH_REMOTE="$CASE_ROOT/remote.git" \
      ARC_TEST_GH_MODE="$GH_MODE" \
      PATH="$FIXTURE_PATH:$ORIGINAL_PATH" \
      "$SCRIPT_PATH" "$@"
  )
}

test_requires_merge_mode() {
  local invalid_root output

  invalid_root="$TEST_ROOT/invalid"
  git init -q "$invalid_root"
  if output="$(cd -- "$invalid_root" && "$SCRIPT_PATH" --update-main --ship auto 2>&1)"; then
    fail "--update-main unexpectedly succeeded without --ship merge"
  fi
  assert_contains "$output" "--update-main requires --ship merge"
}

test_documentation_describes_update_main() {
  local documentation

  documentation="$(<"$DOC_PATH")"
  assert_contains "$documentation" "--update-main"
  assert_contains "$documentation" 'only with `--ship merge`'
  assert_contains "$documentation" "git merge --ff-only"
  assert_contains "$documentation" "confirmed PR merge commit"
  assert_contains "$documentation" "Unrelated worktrees are left untouched"
}

test_successful_merge_updates_only_current_worktree() {
  local output remote_sha local_sha worktrees

  new_repo success
  git -C "$MAIN_WORKTREE" worktree add -q -b unrelated "$UNRELATED_WORKTREE" main
  printf 'feature\n' >"$FEATURE_WORKTREE/feature.txt"

  output="$(run_feature --type feat --summary 'ship and clean' --ship merge --update-main 2>&1)"

  assert_contains "$output" "fast-forwarded 'main'"
  assert_missing "$FEATURE_WORKTREE"
  assert_branch_missing feature
  assert_exists "$UNRELATED_WORKTREE"
  assert_branch_exists unrelated
  worktrees="$(git -C "$MAIN_WORKTREE" worktree list --porcelain)"
  [[ "$worktrees" == *"$UNRELATED_WORKTREE"* ]] || fail "unrelated worktree was not preserved"
  remote_sha="$(git --git-dir "$CASE_ROOT/remote.git" rev-parse refs/heads/main)"
  local_sha="$(git -C "$MAIN_WORKTREE" rev-parse refs/heads/main)"
  [ "$local_sha" = "$remote_sha" ] || fail "default branch did not fast-forward to remote main"
  [ "$(git -C "$MAIN_WORKTREE" branch --show-current)" = main ] || fail "main worktree did not return to main"
}

test_dirty_default_worktree_refuses() {
  local output

  new_repo dirty-default
  printf 'keep this\n' >"$MAIN_WORKTREE/local-only.txt"

  if output="$(run_feature --base main --type fix --summary 'dirty default' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly proceeded with a dirty default worktree"
  fi

  assert_contains "$output" "refuses to update dirty default worktree"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
  assert_exists "$MAIN_WORKTREE/local-only.txt"
}

test_dirty_current_worktree_refuses_cleanup() {
  local output

  new_repo dirty-current
  GH_MODE="dirty-current"

  if output="$(run_feature --base main --type fix --summary 'dirty current' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly removed a dirty current worktree"
  fi

  assert_contains "$output" "current worktree"
  assert_contains "$output" "is dirty; refusing removal"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
  assert_exists "$FEATURE_WORKTREE/dirty-after-merge.txt"
}

test_primary_worktree_refuses_as_unrelated() {
  local output

  new_repo primary
  git -C "$MAIN_WORKTREE" worktree add -q -b unrelated "$UNRELATED_WORKTREE" main

  if output="$(run_main --base main --type fix --summary 'primary path' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly proceeded from the primary worktree"
  fi

  assert_contains "$output" "requires the current path to be a linked worktree"
  assert_exists "$UNRELATED_WORKTREE"
  assert_branch_exists unrelated
}

test_stale_remote_refuses_cleanup() {
  local output

  new_repo stale-remote
  GH_MODE="no-remote-update"
  printf 'stale remote\n' >"$FEATURE_WORKTREE/stale.txt"

  if output="$(run_feature --base main --type fix --summary 'stale remote' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly cleaned up without a visible merge result"
  fi

  assert_contains "$output" "does not contain the confirmed PR merge commit"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_missing_merge_commit_refuses_cleanup() {
  local output

  new_repo missing-merge
  GH_MODE="missing-merge-commit"
  printf 'missing merge\n' >"$FEATURE_WORKTREE/missing.txt"

  if output="$(run_feature --base main --type fix --summary 'missing merge' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly cleaned up without a merge commit"
  fi

  assert_contains "$output" "has no recorded merge commit"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_post_merge_branch_change_refuses_cleanup() {
  local output

  new_repo post-merge-change
  GH_MODE="post-merge-change"
  printf 'post merge\n' >"$FEATURE_WORKTREE/post-merge.txt"

  if output="$(run_feature --base main --type fix --summary 'post merge change' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly removed a changed feature branch"
  fi

  assert_contains "$output" "tip changed after the PR merge"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_open_after_merge_refuses_cleanup() {
  local output

  new_repo open-after-merge
  GH_MODE="open-after-merge"
  printf 'open after merge\n' >"$FEATURE_WORKTREE/open.txt"

  if output="$(run_feature --base main --type fix --summary 'open after merge' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly cleaned up an unconfirmed merge"
  fi

  assert_contains "$output" "did not confirm as merged"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_non_fast_forward_refuses_cleanup() {
  local output

  new_repo non-fast-forward
  printf 'local main commit\n' >"$MAIN_WORKTREE/local-main.txt"
  git -C "$MAIN_WORKTREE" add local-main.txt
  git -C "$MAIN_WORKTREE" commit -qm 'chore: diverge local main'
  printf 'feature\n' >"$FEATURE_WORKTREE/feature.txt"

  if output="$(run_feature --base main --type fix --summary 'diverged main' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly rewrote a diverged default branch"
  fi

  assert_contains "$output" "ahead of or diverged"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
  [ "$(git -C "$MAIN_WORKTREE" branch --show-current)" = main ] || fail "default branch worktree left main"
}

test_already_merged_updates_only_current_worktree() {
  local output

  new_repo already-merged
  GH_MODE="already-merged"
  printf 'already merged\n' >"$FEATURE_WORKTREE/already.txt"

  output="$(run_feature --base main --type fix --summary 'already merged' --ship merge --update-main 2>&1)"

  assert_contains "$output" "fast-forwarded 'main'"
  assert_missing "$FEATURE_WORKTREE"
  assert_branch_missing feature
  [ "$(git -C "$MAIN_WORKTREE" branch --show-current)" = main ] || fail "main worktree did not return to main"
}

test_unrelated_pr_base_refuses_update() {
  local output

  new_repo wrong-base
  GH_MODE="wrong-base"

  if output="$(run_feature --base main --type fix --summary 'wrong base' --ship merge --update-main 2>&1)"; then
    fail "--update-main unexpectedly proceeded for an unrelated PR base"
  fi

  assert_contains "$output" "targets 'develop', not 'main'"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_update_main_dry_run_only_plans() {
  local output

  new_repo dry-run
  printf 'dry run\n' >"$FEATURE_WORKTREE/dry-run.txt"
  output="$(run_feature --base main --type test --summary 'plan cleanup' --ship merge --update-main --dry-run 2>&1)"

  assert_contains "$output" "would fetch origin/main"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
  assert_missing "$CASE_ROOT/gh-state"
}

test_existing_ship_modes_remain_unchanged() {
  local output

  new_repo ship-pr
  printf 'review\n' >"$FEATURE_WORKTREE/review.txt"
  output="$(run_feature --base main --type docs --summary 'leave for review' --ship pr 2>&1)"
  assert_contains "$output" "--ship pr: PR #42 left open for review"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature

  new_repo ship-auto
  printf 'automatic\n' >"$FEATURE_WORKTREE/automatic.txt"
  output="$(run_feature --base main --type chore --summary 'enable auto merge' --ship auto 2>&1)"
  assert_contains "$output" "enabled squash auto-merge"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature

  new_repo ship-merge
  printf 'merge\n' >"$FEATURE_WORKTREE/merge.txt"
  output="$(run_feature --base main --type fix --summary 'merge without cleanup' --ship merge 2>&1)"
  assert_contains "$output" "squash-merged PR #42"
  assert_exists "$FEATURE_WORKTREE"
  assert_branch_exists feature
}

test_requires_merge_mode
test_documentation_describes_update_main
test_successful_merge_updates_only_current_worktree
test_dirty_default_worktree_refuses
test_dirty_current_worktree_refuses_cleanup
test_primary_worktree_refuses_as_unrelated
test_stale_remote_refuses_cleanup
test_missing_merge_commit_refuses_cleanup
test_post_merge_branch_change_refuses_cleanup
test_open_after_merge_refuses_cleanup
test_non_fast_forward_refuses_cleanup
test_already_merged_updates_only_current_worktree
test_unrelated_pr_base_refuses_update
test_update_main_dry_run_only_plans
test_existing_ship_modes_remain_unchanged

echo "arc-git-pr-check update-main tests passed"
