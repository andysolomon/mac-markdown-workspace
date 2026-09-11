---
name: arc-implementation-plan-progress
description: Implementation-plan/progress tracker creation for software projects. Use when a user asks for an implementation plan, phased roadmap, gap analysis against a spec, or synchronized `IMPLEMENTATION_PLAN.md` and `progress.txt` execution tracker. Do not use for creating GitHub user-story backlogs.
---
# Arc Implementation Plan Progress

Create two synchronized in-flight artifacts under the project `docs/` directory:

- `docs/<ID>-IMPLEMENTATION_PLAN.md` or a clearly named variant
- `docs/<ID>-progress.txt` with checkbox execution tracking mapped to the plan phases

The leading word is **synchronized**: every progress item must trace to the plan, and every plan phase must have progress coverage.

## File naming & lifecycle

- **Unique prefix.** Prefix both artifacts with a unique work-item identifier so
  concurrent plans never collide in `docs/` — use the tracked work-item ID when one
  exists (e.g. `docs/W-000025-IMPLEMENTATION_PLAN.md`, `docs/W-000025-progress.txt`),
  otherwise a short kebab-case feature slug (e.g. `docs/rate-limit-IMPLEMENTATION_PLAN.md`).
  The plan and its progress file MUST share the same prefix.
- **Archive on completion.** When the work is complete (all progress items `[x]` /
  the shipping PR merges), move both files into `docs/archive/` so `docs/` only ever
  shows in-flight plans. Use `scripts/archive_plan.sh <plan-file> <progress-file>`,
  or `git mv` them manually. Record this move as the final progress step.

For the required output shape, load [references/output-contract.md](references/output-contract.md). For default stack assumptions, load [STACK_DEFAULTS.md](STACK_DEFAULTS.md) only when the user has not specified a stack.

## Steps

1. **Gather repository and request context.**
   - Read existing `README*`, planning docs, `docs/*-progress.txt`, and relevant source structure.
   - Identify user-provided specs/ideas and whether they are available locally.
   - Prefer explicit `unknown` notes over invented details.

   Completion criterion: the baseline section can cite concrete repo evidence or explicitly mark unavailable facts as `unknown`.

2. **Choose plan mode.**
   - Greenfield mode: no meaningful implementation exists; plan from zero.
   - Gap mode: implementation exists; compare current baseline to target scope and plan missing work.

   Completion criterion: the plan states its mode and why that mode fits the observed repo state.

3. **Write the implementation plan.**
   - Follow the contract in `references/output-contract.md`.
   - Include objective, scope boundaries, baseline, milestones, deliverables, dependencies, risks, acceptance criteria, deferred/out-of-scope work, and immediate next steps.
   - Include concrete test tasks aligned to user-focused behavior, not implementation-detail coupling.

   Completion criterion: every milestone has deliverables, dependencies/risks where relevant, and acceptance criteria that another agent can verify.

4. **Create or update the `docs/<ID>-progress.txt` tracker.**
   - Ensure `docs/` exists, then run or follow `scripts/init_progress_txt.sh <plan-file> [progress-file]` when useful;
     pass explicit `docs/<ID>-IMPLEMENTATION_PLAN.md` and `docs/<ID>-progress.txt` paths.
   - Preserve completed `[x]` items when updating an existing tracker.
   - Use stable numeric IDs (`1.0`, `1.1`, `2.0`) and ASCII checkboxes.
   - Make the final checkbox the archival step (move plan + progress to `docs/archive/`).

   Completion criterion: every plan phase has a phase-level checkbox and concrete sub-step checkboxes; completed prior work remains completed.

5. **Validate synchronization.**
   - Check that each progress item maps to a plan phase.
   - Check that each plan phase appears in the progress file.
   - Confirm the plan and progress files share the same unique `<ID>-` prefix.
   - Replace vague tasks such as "improve app" with concrete deliverables.

   Completion criterion: the final response names both artifact paths and confirms plan/progress synchronization or lists the exact unresolved mismatch.

6. **Archive on completion.**
   - When every progress item is `[x]` (or the shipping PR merges), move both artifacts
     into `docs/archive/` via `scripts/archive_plan.sh <plan-file> <progress-file>` or `git mv`.
   - This keeps `docs/` scoped to in-flight plans only.

   Completion criterion: on completion both files live under `docs/archive/`, or the response states the work is still in flight and the files remain in `docs/`.

## Boundaries

- Use `arc-creating-user-stories` when the user wants a GitHub Issues user-story backlog.
- Use `arc-planning-work` when the user asks to plan implementation of an existing tracked work item (it publishes to the source destination and also creates synchronized `docs/<ID>-IMPLEMENTATION_PLAN.md` and `docs/<ID>-progress.txt` artifacts). Use this skill directly for standalone plan/progress creation or updates without a tracked work-item source.
