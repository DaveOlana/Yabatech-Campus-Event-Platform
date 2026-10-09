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

The registration-era Milestone 4A structures were removed through forward migration `20261009010424_simplify_layer1_events`. The original Milestone 4A migration remains immutable history. Event drafts now contain only Layer 1 publishing/discovery information and recommended-audience targets.
