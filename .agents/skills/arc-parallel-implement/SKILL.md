---
name: arc-parallel-implement
description: "Implements multiple planned user stories in parallel with isolated worktrees, using Arc Pi native subagents when available or the non-Pi external orchestrator fallback. Each accepted story gets its own branch, commit, and PR."
---

# Parallel Story Implementation

Implement multiple independent planned stories concurrently. The leading words
are **worktree-first**: each story gets its own feature branch and isolated
worktree before any write-capable child starts. The parent owns planning, route
selection, acceptance, review judgment, and approval; children only edit and
verify their assigned worktree.

## Input

Accept the planned story or issue references plus an optional requested ship mode:

- `--ship pr` (default) — open one PR per accepted story and stop for review.
- `--ship auto` — enable auto-merge only when the caller explicitly requests it.
- `--ship merge` — merge only when the caller explicitly requests it.

Carry the requested mode into every story contract. Do not let an implementation
child choose or execute it.

## When to Use

- The user asks to implement multiple issues or planned stories.
- Each story has a plan and acceptance criteria.
- File ownership is independent enough for concurrent work.

Use `arc-work-issue` for one story. Run dependent or heavily overlapping stories
sequentially.

## Prerequisites

1. **Plans exist.** Collect each issue number, `W-XXXXXX` ID, title, complete
   plan, acceptance criteria, target files, and verification commands. If a plan
   is missing, use `arc-planning-work` first.
2. **Stories are independent.** Build a file map. Assign minor shared-file
   changes to one story and record the dependency; serialize heavy overlap.
3. **Baseline is known.** Confirm the main checkout is clean enough to create
   worktrees and run the repository's baseline tests.
4. **Branches are fixed.** Default to `feat/W-XXXXXX-<short-description>` and
   preserve the repository's established convention when it differs.

## Workflow

### Step 0: Runtime Capability Preflight

This required gate runs before Step 1's fan-out preparation and before any
worktree or other filesystem setup. Choose the runtime by capability, not by
product-name guessing, by inspecting the tools available in the current parent
session. If both runtimes are usable, select the native Arc Pi surface; inspect
the external fallback only when the native pair is absent or incomplete.

#### Arc Pi native path

Use the native path only when both `subagent_spawn` and `subagent_wait` are
available. `subagent_list`, `subagent_check`, and `subagent_cancel` are the
supporting inspection and control capabilities. The native surface is for
disjoint, self-contained story/worktree tasks; it does not replace ARC phase
routing, authorization, or parent judgment.

- `subagent_spawn` is nonblocking. Give each child one story contract, a label,
  and a `cwd` relative to the current Arc Pi project. If needed, pass an actual
  provider/model ID through `model`; do not pass a runner phase alias.
- Record every returned `arc-sub-...` ID. Start no more than four active
  children in one parent session. Batch larger sets in waves of at most four;
  wait for the current wave before starting the next one.
- Call `subagent_wait` once with the relevant IDs before accepting their work.
  A successful non-cancelled wait claims those results and suppresses duplicate
  automatic completion follow-ups. A cancelled wait leaves the one bounded
  completion follow-up available.
- Use `subagent_check` or `subagent_list` for bounded status, and `/subagents`
  (or `/sub`) for the TUI dashboard and per-child activity view. Active children
  may be steered or cancelled; settled children are read-only. Parent-session
  shutdown cancels active children, so do not treat them as durable jobs.

The requested native `cwd` must be an existing directory relative to the current
project and must resolve inside that project. Start Arc Pi from the repository
root when dispatching repo-local worktrees, and use paths such as
`.arc/worktrees/<story-slug>`; never pass an absolute path or `../` escape.
Children have only the built-in coding tools and cannot invoke nested subagents,
ARC delegation, background terminals, decision tools, ask-user tools, extensions,
or external model workers. Their local bash is trusted-host execution, not an OS
sandbox, so the task contract must still prohibit scope expansion and GitHub or
credential access.

Names such as `codex-*` and `opus-review` are not native Arc Pi routes.
`composer-implement` and other runner aliases belong to the external
orchestrator path; they are not `subagent_spawn` model values. Do not present
any of those aliases as the native child route.

#### Non-Pi external-orchestrator fallback

When the native capabilities are absent or incomplete, use the non-Pi external
fallback only if the installed `arc-orchestrator`/`arc_delegate` integration
also exposes the capability surface needed to dispatch and collect bounded
parallel workers. Select its currently advertised capability or route IDs for
implementation, verification, and escalation; do not assume a legacy alias.
Keep one write-capable worker per story worktree and retain the existing
external parent/worker and ship boundaries. Do not attempt native `subagent_*`
calls when the required native pair is not present, and do not copy external
route names into Arc Pi instructions.

For the external path, concurrent read-only routes may share a checkout, but
every concurrent write-capable route must receive a different story worktree.
Workers never commit, push, merge, comment, deploy, edit secrets, update issues,
or touch unrelated files. Review workers return findings to the parent rather
than posting them; the parent retains judgment and approval.

#### Incomplete or unavailable runtimes

A native surface is incomplete when either `subagent_spawn` or
`subagent_wait` is missing; the pair is required even if supporting inspection
tools are available. Treat an external integration as incomplete when it does
not expose a usable bounded parallel dispatch-and-result capability surface.
If the native pair is incomplete and the external fallback is absent or
incomplete, stop and report the missing capabilities as a blocker. Do not
gather fan-out work, create `.arc/` or `.arc/worktrees/`, run `git worktree add`,
or add or modify `.git/info/exclude`; no filesystem setup is permitted in this
no-runtime case. Do not simulate fan-out with ad hoc workers, sequential child
emulation, or external aliases passed as native model values.

