# AGENTS.md

Rules for AI agents working in this repository. Architecture, commands, and
conventions live in [`CLAUDE.md`](./CLAUDE.md).

## Testing

These rules override any skill, plan template, or habit that asks for unit
tests (for example the `Unit tests:` line in the arc planning templates).

- **Never write unit tests after you write code.** A test written to match
  code that already exists re-states the implementation and catches nothing.

- **Highly prefer E2E tests as the sole testing mechanism.** Use them to verify
  complex features work, driving the real app through Playwright (`e2e/`:
  the `electron` project for desktop, the `web` project for the browser
  build). At the end of E2E tests, produce a verifiable and repeatable
  artifact — a screenshot, exported file, or JSON snapshot of app state
  written with `testInfo.outputPath()` / `testInfo.attach()` — from
  deterministic inputs (isolated HOME / `--user-data-dir`, fixed window size,
  stubbed network), so a rerun reproduces it and a reviewer can inspect it.

- **If you must test a system in isolation, first write down all the ways it
  could fail, then write the code.** Put the list at the top of the test file;
  every isolated test must map to one listed failure mode that the E2E suite
  cannot reach (iOS-only storage paths, crypto tamper rejection, merge
  conflicts, race conditions). A unit test that maps to no listed failure mode
  does not get written.

The bar for keeping any existing unit test: it must catch a real bug that the
E2E tests miss. Tests of constants, defaults, trivial store setters, rendered
labels, mock call shapes, or happy paths an E2E spec already drives do not
meet it — delete them rather than maintain them.
