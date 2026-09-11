# PRD Slice Format

## Tracer-bullet rules

- Each issue delivers a narrow but complete path through all necessary layers: schema, API, UI, tests, docs, and config where applicable.
- A completed slice is demoable or verifiable on its own.
- Prefer many thin slices over a few thick slices.
- Avoid horizontal layer-only tasks unless they are unavoidable foundations.

## Slice review format

Present proposed slices as a numbered list:

```markdown
1. **Title**
   - **Type:** AFK / HITL
   - **Blocked by:** None / Slice N
   - **User stories covered:** PRD story 1, story 3
   - **Acceptance criteria:** ...
```

## AFK vs HITL

- **AFK:** can be implemented and merged without human interaction.
- **HITL:** requires human input such as architecture, design, legal/compliance, or product decision.

Prefer AFK where possible.

## GitHub issue body template

```markdown
## Parent PRD

#<prd-issue-number or PRD reference>

## What to build

Concise end-to-end behavior description. Reference PRD sections instead of duplicating the PRD.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- Blocked by #<issue-number>

Or: None - can start immediately

## User stories addressed

- User story 3
- User story 7
```
