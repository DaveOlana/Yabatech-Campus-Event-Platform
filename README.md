# YCEP — Project Development Guide

YCEP stands for **YABATECH Campus Events Platform**.

This repository should be built against the documents in this folder. The academic proposal explains the project for school submission, but these files define how the software itself should be implemented.

## Read order for any AI coding agent

1. `YCEP_V1_SPEC.md` — product source of truth.
2. `AGENTS.md` — rules for Claude, Gemini, Codex, or any other coding agent.
3. `DECISIONS.md` — important product and engineering decisions already made.
4. `TASKS.md` — milestone-based implementation plan.
5. `DEVELOPMENT_LOG.md` — completed work, current state, and handoff notes.
6. `FUTURE_IDEAS.md` — ideas intentionally excluded from V1.

## Core rule

**Do not add a feature to V1 just because it sounds useful or is technically easy.**

If a new idea appears during implementation:

- record it in `FUTURE_IDEAS.md`;
- do not implement it unless V1 is intentionally revised;
- if it changes an existing business rule, record the revision in `DECISIONS.md` and update `YCEP_V1_SPEC.md`.

## Before coding

The first engineering session should:

- inspect the existing repository;
- identify the current stack and project structure;
- compare the implementation with `YCEP_V1_SPEC.md`;
- identify contradictions, missing migrations, or unsafe assumptions;
- propose an architecture/build sequence;
- avoid large code generation until the structure is understood.

## Definition of V1 success

YCEP V1 is successful when this flow works end to end without manual database edits:

1. A user creates an account with YABATECH matric details.
2. The account becomes active/verified for the current yearly cycle.
3. The user can browse public events.
4. A verified member applies for organizer privileges.
5. YABATECH Management approves the organizer.
6. The organizer creates an event and submits it for approval.
7. YABATECH Management approves and publishes it.
8. A member registers or applies, depending on the event participation mode.
9. The organizer manages participants/applicants.
10. The member can cancel their registration/application where allowed.
11. The organizer records attendance.
12. Event updates/cancellation preserve history and trigger required email notifications.
13. Completed/cancelled events remain available as historical records.
