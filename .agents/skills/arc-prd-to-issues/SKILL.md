---
name: arc-prd-to-issues
description: PRD-to-GitHub-issues slicing with tracer-bullet vertical slices. Use when converting a PRD into independently grabbable GitHub issues, reviewing slice granularity, or creating implementation tickets from a PRD. Do not use for implementation plans of existing issues.
---
# Arc PRD to Issues

Convert a PRD into GitHub issues. The leading word is **tracer-bullet**: each issue is a narrow, end-to-end vertical slice, not a horizontal layer.

For slice rules and issue template, load [SLICE_FORMAT.md](SLICE_FORMAT.md). For GitHub creation commands, load [GITHUB_CREATION.md](GITHUB_CREATION.md) after the user approves the slice breakdown.

## Steps

1. **Locate the PRD.**
   - Use an explicit issue number, URL, file path, or pasted PRD.
   - If missing, ask for the PRD source.
   - Fetch GitHub PRDs with comments when relevant.

   Completion criterion: the PRD content is available, or the run stops with a source request.

2. **Explore current code where useful.**
   - Read enough repo structure and existing implementation to avoid impossible or duplicate slices.
   - Keep this lightweight when the PRD is greenfield.

   Completion criterion: slices reflect current repo reality or state that repo context is unknown.

3. **Draft tracer-bullet slices.**
   - Each slice cuts through all needed layers and is independently verifiable.
   - Mark each slice AFK or HITL.
   - Identify blockers/dependencies and PRD user stories covered.

   Completion criterion: every PRD requirement is assigned to at least one slice or explicitly deferred/out of scope.

4. **Quiz the user before issue creation.**
   - Present numbered slices with title, type, blockers, user stories covered, and acceptance criteria.
   - Ask whether granularity, dependencies, and HITL/AFK labels are correct.
   - Iterate until approved.

   Completion criterion: the user approves the breakdown, or no GitHub issues are created.

5. **Create GitHub issues in dependency order.**
   - Create blockers first so dependent issues can reference real issue numbers.
   - Do not close or modify the parent PRD issue.
   - Include `Closes #<number>` guidance for later PRs, not during issue creation.

   Completion criterion: every approved slice has a GitHub issue or an exact GitHub/tooling blocker is reported.

## Boundaries

- Use `arc-planning-work` when the output is an implementation plan for an existing PRD/issue, not new GitHub issues.
- Use `arc-defining-work` when the user has not chosen a destination or may want Agile Accelerator.
- Use `arc-creating-user-stories` for general story-backlog creation not specifically driven by PRD tracer-bullet slicing; its `STORY_FORMAT.md` is the shared story contract.