Completion criterion: exactly one usable native or external bounded parallel
runtime is selected, or the request is stopped with its missing capabilities.

### Step 1: Gather and Partition

Fetch each issue body and comments, then build the story/file map:

```bash
gh issue view <number> --json title,body,labels
gh issue view <number> --comments --json comments
```

Completion criterion: every story has a plan, acceptance criteria, owned files,
branch name, and test commands, with dependencies and overlaps explicitly marked.

### Step 2: Create Isolated Worktrees

Load the [worktree rules](../arc-work-issue/WORKTREE.md) used by
`arc-work-issue`. From the repository root, create one feature branch and
repo-local worktree per story before launching any write-capable child. Use
`.arc/worktrees/<story-slug>` so Arc Pi can resolve each child `cwd` inside the
current project; the worktree rules also add that path to `.git/info/exclude`.
Reach this step only after the runtime preflight succeeds; an unavailable
runtime must never reach worktree or exclude setup.
Treat each returned path as that story's sole directory for reads, edits, and
tests.

Completion criterion: `git worktree list` shows one distinct worktree and feature
branch per story; no worker will write to the main checkout or another story's
worktree.

### Step 3: Delegate Bounded Story Work

Select the native or fallback runtime above, then launch independent stories in
parallel only within its bounds. Each story contract must include:

1. exact story outcome and complete plan;
2. issue number, `W-XXXXXX` ID, branch, and worktree path;
3. files to read and files allowed to change;
4. behavior and story/plan formats that must remain unchanged;
5. verification commands and acceptance criteria;
6. explicit prohibitions: no commits, pushes, comments, merges, deployments,
   secret edits, issue updates, generated artifacts, other GitHub mutations, or
   unrelated refactors;
7. required report: changed files, tests added, command results, risks, and
   blockers.

On Arc Pi, pass the corresponding repo-local path as the relative `cwd`, record
the returned `arc-sub-...` ID, and keep active children at four or fewer. On the
external fallback, use its isolated worker invocation for the same contract. Do
not run two write-capable workers against the same checkout.

Completion criterion: every child returns scoped changes and verification
evidence from its assigned worktree, or a concrete blocker.

### Step 4: Inspect and Verify Each Story

The parent reviews every story diff against its plan and acceptance criteria,
checks that only story-owned files changed, and runs focused tests in that
story's worktree. On Arc Pi, inspect with `subagent_check`/`subagent_list`, use
the `/subagents` dashboard when useful, and claim the wave with
`subagent_wait` before accepting any result. On the external path, preserve its
existing independent check/review route.

Worker output is evidence, not ground truth. A failed or blocked child is not
shipped; retry or rework requires a parent-owned decision and a revised bounded
contract.

Completion criterion: each story is accepted with relevant tests passing, or is
reported blocked without being shipped.

### Step 5: Commit and Ship Per Story

Only the parent performs shipping mechanics after inspecting accepted diffs:

1. stage only the exact story-scoped allowlist and create the conventional
   commit for that story;
2. open one PR from that story's branch;
3. honor the caller's selected mode: `--ship pr` leaves the PR open for review,
   `--ship auto` enables auto-merge only when explicitly requested, and
   `--ship merge` merges only when explicitly requested.

Under the non-Pi external-orchestrator path, retain the existing
`mechanical-commit-push`, parent `gh pr create`, review-comment, and
`mechanical-merge` boundaries. Under Arc Pi native execution, the parent uses
the available parent-owned git/GitHub mechanics for the same approved mode.
Children never commit, push, create or modify PRs/issues, merge, deploy, or
choose `--ship`.

If review findings need publication, the parent decides their disposition and
publishes them through the applicable parent-owned path. Every accepted story
keeps one story, branch, commit, and PR; blocked stories receive no shipping
operation.

Completion criterion: every accepted story has its own conventional commit and
PR result for the chosen ship mode, and every blocked story has an explicit
handoff.

### Step 6: Report and Clean Up

Report one row per story:

| Branch | Issue | Tests | Files | PR / status |
|--------|-------|-------|-------|-------------|
| `feat/W-000005-...` | #5 | 149 (12 new) | 7 | #61 |

Remove a story worktree only after its PR is merged. Leave worktrees and branches
in place for `--ship pr` and `--ship auto`, and report their repo-local paths for
review or follow-up.

Completion criterion: merged stories leave no stale worktrees; unmerged stories
report their worktree paths, branches, and PR URLs or blockers.

## Rules

- Preserve one `W-XXXXXX` story, branch, commit, and PR per accepted worktree.
- Never implement in the main checkout or share a writable worktree between
  concurrent workers.
- Keep Arc Pi child `cwd` values inside existing repo-local `.arc/worktrees`
  directories; never use a sibling escape or another story's path.
- Stage only story-owned files; never use `git add .`.
- The parent owns planning, route choice, judgment, acceptance, review, and
  shipping approval; children only edit and verify within scope.
- Use at most four active native children and batch larger sets; wait and inspect
  each wave before starting another.
- Under the external fallback, preserve the installed `arc-orchestrator` route
  and its standalone ship behavior. Native children do not replace it.
- Keep dependent or heavily overlapping stories sequential.
