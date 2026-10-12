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

Members sign in with matric number and password. The single Management account signs in with a dedicated username and password configured through ignored `YCEP_ADMIN_USERNAME` and `YCEP_ADMIN_PASSWORD` environment variables. Run `npm run admin:bootstrap` to create it, `npm run admin:bootstrap -- --update-existing` for an explicit in-place local credential update, or `npm run admin:reset-password` for deliberate technical-owner password recovery. Commands never print plaintext credentials.

YCEP V1 does not manage attendee registration, participant lists, attendance, waitlists, or registration notifications. Its narrow Layer 2 publishes an optional Management-reviewed HTTPS link to an organizer-controlled registration service; YCEP never fetches the link or stores/synchronizes registration results.

## Engineering stack

- Node.js 24 and TypeScript
- Express.js
- EJS, Vanilla JavaScript, and Vanilla CSS
- PostgreSQL for development and production
- Prisma ORM and Zod validation
- Secure session authentication and bcrypt
- Vitest and Supertest

## Vercel + Neon deployment

YCEP deploys unchanged as a Node 24 Express/EJS application on one Vercel Fluid-compute function. Use Neon's pooled endpoint for permanent `DATABASE_URL` runtime access and its direct endpoint as `DIRECT_DATABASE_URL` only for `prisma migrate deploy`. Production also requires `NODE_ENV=production`, a random `SESSION_SECRET` of at least 32 characters, a connected Vercel Blob store (`BLOB_STORE_ID`, Vercel-managed `VERCEL_OIDC_TOKEN`, and `BLOB_WEBHOOK_PUBLIC_KEY`), and a random `CRON_SECRET` of at least 16 characters. Scope these resources to Production only. `PORT` and `TRUST_PROXY` are not user-configured on Vercel.

Generate the session secret in PowerShell without writing it to a repository file:

```powershell
[Convert]::ToBase64String(
  [Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
)
```

Apply migrations deliberately before deployment, then initialize canonical data with explicit cycle values:

```powershell
$env:DIRECT_DATABASE_URL="<Neon direct URL>"
npx prisma migrate deploy
$env:DATABASE_URL="<Neon pooled URL>"
$env:YCEP_ACADEMIC_CYCLE_NAME="<confirmed session name>"
$env:YCEP_ACADEMIC_CYCLE_START="<ISO date>"
$env:YCEP_ACADEMIC_CYCLE_END="<ISO date>"
npm run db:reference:production
```

The production reference command is idempotent, creates no users/events, uses exactly First Semester and Second Semester, and preserves later Management-approved departments. Bootstrap Management separately with `npm run admin:bootstrap`. Its username/password variables are temporary and are not required by the running app. Run `npm run sessions:prune` occasionally during scrutiny to remove expired sessions. Poster cleanup runs daily through Vercel Cron and can also be invoked with `npm run posters:prune`.

The initial login/registration limiter remains in memory per Fluid instance: recycling resets counters and another instance can provide another allowance. Revisit a shared limiter before broad institutional launch. Give production database/session variables only to Vercel's Production environment; Preview deployments must not receive production Neon access.

## Security configuration

`DATABASE_URL` is required. Tests require `TEST_DATABASE_URL`. Production requires `NODE_ENV=production`, a random `SESSION_SECRET`, `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN`, `BLOB_WEBHOOK_PUBLIC_KEY`, and `CRON_SECRET`; the application fails closed when these are missing. Local HTTP keeps the session cookie non-Secure, while production requires HTTPS and marks it Secure. Do not set `TRUST_PROXY` until the deployment proxy hop or subnet is explicitly reviewed. HSTS is intentionally deferred to deployment readiness.

Every browser mutation uses a session-backed CSRF token. Login and registration are rate-limited in memory; a shared limiter store is required if production runs multiple application instances. Poster uploads are optional, capped at 4 MB, restricted to JPEG/PNG/WebP, and signature-checked. Development writes ignored files beneath `public/uploads/event-posters`; production uses direct, authorized Vercel Blob uploads under `ycep/posters/` and never depends on the function filesystem. PostgreSQL stores only URL/ownership metadata, never raw images. Managed assets use lifecycle-aware 30-day retention, while unattached uploads receive a 24-hour grace period before cleanup. External registration destinations must use HTTPS and are never fetched by YCEP.

Poster artwork is displayed in full inside a 4:5 frame; 1080 × 1350 pixels is recommended rather than required. Event create/edit fields are automatically restored for up to 24 hours within the same browser tab, excluding the CSRF token and poster file. Multi-value department and level selectors include Select all and Clear actions.

Security verification commands are `npm test`, `npm run build`, `npm run prisma:validate`, and `npm audit`. Do not use forced audit upgrades without reviewing their compatibility.

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

Milestones 4C–4F are implemented. The public homepage shows at most 24 upcoming `PUBLISHED` events in deterministic date/time/title order, with shareable search/filter controls and polished responsive event cards. Each published event has a public detail page. Past published events remain directly accessible, while every non-published status returns the same generic not-found response.

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
- `GET /admin/account` — protected Management username and password controls.
- `POST /admin/events/:eventId/cancel` — Management withdraws a published event with a public reason.

Published events are immutable. Past status is derived from the event date; YCEP does not automatically mark events `COMPLETED`. Cancelled events leave discovery but retain an explanatory direct public page.
