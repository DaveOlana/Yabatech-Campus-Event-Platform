# AGENTS.md — Instructions for AI Coding Agents

These instructions apply to every coding agent working on YCEP.

## Source of truth and scope

Read `YCEP_V1_SPEC.md`, then `DECISIONS.md`, before changing product behavior. D-049 and later decisions supersede the former registration-heavy direction.

YCEP V1 is a trusted YABATECH campus event publishing and discovery platform. Its core loop is:

```text
Verified organizer → draft → submit → Management review → publish → public discovery
```

Do not add internal attendee registration, attendee applications, participant lists, registration limits/deadlines, registration history, attendance, waitlists, registration notifications, or external registration links. External links are deferred Layer 2 work.

## Preserve domain distinctions

- Organizer is an approved capability on a verified member account, not a separate authentication system.
- Organizer approval and event approval are separate trust gates.
- Every event has one authorization-bound primary organizer.
- `EventTargetDepartment` and `EventTargetLevel` influence discovery/relevance only. They never restrict public visibility or participation.
- Ordinary visitors do not need accounts to discover published events.
- Draft, pending, rejected, account, and Management data are not public.
- Public event reads must constrain status to `PUBLISHED` in the database query and use an explicit safe-field projection. The homepage uses the Africa/Lagos calendar boundary, excludes past events, orders by date/time/title, and returns at most 24. Past published events may remain directly accessible. Unknown and non-published detail URLs must share the same generic 404.
- Public department/level filters are relevance-only. Each must include explicit target matches and events with no targets in that dimension. They must never become eligibility rules or restrict the underlying public visibility of a published event.

## Inspect before editing

Inspect related schema, migrations, services, routes, middleware, templates, tests, and authorization rules before changing a feature. Prefer targeted changes over replacing working subsystems.

## Historical data and migrations

Prefer explicit status transitions over hard deletion for important domain records. Do not hard-delete published events, organizer applications/authorizations, approval decisions, or audit history.

Never rewrite applied migrations. Schema cleanup requires a new forward migration, data-impact review, and preservation of history.

## Permissions and security

- Enforce authorization on the backend.
- Derive organizer ownership, organizer public identity, cycle, and event status server-side.
- Sensitive owner actions are not automatically granted to future co-organizers.
- Management functions belong only to the dedicated `ADMIN` account.
- Never hardcode secrets or credentials.
- Never store plaintext passwords.
- Use secure HTTP-only session cookies and bcrypt.
- Validate input and poster/file handling.
- Protect state-changing operations against unauthorized requests and CSRF.
- Do not expose unrelated account or administrative data.
- Log important Management actions transactionally wherever practical.

## Event lifecycle

The lifecycle is `DRAFT`, `PENDING_APPROVAL`, `PUBLISHED`, `REJECTED`, `CANCELLED`, and `COMPLETED`. Validate transitions explicitly.

Only an authorized owner can submit a draft. Only Management can approve/reject and thereby publish. Fundamental changes such as title, organizer identity, or core purpose require reapproval. Operational changes must preserve event history.

Submission, approval, and rejection must lock the concrete Event row in an interactive PostgreSQL transaction, re-read state after the lock, and commit the lifecycle mutation with its audit record atomically. Approval must also revalidate the owning organizer authorization, current cycle, linked MEMBER role, and ACTIVE same-cycle verification. If that trust gate fails, leave the event pending and do not write an approval audit; Management may still reject it.

## Architecture

The frozen V1 stack is:

- Node.js 24 and TypeScript
- Express.js
- EJS, Vanilla JavaScript, and Vanilla CSS
- PostgreSQL for development and production; SQLite is prohibited
- Prisma
- Zod
- Session authentication with secure HTTP-only cookies and bcrypt
- Nodemailer behind an `EmailService` abstraction if email is later approved
- Vitest and Supertest

Do not change the stack without explicit approval.

## Tests

For material work, test permissions, valid flows, invalid transitions, expiry, ownership isolation, spoofing protection, and relevant concurrency. Run focused and full suites. Do not report completion with unexplained failures.

## Handoffs

At meaningful milestones, update `DEVELOPMENT_LOG.md` with changes, migrations, tests, unresolved issues, and the next task. Product behavior changes require corresponding updates to `DECISIONS.md` and `YCEP_V1_SPEC.md`.

When uncertain, choose the least destructive implementation, preserve V1 behavior, and document the ambiguity rather than silently inventing a rule.
