---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues and drop them into the cycle inbox (docs/cycle/issues/inbox) for triage, using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, queue work for cycle, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets), then drop each one into the **cycle inbox** at `docs/cycle/issues/inbox/`. cycle's triage step picks them up, normalizes them into `todo/` items, chooses a workflow, and runs them.

This skill does NOT create GitHub issues. The inbox is the source of truth; cycle does the rest.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a plan/spec/PRD path, a GitHub/Linear/Jira URL, or an issue number) as an argument, fetch or read its full body so the slices are grounded in the real source material.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect any ADRs (`docs/adr/`) and `CONTEXT.md` in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Priority**: low / medium / high / critical (or `idea` if it still needs human judgment)
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?
- Are the priorities right?

Iterate until the user approves the breakdown.

### 5. Write the issues to the cycle inbox

For each approved slice, write a markdown file into `docs/cycle/issues/inbox/`. Write blockers before the slices that depend on them so you can reference their `id` in the "Blocked by" section.

**Filename** — match cycle's own convention: `txt-<UTCdate>-<UTCtime>-<slug>.md`

- `UTCdate` = `YYYYMMDD`, `UTCtime` = `HHMMSS` (get them with `date -u +%Y%m%d-%H%M%S`)
- `slug` = the title lowercased, every run of non-alphanumeric characters replaced with `-`, trimmed of leading/trailing `-`, truncated to 40 characters
- the filename (minus `.md`) is also the `id` in the frontmatter

Use the issue template below. cycle's triage step assigns `workflow`, `depends_on`, `parent`, and other engine fields later — the inbox file is source material, so do not invent issue numbers or workflow names here.

<issue-template>
---
id: <txt-YYYYMMDD-HHMMSS-slug — same as filename without .md>
source: text          # text | github | linear | jira | reflection | manual
title: "<short descriptive title>"
added_at: <ISO 8601 UTC, e.g. 2026-06-06T16:45:00Z — get with `date -u +%Y-%m-%dT%H:%M:%SZ`>
triage_attempts: 0
priority: medium      # low | medium | high | critical | idea
---

## Problem

A concise description of this vertical slice. Describe the end-to-end behavior to deliver, not a layer-by-layer implementation.

Avoid specific file paths or code snippets — they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it here and note briefly that it came from a prototype. Trim to the decision-rich parts.

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Context

Where this came from (e.g. "Imported from PRD docs/plan.md, slice 3 of 6") and any background triage needs. Include the source reference if one was provided.

## Blocked by

- The `id` (or title) of the blocking slice, if any.

Or "None - can start immediately" if no blockers.

## Out of Scope

- What this slice deliberately does NOT cover.
</issue-template>

**HITL vs inbox readiness.** AFK slices that are ready to execute go straight into `inbox/`. For HITL slices that still need an architectural decision or design review before a machine should touch them, prefer cycle's own guidance: either set `priority: idea` or write them into `docs/cycle/issues/ideas/` instead — cycle does not auto-process those, so they wait for human promotion. Default to `inbox/` unless the user asks otherwise.

### 6. Confirm

List the files you created (paths + titles). Optionally suggest the user preview triage with `./.cycle/bin/cycle.js triage --dry-run` (read-only) before running `./.cycle/bin/cycle.js run` to drain the queue.

Do NOT run cycle or modify any source plan/PRD.
