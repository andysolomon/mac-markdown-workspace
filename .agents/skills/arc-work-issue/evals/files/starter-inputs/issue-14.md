# GitHub Issue #14 (fixture)

**Title:** [W-000014] Retry failed queue dispatch

**State:** OPEN

## User Story
**ID:** W-000014

As an operator, I want failed queue dispatches to retry with backoff so that transient git errors do not strand stories in Backlog.

## Acceptance Criteria

### Scenario: Transient worktree error retries
**Given** `queue.next` fails once with a transient git error
**When** the daemon retries dispatch
**Then** the story moves to `in_progress` with a created worktree

### Scenario: Permanent error surfaces
**Given** `queue.next` fails with a permanent repository error
**When** retries are exhausted
**Then** the story stays queued and an error is recorded on the run

## Implementation Plan

1. Add retry wrapper around `git worktree add` in `mcp-server/queue.ts`.
2. Emit `story.update` lines for each retry attempt.
3. Add unit tests in `arc-story-queue/test/queue.test.ts`.
