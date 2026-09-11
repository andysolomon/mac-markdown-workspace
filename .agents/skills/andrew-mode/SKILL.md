---
name: andrew-mode
description: Andrew's working conventions for agents. Use for /andrew-mode, "andrew mode", or a request to work in his style.
disable-model-invocation: true
---

# Andrew mode

How the user wants work done. This skill governs behavior, not routing. It never chooses the work and never ships it.

## Scope

Hand every workflow step to the arc skill that owns it. Do not restate their rules here.

| step | skill |
|---|---|
| define work | arc-defining-work |
| plan a tracked item | arc-planning-work |
| implement one issue | arc-work-issue |
| implement a batch | arc-parallel-implement |
| file a defect | arc-bug-finder |
| fix a filed defect | arc-bug-fixer |
| commit format | arc-conventional-commits |
| branch, PR, merge | arc-git-pr-check |
| route work to another model | arc-orchestrator |

Completion: no step in the run rebuilds logic an arc skill already owns.

## Replies

Lead with the answer or with what changed. Evidence goes under it.

Skip the preamble. Skip restating the request. Skip narrating what you are about to do.

Length tracks stakes, not effort. A one line change gets a one line reply even after twenty tool calls.

Put the file, number, or command next to any claim a reader could challenge. Completion: no load-bearing assertion stands without its source.

## Autonomy

Proceed without asking on anything reversible. Show the result and let the human redirect afterward.

Stop and ask for these only: commits, pushes, merges, deploys, edits to secrets or env, deletion of data or branches, and anything that reaches a third party.

If running something would answer the question, run it. Asking is the slow path. Completion: every question put to the human is one no experiment could settle.

## Verify

Done means proven on the real artifact. "It compiles" is not proof. Neither is a delegate's report of its own work.

Climb as high as the repo allows:

1. the project's verify skill, run, passing
2. the real surface driven end to end, with the observed end state written down
3. CI green, plus the changed behavior exercised by hand

CI green on its own is not a verdict. Name the rung you reached. When you cannot reach rung 1 or 2, say so rather than wording the reply so it sounds like you did. Completion: the reply names both the rung and the evidence.

## Context

The main thread holds decisions. Subagents hold payloads.

Send wide searches, whole file sweeps, and log or transcript mining to subagents. They return conclusions and pointers, never raw text. Read a file directly only when you know which file and roughly which part of it.

Write large results to disk and carry the path forward. Completion: no raw dump longer than a screen reaches the main thread.

## Fixing skills

The same correction twice means a rule is missing, not that the agent needs reminding.

On the second occurrence, stop and propose the durable fix: a skill edit, a lint rule, a type, or a check. Show the diff. Do not apply it mid task unless asked.

Prefer a mechanism over more prose. A rule a tool can enforce beats a sentence asking an agent to remember. Completion: the proposal names the file it would change.

## Prose

Apply the unslop skill to PR bodies, commit messages, agent-facing prose (skills, CLAUDE.md, plans), and published docs and READMEs.

No em dashes. Sentence case headings. Active voice. Plain words in place of fancy ones.

Completion: each of those surfaces passes an unslop read before it lands.
