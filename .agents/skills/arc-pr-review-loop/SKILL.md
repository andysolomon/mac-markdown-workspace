---
name: arc-pr-review-loop
description: Review a PR against its plan, post actionable PR comments, have a coding agent address them, and repeat until approved or a round limit is hit. Invoke with a PR number/URL, e.g. `/arc-pr-review-loop 27`.
---

# PR Review Loop

Iterate a PR to plan-alignment through review comments. The leading word is **converge**: every round must either approve or produce actionable comments that shrink the gap to the plan — never a rubber stamp, never vague feedback.

This is the review counterpart to `arc-work-issue --ship pr`: implementation produces an open PR, then this loop supplies the judgment. Merge authority stays with the caller unless `--merge-on-approve` is passed.

## Orchestrator route guidance

- Route a bounded correctness, regression, security, or acceptance-criteria review to `codex-check`.
- Route high-taste UI/UX, API, architecture, copy, docs, prompt, or skill critique to `opus-review`. This is a content-triggered review route, distinct from availability fallback.
- Route a bounded read-only investigation needed before review to `codex-explore`.
- Route clear mechanical comment fixes to `composer-implement` (the Cursor/Composer implementation lane) and difficult or debugging-heavy fixes to `codex-implement`.
- When Codex is unavailable, `opus-check` and `opus-implement` are the matching availability fallbacks; `opus-explore` is available if a read-only investigation phase is needed. There is no separate `cursor-implement` route.

Review workers return structured findings; they never approve, request changes,
post comments, or otherwise mutate GitHub. The parent judges those findings and
retains the approval decision. It delegates GitHub review comments and replies to
`mechanical-post-comment`. Fix workers operate only in the PR branch's isolated
worktree and never commit, push, comment, merge, deploy, edit secrets, or touch
unrelated files. Under orchestration, accepted fixes are committed and pushed via
`mechanical-commit-push`, and an explicitly authorized merge or auto-merge runs via
`mechanical-merge`. Outside orchestration, preserve the standalone commands and
`arc-git-pr-check` behavior below.

## Input

- PR number or URL (required). If absent, ask and stop.
- `--plan <file|issue>` — plan source override.
- `--max-rounds <N>` — review rounds before escalating (default 3).
- `--merge-on-approve` — squash-merge on approval; under orchestration this uses `mechanical-merge`, while standalone use retains `arc-git-pr-check --ship merge`. Without it, approval is reported and the caller decides whether to merge.

## Steps

1. **Resolve the PR and its plan.**
   - `gh pr view <n> --json title,body,headRefName,url,files` plus the diff (`gh pr diff <n>`).
   - Find the plan: `--plan` if given; else the issue referenced by `Closes #<n>` and any implementation-plan comment on it (per `arc-planning-work`); else the PR body's stated intent.
   - Locate the working copy for fixes: the branch's existing worktree (`git worktree list`) or check the branch out fresh.

   Completion criterion: the loop has a diff, a plan with acceptance criteria (or the explicit note that none exists), and a writable checkout of the PR branch.

2. **Review round: diff vs plan.**
   - Under an orchestrator, select `codex-check` or `opus-review` using the route guidance above; the parent remains responsible for the verdict.
   - Judge only what the plan and acceptance criteria require plus correctness/safety of the changed code; do not expand scope.
   - Classify each finding **blocking** (violates plan, acceptance criterion, or correctness) or **nit** (better, not required).
   - Verdict: **approve** when no blocking findings remain.

   Completion criterion: a verdict plus a findings list where every blocking finding names the file, the problem, and what done looks like.

3. **Post the round to the PR.**
   - Under orchestration, the parent converts accepted findings into the final approval or change-request decision and delegates the round summary and independently addressable GitHub comments to `mechanical-post-comment`.
   - Outside orchestration, approve with `gh pr review <n> --approve --body "<summary>"`, then go to step 6; request revisions with `gh pr review <n> --request-changes --body "<round summary>"` and one `gh pr comment` (or inline review comments) per blocking finding.

   Completion criterion: every blocking finding exists as a PR comment an agent can act on without reading this conversation.

4. **Address the comments.**
   - Apply fixes in the PR branch's worktree — directly or by delegating with the comments as the bounded task contract. Use `composer-implement` for clear mechanical fixes and `codex-implement` for difficult fixes or escalation.
   - Fix only what the comments name; unrelated improvements are new work items.
   - The fix worker runs the repo's test/lint commands and reports evidence. The parent inspects the diff and chooses a conventional message referencing the round (e.g. `fix: address review round 2`). Under orchestration, delegate the scoped commit and push to `mechanical-commit-push`; outside orchestration, retain the standalone commit and push workflow.

   Completion criterion: every blocking comment has a corresponding pushed change or a reply explaining why it is not actionable.

5. **Loop.**
   - Return to step 2. After `--max-rounds` rounds without approval, stop: summarize the unresolved blocking findings to the caller and publish them through `mechanical-post-comment` under orchestration (or the standalone PR comment flow), then recommend escalation (stronger implementation model, or human decision).

   Completion criterion: the loop exits only via approval or the round limit — never by silently accepting unresolved blocking findings.

6. **Hand off.**
   - With `--merge-on-approve`: delegate the merge to `mechanical-merge` under orchestration; standalone use runs `arc-git-pr-check` with `--ship merge`. Then confirm the result.
   - Otherwise: report verdict, rounds used, findings resolved, and the PR URL; the caller retains the merge decision.

   Completion criterion: the caller receives verdict, round count, and PR URL, and the merge happened only if explicitly requested.

## Boundaries

- Use `arc-work-issue --ship pr` to produce the PR this loop consumes; this skill never implements the original issue from scratch.
- Under orchestration use `mechanical-merge` for an authorized merge; standalone use retains `arc-git-pr-check`. Never run `gh pr merge` directly.
- Use `arc-bug-finder` for defects discovered outside the PR's scope — file them, don't fix them here.
- Do not force-push or rewrite the PR branch's history; reviewers' comment anchors must survive.
