# YCEP — YABATECH Campus Events Platform

YCEP is a **trusted YABATECH campus event publishing and discovery platform**. It gives students one public place to find Management-approved events that would otherwise be scattered across WhatsApp, flyers, departmental groups, social media, and word of mouth.

## V1 product focus

The public student experience is the primary surface. Visitors do not need an account to browse approved events.

```text
Verified organizer creates a draft
              ↓
Organizer submits the event
              ↓
YABATECH Management reviews it
              ↓
Approved event is published
              ↓
Students discover it publicly
```

Authentication remains required for organizers and YABATECH Management. Member identity and yearly verification provide the trusted foundation for organizer approval.

YCEP V1 does not manage attendee registration, participant lists, attendance, waitlists, or registration notifications. A later Layer 2 may link to external registration services, but only after the publishing/discovery loop is complete.

## Engineering stack

- Node.js 24 and TypeScript
- Express.js
- EJS, Vanilla JavaScript, and Vanilla CSS
- PostgreSQL for development and production
- Prisma ORM and Zod validation
- Secure session authentication and bcrypt
- Vitest and Supertest

## Documentation read order

1. `YCEP_V1_SPEC.md` — authoritative simplified V1 behavior.
2. `AGENTS.md` — coding-agent rules.
3. `DECISIONS.md` — historical and current decisions.
4. `TASKS.md` — active milestone roadmap.
5. `DEVELOPMENT_LOG.md` — completed work and handoffs.
6. `FUTURE_IDEAS.md` — ideas outside active V1.

Historical decisions remain deliberately. When an older registration-heavy decision conflicts with the approved pivot, the newer superseding decision controls.

## Definition of V1 success

V1 is complete when this works without manual database edits:

1. A verified member applies to become an organizer.
2. Management approves the organizer.
3. The organizer creates and edits an event draft.
4. The organizer submits the event.
5. Management approves or rejects it.
6. An approved event becomes public.
7. A visitor without an account can browse, search/filter, and open it.
8. Draft, pending, rejected, account, and administrative data remain protected.

## Current implementation note

Milestone 4C is implemented. The public homepage shows at most 24 upcoming `PUBLISHED` events in deterministic date/time/title order, and each published event has a public detail page. Past published events remain directly accessible, while every non-published status returns the same generic not-found response. Search and filtering remain a later milestone.

Public routes:

- `GET /` — upcoming approved campus events; no account required.
- `GET /events/:eventId` — approved public event details; no account required.

Public discovery supports shareable GET parameters:

- `/?q=career` — search title, description, venue, organizer name, and category name.
- `/?category=TECH` — exact persisted category code.
- `/?department=CSC` — explicitly relevant and general/no-department events.
- `/?level=ND2` — explicitly relevant and general/no-level events.
- `/?date=today`, `/?date=week`, or `/?date=month` — Africa/Lagos calendar periods.
- Parameters may be combined; different filter dimensions use AND semantics.

Results remain chronological and show at most 24 cards. When more matches exist, the page reports the full matching total. Search/filter state requires no account and works without JavaScript.

Event management and history:

- `GET /organizer/events?view=history` — current authorization's past published and cancelled events.
- `POST /organizer/events/:id/cancel` — active exact owner permanently cancels a published event with a public reason.
- `GET /admin/events/history` — protected Management history, separate from the pending queue.
- `POST /admin/events/:eventId/cancel` — Management withdraws a published event with a public reason.

Published events are immutable. Past status is derived from the event date; YCEP does not automatically mark events `COMPLETED`. Cancelled events leave discovery but retain an explanatory direct public page.
