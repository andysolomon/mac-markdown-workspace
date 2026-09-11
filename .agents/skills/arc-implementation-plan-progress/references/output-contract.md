# Output Contract

## File naming & lifecycle
Prefix both files with a unique work-item identifier so concurrent plans never
collide in `docs/`: the tracked work-item ID when one exists
(`docs/W-000025-IMPLEMENTATION_PLAN.md`, `docs/W-000025-progress.txt`), else a short
kebab-case feature slug (`docs/rate-limit-IMPLEMENTATION_PLAN.md`,
`docs/rate-limit-progress.txt`). The plan and its progress file MUST share one prefix.
On completion (all items `[x]` / shipping PR merged), move both into `docs/archive/`.

## Plan File
Use `docs/<ID>-IMPLEMENTATION_PLAN.md` (or a user-specified filename under `docs/`).

Required sections:
1. Product goal and scope boundaries
2. Current baseline (omit only for true greenfield)
3. Missing capabilities (or full capability map for greenfield)
4. Milestones/phases with:
- goals
- deliverables
- dependencies
- risks
- acceptance criteria
5. Out-of-scope/deferred
6. Immediate next steps

## Progress File
Filename: `docs/<ID>-progress.txt` (same prefix as the plan) unless the user specifies otherwise.

Required format:
- Plain text
- Top title line
- One phase-level checkbox plus sub-step checkboxes for each phase
- Stable step IDs (`1.0`, `1.1`, `2.0`, etc.) so updates are merge-friendly

Template:

```txt
<ID> - Project Name - Progress
Generated: YYYY-MM-DD HH:MM:SS TZ
On completion, move this file and the plan to docs/archive/.

[ ] 1.0 - Phase 1 - Foundation
    [ ] 1.1 - Task
    [ ] 1.2 - Task
[ ] 2.0 - Phase 2 - Feature Build
    [ ] 2.1 - Task
[ ] 3.0 - Ship & archive
    [ ] 3.1 - Verify / open shipping PR
    [ ] 3.2 - On merge: move docs/<ID>-IMPLEMENTATION_PLAN.md + docs/<ID>-progress.txt to docs/archive/
```

## Quality Bar
- Tie tasks to concrete repository outcomes (files, services, tests, docs)
- Prefer explicit unknowns over assumptions
- Keep wording executable by another LLM without extra prompting
