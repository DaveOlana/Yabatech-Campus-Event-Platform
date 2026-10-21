# YCEP — Development Log

Use this file as the handoff record between Claude, Gemini, Codex, and human developers.

Newest entries should be added at the top.

## 2026-10-21 — Fix Intermittent CSRF Failure During Auth Context Switching

### Status

Complete and verified. Fixed session regeneration state loss, mobile browser BFCache/disk cache restoration of stale tokens, trailing-slash route handling, and added actionable error UX with direct reload links.

### Scope and Changes

- **Atomic CSRF State on Regeneration**: Updated `req.session.regenerate()` in `POST /login`, `POST /admin/login`, and `POST /admin/account/password` to establish a fresh `req.session.csrfToken` atomically before calling `req.session.save()`. This ensures the session written to PostgreSQL immediately contains both `userId` and a valid `csrfToken`, eliminating race conditions on post-login redirects.
- **Cache Prevention for Auth Views**: Added `preventFormCaching` to `ensureCsrfToken` for all public auth forms (`/login`, `/admin/login`, `/register`) and authenticated views, sending `Cache-Control: no-store, no-cache, must-revalidate, private` and `Pragma: no-cache`.
- **Client-Side BFCache Invalidation**: Added a `pageshow` listener in `public/js/csrf-forms.js` that triggers `window.location.reload()` if `event.persisted` is true, ensuring mobile back/forward navigation restores fresh DOM forms with active tokens.
- **Path Normalization**: Updated `ensureCsrfToken` and `verifyCsrfToken` to normalize trailing slashes (e.g., `/login/`, `/admin/login/`) so mobile keyboard autocompletion cannot bypass token generation.
- **Actionable Error UX & Safe Diagnostics**: Preserved HTTP 403 on invalid CSRF while presenting friendly `"Your form expired. Reload and try again."` messaging with direct return buttons for auth forms. Added structured diagnostic warnings omitting all sensitive credentials, raw tokens, and session secrets.
- **Automated Verification**: Added comprehensive test suite `tests/csrf-session-lifecycle.test.ts` covering 19 distinct lifecycle scenarios including Vercel HTTPS proxying simulation, token rotation, and identity switching.

## 2026-10-19 — Production Launch, Neon Database Bootstrap, and Crisp Branding Suite

### Status

Complete and live. The application is running on Vercel Fluid-compute Express (`https://ycep.vercel.app`) backed by Neon PostgreSQL (Frankfurt) with live reference data, an active Management account, and a high-contrast branding and favicon suite.

### Database & Bootstrap

- **Neon PostgreSQL**: Applied all 13 Prisma migrations forward via direct connection (`DIRECT_DATABASE_URL`).
- **Reference Data**: Seeded the active academic cycle (`2026/2027`), all 56 departments, study levels, and event categories.
- **Management Account**: Bootstrapped the dedicated `ADMIN` account (`YCEPadmin`, normalized `ycepadmin`) with bcrypt password authentication.

### Branding & Favicon Suite

- **Navbar Brand**: Cleaned transparent navbar logo (`public/assets/brand/ycep-navbar.png`) with clean typography and gradient green wave.
- **Crisp Favicon Suite**: Generated high-contrast white circular badge with maximized `YCEP` mark:
  - `favicon-32x32.png` & `favicon-16x16.png`
  - `apple-touch-icon.png` (180x180)
  - `favicon.ico` (multi-resolution 16x16 + 32x32 container)
  - Removed unsupported base64 SVG wrapper to guarantee immediate rendering across Chromium, Safari, and Firefox.
- **Template Integration**: Updated all 24 EJS templates with explicit PNG + ICO `<link>` tags and cache-busting `?v=4`.

### Verification

- Live Vercel site (`https://ycep.vercel.app`) returns HTTP 200 with clean safe-field discovery projection.
- Tab icons render sharply on both dark and light browser themes.


### Status

Implemented and committed (commit `e5702c0`). No Neon, Vercel project, or Blob store has been created yet; those are manual provider-setup steps the operator performs before the first push.

### Scope

**Vercel serverless entrypoint (`api/index.ts`)**

Created `api/index.ts` as the Vercel Fluid-compute entrypoint. Imports `dotenv/config` and exports the Express `app` from `src/app.ts` as a default export. Does not call `app.listen()` — that remains in `src/server.ts` for local development only. Vercel's Node.js runtime discovers the `api/` directory, wraps the default-exported handler, and routes all requests to it.

**`vercel.json` — routing and asset bundling**

- Added a `functions` block targeting `api/index.ts` with `includeFiles: "views/**,public/**,prisma/schema.prisma"` so Node File Trace (nft) bundles EJS templates, static assets, and the Prisma schema into the deployment bundle (nft does not follow `app.set('views', ...)` automatically).
- Added a catch-all rewrite `"/(.*)" → "/api/index"` to route all HTTP traffic through the single function.
- Retained the `0 3 * * *` daily cron for poster cleanup at `/internal/maintenance/posters`.
- `maxDuration: 30` seconds — covers the longest expected request paths; DDL and migrations are never executed during request handling.

**`.vercelignore`**

Excludes `.env`, `tests/`, `scripts/`, `design resources/`, and `dist/` from the deployment upload. All secrets are supplied through the Vercel dashboard environment variable UI. Vercel rebuilds `dist/` from source via the `build` script in `package.json`.

**Mobile CSS refinements (`public/css/style.css`)**

Appended a dedicated mobile-refinement block addressing gaps not covered by the prior two breakpoints:
- `≤720px`: management-facts label narrowed (90px→flexible), poster-upload-control stacks vertically, public-detail visual centered when stacked, audience DL collapses, account-detail grid narrowed, section heading stacks, event-view tabs use `flex-wrap: nowrap` with `overflow-x: auto` already present.
- `≤430px`: auth panel padding reduced, management-facts and account-detail collapse to single column, event-row date thumb shrinks, discovery-hero `line-height` raised to 1.0 for comfortable reading at very small sizes, footer stacks and dots hidden, `.table-container` gets `-webkit-overflow-scrolling: touch`.

### Tests / verification

- `npx tsc --noEmit` exits 0 (no type errors across `src/**`; `api/index.ts` is outside `rootDir` and is handled by Vercel's own build).
- `npm run build` exits 0 (esbuild client bundle + tsc server compile).

### Next steps (operator / manual)

1. Create Neon project (Frankfurt / eu-central-1). Copy `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (direct).
2. Run `DATABASE_URL=$DIRECT_DATABASE_URL npx prisma migrate deploy` from local or CI against the Neon database.
3. Run `npm run db:reference:production` with `DATABASE_URL` pointing at Neon to seed reference data (categories, levels, departments).
4. Run `npm run admin:bootstrap` with `DATABASE_URL` pointing at Neon to create the Management admin account.
5. Push repository to GitHub.
6. Import the GitHub repo into a new Vercel project. Set Framework = Other; Build Command = `npm run build`; Output = blank (Express, not a static site).
7. Set all production environment variables in the Vercel dashboard: `DATABASE_URL`, `DIRECT_DATABASE_URL`, `SESSION_SECRET` (≥32 chars), `BLOB_STORE_ID`, `VERCEL_OIDC_TOKEN`, `BLOB_WEBHOOK_PUBLIC_KEY`, `CRON_SECRET` (≥16 chars), `NODE_ENV=production`.
8. Create a Vercel Blob store, link it to the project (same region as Neon — Frankfurt).
9. Trigger first deployment. Monitor the function log for `validateRuntimeEnvironment` startup.
10. Smoke-test: `/`, `/about`, `/login`, `/register`, `/admin`.

## 2026-10-12 - Rejected event revision and resubmission


### Status

Implemented. No schema migration was required and no deployment or GitHub push was performed.

### Scope and verification

- Added the owner-only `REJECTED → DRAFT → PENDING_APPROVAL` correction path while keeping rejected and revised events private until fresh Management approval.
- Management feedback is visible on the rejected detail and revision form and remains available on the corrected draft until resubmission.
- Revision locks and re-reads the Event, resets stale submission/reviewer timestamps, and records `EVENT_REVISION_STARTED` with the prior rejection context in immutable audit history.
- Published, pending, cancelled, cross-owner, old-cycle, and trust-lapsed protections remain unchanged.
- Added end-to-end coverage for feedback visibility, revision, audit preservation, resubmission, and continued public isolation.

## 2026-10-10 - Production-persistent poster storage

### Status

Implemented and intentionally uncommitted. No Vercel, Blob, or Neon resource was created and nothing was deployed.

### Scope and verification

- Added D-063 and migration `20261010130000_persistent_poster_storage`, introducing nullable `posterBlobPath` ownership metadata while preserving `posterUrl` and all historical event rows.
- Production now uses authenticated direct browser-to-Vercel-Blob uploads with short-lived OIDC credentials constrained to `ycep/posters/<uuid>.<safe-extension>`, JPEG/PNG/WebP, and 4 MB. Server-side attachment verifies Blob metadata and file signature before saving the draft.
- Development retains ignored local poster files; production explicitly refuses local fallback. PostgreSQL contains only references, never image bytes.
- Replacement/removal switches or clears the Event first, then attempts deletion only for YCEP-owned paths. Failed old-file deletion is recoverable through orphan cleanup; external URLs are untouched.
- Added one idempotent cleanup service for 30-day published/cancelled/rejected/stale-draft retention and 24-hour orphan cleanup, exposed through `npm run posters:prune` and a daily `CRON_SECRET`-protected Vercel Cron route.
- Updated the CSP only for the Blob upload control plane and kept CSRF enforcement for token issuance; only signed provider completion callbacks bypass the synchronizer check and remain webhook-signature verified by the official SDK.
- Tests use local/mocked storage and never access real Vercel Blob. Final verification: 214/214 tests passed across 11 files; TypeScript/client build, Prisma validation, JavaScript syntax checks, `git diff --check`, and all 13 migrations on both `ycep_dev` and `ycep_test` passed.

## 2026-10-10 - External registration and managed event posters

### Status

Implemented and intentionally uncommitted. Event drafts now accept a managed poster upload and an optional external HTTPS registration link as two separate fields. No hosting resource was created and nothing was deployed.

### Scope and verification

- Added D-061 and updated the V1 specification to permit Management-reviewed external registration links while keeping attendee registration, participant data, capacity, deadlines, attendance, and waitlists outside YCEP.
- Added migration `20261010100000_external_event_registration_url`; all 12 migrations are additive and the existing migration history remains intact.
- Replaced organizer-entered poster URLs with JPEG, PNG, or WebP uploads (maximum 4 MB), including MIME/signature validation, server-generated object names, local preview, replacement cleanup, ignored local-development storage, and Vercel Blob storage in production.
- Added a separate optional HTTPS registration URL to draft creation and editing. The URL and poster remain draft-only, are visible to Management during review, and are preserved through approval or rejection.
- Added public poster artwork and explicit `Register now` actions. External links open safely in a new tab, appear only while the event is actionable, and never replace the internal event-detail link.
- Updated public discovery and organizer/Management history presentation to compare event end date and time using the Africa/Lagos clock. Finished events leave the upcoming feed without mutating their persisted `PUBLISHED` status.
- Added coverage for unsafe registration schemes, upload type/signature validation, poster persistence, Management review, public CTAs, fallback artwork, cancellation, and exact-time behavior.
- Fixed the first manual-test findings: local `blob:` previews are permitted by CSP, multipart forms render their CSRF field without depending on JavaScript, local saves work without cloud credentials, and CSRF failures offer a direct route back to the event form.
- Added D-062: all uploaded artwork now fits fully inside consistent 4:5 preview/public/workspace/Management frames without cropping; 1080 × 1350 is guidance rather than a validation rule.
- Added 24-hour, tab-scoped recovery for non-file event-form fields with automatic refresh restoration, a discard-to-last-saved action, synchronous page-exit capture, successful-save cleanup, and a clear reminder that poster files must be selected again.
- Added Select all and Clear controls to the multi-value department and level audience selectors while preserving their optional, relevance-only meaning.
- Verification: 207/207 tests passed across 11 files; TypeScript build, Prisma validation, both development/test migration runs, JavaScript syntax checks, and `git diff --check` passed.
- Superseded by D-063: provision a connected Production-scoped Vercel Blob store and Cron secret before deployment. The repository contains no provider credential.

## 2026-10-09 — Local catalogue sync and department-picker UX

### Status

Implemented and intentionally uncommitted. The local development catalogue now contains all 56 approved departments without replacing the existing Computer Science row, and long department controls use one progressively enhanced searchable picker.

### Scope and verification

- Added additive, idempotent `npm run db:departments:sync`, reusing the production catalogue and deterministic internal-code rules without changing cycles or creating users, events, organizers, audits, or credentials.
- Synchronized `ycep_dev` from 1 to 56 departments. Computer Science retained ID `d3db1a7e-0e68-4372-b668-a3084c6f63fd` and its existing member references; a second run created zero rows, and duplicate name/code checks returned none.
- Added a reusable Vanilla JavaScript department picker to public discovery, registration, profile editing, and organizer event targeting. It preserves native-select fallback, URL-driven GET filtering, multi-selection, keyboard operation, ARIA state, internal scrolling, and the Management-gated department-suggestion path.
- Replaced the recursive `/admin/login` navigation item with `Member sign in` while leaving authenticated Management navigation and authentication behavior unchanged.
- Refined account and organizer-status information hierarchy and strengthened the page-responsive ambient animation without introducing status pills or glowing circles. Reduced-motion users receive a static background.
- Final verification: 199/199 tests passed across 11 files; TypeScript build, Prisma validation, JavaScript syntax checks, local HTTP smoke checks, and `git diff --check` passed.

## 2026-10-09 — Milestone 5C: Vercel + Neon deployment adaptation

### Status

Implemented without deploying. YCEP remains one Express/EJS application and now has bounded Neon pooling, direct Prisma migration URL support, a migration-owned shared session table, Vercel-aware client addresses and secure-cookie proxy handling, database readiness, deliberate session cleanup, and production-safe canonical reference initialization.

### Scope

- Pinned Node 24, retained zero-configuration `src/server.ts`, and added no `vercel.json`.
- Added migration `20261009190000_vercel_neon_session_foundation` for PostgreSQL sessions and the two canonical semester records supported by the schema.
- Added an idempotent production command requiring explicit cycle dates; it populates four levels, two semesters, seven event categories, and the supplied 56-department catalogue with internal `YCEP-` codes while preserving later additions.
- Production uses pooled `DATABASE_URL`; Prisma CLI prefers `DIRECT_DATABASE_URL`. Preview environments must not receive production credentials.
- Production disables session DDL and pruning timers; `npm run sessions:prune` provides bounded cleanup. The existing scrutiny limiter remains per-instance and is explicitly not globally authoritative.
- Management bootstrap remains separate and no development users, organizers, events, audits, or credentials are copied.

## 2026-10-09 — Management username authentication and credential controls

### Status

Complete. Management authentication now uses a dedicated normalized username rather than an institutional-email assumption. The preserved single ADMIN can manage its username and password from a protected security page, while technical-owner recovery remains an explicit environment-backed CLI action.

### Implementation

- Added migration `20261009150000_management_username_auth` with display and unique normalized Management username columns plus a database CHECK requiring them only for ADMIN.
- Preserved the existing ADMIN row and all foreign-key relationships; local credentials are supplied only through ignored environment configuration and bcrypt-hashed storage.
- Updated Management login UI/logic, generic credential failures, navigation, dashboard identity, bootstrap/update behavior, and the minimum 8-character password policy.
- Added ADMIN-only, CSRF-protected username/password forms at `/admin/account`; both require the current password and write redacted audit events. Password changes invalidate previous ADMIN sessions and regenerate the current session.
- Added `npm run admin:reset-password`; no email recovery, OTP, security questions, or plaintext credential logging was introduced.
- Verification: 186/186 tests passed across 10 files; TypeScript build, Prisma validation, migration status, `git diff --check`, and the complete local login/events/account/logout smoke flow passed.

## 2026-10-09 — Profile maintenance and department catalogue suggestions

### Status

Complete. Members can maintain current profile details without changing immutable identity or trust records, and organizers can propose a missing department through an event draft for explicit Management approval.

### Scope

- Added CSRF-protected profile editing for full name, email, department, and level; matric number, yearly verification, and organizer authorization remain unchanged.
- Added optional, paired department name/code fields to event drafts through forward migration `20261009142000_event_department_suggestions`.
- A suggestion remains private and cannot alter the official catalogue before approval. Event approval creates/reuses the exact non-conflicting department and links the event to it in the same locked transaction; rejection creates nothing.
- Management review visibly identifies the proposed department, and approval audit metadata records what was accepted.
- Removed the redundant Management card badge and member-login cross-link from the Management sign-in panel.
- Corrected the organizer-status cycle and application-history card padding so headings and tables align consistently within their glass surfaces.
- Verification: 180/180 tests passed across 10 files; TypeScript build, Prisma validation, and `git diff --check` passed. The previously documented pg adapter deprecation warning remains non-failing.

## 2026-10-09 — V1 visual redesign and About page

### Status

Complete. The existing V1 interface received a presentation-only redesign with centered public storytelling, layered non-white ambient backgrounds, glass surfaces, pill controls, Apple-system typography, and subtle reduced-motion-safe animation. A public `/about` page now explains YCEP's purpose and trusted publishing loop.

### Scope and verification

- Updated the shared design system, public and authenticated navigation, public hero, cards, filters, forms, authentication surfaces, and responsive behavior without changing permissions or event lifecycle rules.
- Added the public About route/view, shared navigation links, footer link, and requested `cc daveolana` credit.
- Added a route regression test. No Prisma schema, migration, database data, dependency, authentication, authorization, or deployment change was made.
- Corrected the organizer current-cycle hierarchy and added CSRF-protected member profile editing for full name, email, department, and level. Matric identity remains immutable, and profile changes do not alter yearly verification or organizer authorization.
- Simplified the Management sign-in card by removing the redundant status badge and member-login cross-link.
- Added transactional reference/uniqueness validation plus integration coverage for valid updates, immutable identity, preserved verification, invalid references, and duplicate email.
- Verification at the time of the visual/profile pass: 178/178 tests passed across 10 files, TypeScript build passed, and `git diff --check` passed. The combined final total is recorded in the newer entry above.

## 2026-10-09 — Milestone 5A: Security Hardening and V1 Acceptance

### Status

Complete. Browser mutations now have session-backed CSRF protection, abuse-prone entry points are throttled, responses carry deliberate security headers, request parsing is bounded, and unexpected errors pass through a safe centralized boundary.

### Implementation

- Added Node-crypto synchronizer tokens, shared form integration, constant-time validation, safe HTML/JSON 403 responses, and real-token Supertest helpers.
- Added separate in-memory member-login (10/15m), Management-login (5/15m), and registration (5/hour) limiters.
- Added Helmet with a self-hosted script CSP, frame blocking, nosniff, referrer and permissions policies; HSTS and proxy trust remain deliberately disabled pending deployment topology.
- Made session cookie/path/rolling/pruning behavior explicit and strengthened production secret validation to 32 characters.
- Added 32 KB JSON/form limits, parameter limiting, terminal 404 handling, safe parser/500 responses, and redacted structured error metadata.
- Added login Zod schemas, generic duplicate-registration conflicts, and HTTPS-only newly entered poster URLs. Historical poster data was not rewritten.
- Added static CSRF, poster-fallback, and registration scripts. A narrow `style-src-attr 'unsafe-inline'` compatibility exception remains for legacy server-rendered style attributes; scripts do not allow unsafe-inline or unsafe-eval.

### Dependency assessment

- Added `helmet` and `express-rate-limit`; lockfile reviewed through install and audit output.
- Audit before remediation reported 13 advisories (3 critical, 6 high, 4 moderate), including production-path `proxy-addr`, `qs`, `brace-expansion`, and `fast-uri` findings.
- A bounded `npm audit fix` removed one package and updated six packages without a forced or major upgrade. Express resolved to 4.22.3, `proxy-addr` to 2.0.8, `qs` to 6.16.0, `brace-expansion` to 2.1.7, and `fast-uri` to 3.1.8.
- Audit after remediation reports 7 advisories (2 critical, 4 high, 1 moderate). Four high findings appear in `npm audit --omit=dev` through Prisma CLI/config's `deepmerge-ts` and unused MySQL driver path; the remaining Vitest/mocker/tinypool findings are development/test-only. npm offers only forced breaking downgrades/upgrades for these, so they are recorded as residual tooling risk.

### PostgreSQL warning

- Reproduced with `--trace-deprecation` during concurrent cancellation. The stack terminates in Prisma adapter `PgTransaction.performIO/queryRaw`; it did not identify an overlapping application query in that path.
- No speculative transaction/locking rewrite was made. Current concurrency tests pass; track the adapter warning before pg 9.

### Verification

- Full suite: 175/175 tests passed across 10 files, including 6 focused security tests.
- Build, Prisma validation/migration status, audit, and `git diff --check` recorded at final handoff.
- No Prisma schema or migration change; all 8 existing migrations remain intact.

### Deployment requirements

- Approve exact proxy topology before enabling proxy trust, validate Secure cookies behind that topology, select a shared limiter store for multiple instances, and approve production HSTS/domain coverage.

## 2026-10-09 — Milestone 4F: Final V1 UI Polish and Acceptance

### Status

Complete. YCEP's V1 surfaces now share a restrained, responsive design system across public discovery, organizer workflows, Management review, account, authorization, and authentication views.

### Implementation

- Refined reusable color, spacing, radius, elevation, control, badge, tab, empty-state, and responsive styles without introducing a UI framework.
- Reduced homepage hero depth, tightened discovery controls, added active-filter treatment, stabilized event-card content, and improved intentional no-poster artwork.
- Improved public event-detail reading proportions and preserved a restrained, prominent cancellation notice.
- Refined organizer event rows, lifecycle presentation, cancellation guidance, account information, and organizer authorization/history hierarchy.
- Unified member and Management authentication, polished 403/404 states, and retained lightweight navigation/footer shells.
- Added tablet and narrow-mobile adjustments, visible keyboard focus, 40–44px controls, semantic headings/labels, and reduced-motion support.

### Scope and data safety

- UI/UX changes only: no product rules, route or form contracts, service logic, Prisma schema, migrations, or development data changed.
- No demo accounts or events were created.

### Verification

- Full suite: 169/169 tests passed across 9 files; no behavioral tests required modification.
- TypeScript production build and `git diff --check` passed.
- Prisma reports all 8 existing migrations applied; no schema or migration file changed.
- Route and service modules are unchanged, preserving product behavior and contracts.

### Next recommended task

Perform the final manual browser acceptance review with representative organizer and Management accounts before deployment readiness work.

## 2026-10-09 — Milestone 4E: Event Management and History

### Status

Complete. Published events are immutable, date history is derived, organizers and Management have focused history views, and published events can be irreversibly cancelled with preserved public explanation and private audit history.

### Migration and data safety

- Preflight found zero `CANCELLED` rows in both `ycep_dev` and `ycep_test`; no backfill or fabricated metadata was needed.
- Added and applied forward migration `20261009081200_event_cancellation_history` to both databases.
- Added `cancelledAt`, `cancellationReason`, and `cancelledByUserId`, a restricted actor relation/index, and a PostgreSQL consistency constraint.
- No database reset or historical migration rewrite occurred.

### Implementation

- Added a cancellation validator, `EVENT_CANCELLED`, and row-locked organizer/Management cancellation services with actor revalidation and atomic audit writes.
- Added organizer All/Drafts/Pending/Published/Rejected/History views and derived Today/Upcoming/Past labels.
- Kept published/rejected/cancelled events view-only and `COMPLETED` unused.
- Kept the Management pending queue focused and added `/admin/events/history`.
- Public discovery remains `PUBLISHED`-only; direct cancelled details display the public cancellation reason without actor/internal data.

### Verification

- Focused lifecycle/public suites: 40/40 passed.
- Added coverage for ownership, invalid transitions, trust loss, Management withdrawal, queue/history separation, public behavior, audit writes, and concurrent organizer/Management cancellation.
- Full suite: 169/169 tests passed across 9 files.
- TypeScript build and `git diff --check` passed.

### Next recommended task

Run a manual visual review of organizer history, Management history, cancellation forms, and the public cancelled-event banner before starting another product milestone.

## 2026-10-09 — Milestone 4D: Public Search, Filtering, and Relevance

### Status

Complete. Anonymous visitors can search and filter upcoming published events through shareable GET parameters while general events remain discoverable under audience filters.

### Implementation

- Added a focused Zod public-query validator with normalization, singular-parameter enforcement, safe invalid-filter handling, and persisted-reference validation.
- Extended the public service with typed filters/options/results, a shared Prisma `where` condition for list and count, persisted reference options, relevance-only audience logic, Lagos calendar ranges, and accurate totals under the 24-card limit.
- Updated the public route to preserve URL state and distinguish malformed, unknown, active, and clean discovery states.
- Added a responsive semantic GET filter bar, refined result summary, validation notice, and distinct global/filtered empty states. Core filtering requires no JavaScript.
- Search covers title, description, venue, organizer public name, and category name. Ordering remains date, start time, then title.
- No schema change or migration was required.

### Verification

- Expanded `tests/public-events.test.ts` to cover search, normalization, validation, reference options, category, department/level relevance, combined AND semantics, date boundaries, counts, state persistence, and privacy regressions.
- Focused public suite: 15/15 passed.
- Full suite: 163/163 tests passed across 9 files.
- TypeScript build and `git diff --check` passed.

### Next recommended task

Do not begin another product milestone until Milestone 4D receives manual visual review on desktop and mobile.

## 2026-10-09 — Milestone 4C: Public Event Discovery

### Status

Complete. Visitors can browse upcoming Management-approved events without an account and open public detail pages for any published event, including past events by direct URL. Non-published and missing events share a generic 404.

### Implementation

- Added an explicit public-event projection service, public routes for `/` and `/events/:eventId`, Africa/Lagos-safe date handling, deterministic ordering, and a 24-event homepage cap.
- Added responsive flyer/poster cards, fallback artwork, an empty state, and a public detail view with category, schedule, venue, organizer identity, and recommended audience.
- Kept search, filters, recommendations, registration, participants, and attendance outside this milestone.
- No schema change or migration was required.

### Verification

- Added database-backed public visibility, ordering/cap, past-detail, generic-404, fallback, formatting, data-leakage, and protected-route regression tests in `tests/public-events.test.ts`.
- Full suite: 156/156 tests passed across 9 files.
- TypeScript build passed with zero errors; `git diff --check` passed.

### Next recommended task

Milestone 5: design and implement basic public search/filtering without allowing audience targeting to restrict visibility.

## 2026-10-09 — Legacy Milestone 4A Simplification Implemented

### Status

Complete. Registration-era event structures were removed through a new forward migration. Event drafts now implement only the D-049 Layer 1 publishing/discovery contract. Event submission and Management approval remain not started.

### Database preflight

- `ycep_dev`: 0 Events; 0 eligible-department rows; 0 eligible-level rows; 0 application questions; 0 deadlines; 0 limits; 0 non-empty eligibility instructions; no participation-mode groups; no event identities to report.
- `ycep_test`: 1 disposable Event using the default `OPEN_REGISTRATION` enum value; 0 legacy relation rows; 0 deadlines; 0 limits; 0 non-empty eligibility instructions.
- No meaningful development participation data was at risk.

### Migration

- Added and applied `20261009010424_simplify_layer1_events` to `ycep_test` first and then `ycep_dev` after tests passed.
- Dropped `ApplicationQuestion`, `EventEligibleDepartment`, and `EventEligibleLevel`.
- Dropped Event columns `participation_mode`, `registration_deadline`, `registration_limit`, and `eligibility_instructions`.
- Dropped PostgreSQL enum `ParticipationMode`.
- Preserved immutable migration `20260912140539_event_foundation_drafts` unchanged.
- Final migration status: both databases up to date with all 6 migrations.

### Implementation

- Simplified Prisma relations and regenerated Prisma Client.
- Reduced `eventDraftSchema` to Layer 1 event information, schedule/venue, and target audience.
- Removed participation normalization, eligibility validation/writes, questions, deadlines, and limits from the event service.
- Preserved transactional create/update, server-derived ownership/identity/status, DRAFT-only access, cross-cycle isolation, strict dates/times, HTTP/HTTPS poster URLs, and target-ID deduplication.
- Simplified organizer create/edit/detail/index views and removed registration-era controls and mode switching.
- Added clear discovery-only targeting guidance.

### Tests and verification

- Focused event-draft suite: 15/15 passed.
- Full Vitest suite: 144/144 passed across 8 files.
- TypeScript build: passed with 0 errors.
- Prisma validation: passed.
- `git diff --check`: run in final verification.

### Governance

- Added D-050 approving the removal.
- Updated `AGENTS.md`, `YCEP_V1_SPEC.md`, `TASKS.md`, and `README.md` to reflect the clean Layer 1 domain.
- Historical decisions and development-log entries remain preserved.

### Next recommended task

Milestone 5: event submission and YABATECH Management approval/rejection. Do not begin Layer 2 external registration work.

## 2026-10-09 — V1 Product Pivot Formalized (Documentation Only)

### Status

Approved product pivot recorded. No application code, Prisma schema, migration, test, or database state was changed.

### Why the scope changed

YCEP's highest-value problem is fragmented campus event discovery. The previous V1 combined trusted publishing with internal attendee registration, applications, participant management, notifications, and attendance. The approved simplification completes a clearer product first: trusted organizer → event draft → Management review → publication → public discovery.

### What remains valuable

- Member identity/yearly verification as the foundation for trusted organizers.
- Organizer application, review, authorization, revocation, and audit history.
- Dedicated Management identity and backend authorization.
- Authorization-bound event ownership and draft isolation.
- Categories, flyer/poster, title, description, schedule, venue, and organizer public identity.
- `EventTargetDepartment` and `EventTargetLevel` for filtering and relevance.
- Historical preservation, explicit transitions, transactional review, and audit rules.

### What moved outside primary V1

- Internal attendee registration/applications and answers.
- Participant/applicant management.
- Internal registration limits/deadline enforcement.
- Participant cancellation and registration history.
- Attendance, no-shows, QR attendance, and waitlists.
- Registration confirmation/reminder emails.

External registration links are deferred to Layer 2. The future direction may link to legitimate external services without synchronizing attendee state, but no such feature was implemented or designed here.

### Legacy Milestone 4A structures

`ParticipationMode`, `registrationDeadline`, `registrationLimit`, `eligibilityInstructions`, `EventEligibleDepartment`, `EventEligibleLevel`, and `ApplicationQuestion` remain in the schema and existing migration. They are legacy Milestone 4A structures pending deliberate simplification review. Migration history must never be rewritten; approved removal requires a new forward migration and data-impact review.

### Documentation changed

- `YCEP_V1_SPEC.md`: Simplified publishing/discovery specification.
- `DECISIONS.md`: D-049 pivot and explicit supersession record.
- `TASKS.md`: Layer 1 roadmap and deferred Layer 2.
- `README.md`: Updated product description and V1 success criteria.
- `DEVELOPMENT_LOG.md`: This historical pivot record.

### Next recommended task

Resume Layer 1 with event submission and Management approval/rejection. Conduct the legacy-structure simplification review deliberately without rewriting the Milestone 4A migration.

## 2026-09-13 — Independent Milestone 4A Engineering Audit

### Status

Audit complete. Milestone 4A remains within the frozen V1 architecture and scope. Six local defects were corrected without changing migrations or implementing Milestone 4B: draft detail/edit queries now exclude non-draft events; event validation rejects malformed limits, impossible dates, unsafe poster URL schemes, and duplicate relation IDs; registration deadlines now round-trip explicitly in West Africa Time; and production startup now requires an explicit session secret.

### Database and migration verification

- Existing `ycep-postgres` container was started without recreation, reset, or volume changes.
- Prisma schema validation passed.
- Both `ycep_dev` and `ycep_test` report all 5 migrations applied.
- Migration `20260912140539_event_foundation_drafts` has matching on-disk/database SHA-256 `33d7b0472c1039902283b28bb203a8851f52813a2326c22427c71ea08b9e6efd` in both databases.
- No business-schema drift exists. `ycep_test` additionally contains the expected `connect-pg-simple`-managed `public.session` table; `ycep_dev` did not contain it because no persisted development login session had initialized the store. No Prisma migration manipulates `session`.
- Development seed completed twice without duplicate reference rows: 4 levels, 1 CSC department, 1 named cycle, and 7 distinct seeded category codes.

### Tests and runtime verification

- Pre-fix baseline event suite: 22/22 passed.
- Post-fix focused suites: 45/45 passed (event drafts plus authentication/session).
- Full suite: 156/156 passed across 8 files.
- Final event suite after the WAT deadline correction: 27/27 passed.
- Final TypeScript build passed.
- Local HTTP smoke checks passed for `/`, `/health`, `/login`, and `/admin/login`; unauthenticated account, organizer, draft, and admin-queue routes redirected to the correct login surface.
- In-app browser control could not be initialized after two attempts because its local control bridge lacked required sandbox metadata. No further browser retries were made; authenticated page rendering remains covered by Supertest.

### Remaining recommendations

- Add explicit CSRF tokens for authenticated state-changing forms before V1 hardening.
- Add authentication rate limiting and deployment-aware reverse-proxy configuration before production.
- Revalidate organizer authorization/state inside the event write transaction to close narrow revocation/status-transition race windows before event lifecycle transitions expand.
- Remove or replace the production-visible `/account/protected-action` demonstration route when a real protected member action exists.
- Configure the next academic cycle before relying on the development seed after 2025/2026.
- Address the `pg` deprecation warning caused by overlapping query activity in the test/application session setup before upgrading to pg 9.

---

## 2026-09-12 — Milestone 4A: Event Foundation & Organizer Draft Creation

### Status

Complete. Milestone 4A establishes the core event draft lifecycle for authorized organizers. Events are strictly authorization-bound, cycle-scoped, and restricted to `DRAFT` status. Public event discovery, Management event approval, attendee registration/applications, notifications, attendance, and co-organizers are preserved outside this milestone. All 150 automated tests pass across all 8 test files, TypeScript build passes with 0 errors, and database migration status is clean and synchronized across both `ycep_dev` and `ycep_test`.

### Completed

- **Data Modeling & Migration:**
  - Added Prisma schema models in `prisma/schema.prisma`:
    - `Event`: Core event entity referencing `OrganizerAuthorization` via `primaryOrganizerAuthorizationId` with `onDelete: Restrict`. Captures server-side snapshot `organizerPublicName`. Omitted redundant `cycleId` (derived directly through authorization).
    - `EventCategory`: Categorical taxonomy seeded with 7 default campus categories.
    - `EventTargetDepartment`, `EventTargetLevel`: Independent junction tables for discovery and relevance targeting.
    - `EventEligibleDepartment`, `EventEligibleLevel`: Independent junction tables for registration eligibility constraints.
    - `ApplicationQuestion`: Ordered text application prompts (`orderIndex`, `questionText`) for `APPROVAL_REQUIRED` events (omits unapproved `isRequired` flag).
  - Enums: `EventStatus` (`DRAFT`, `PENDING_APPROVAL`, `PUBLISHED`, `COMPLETED`, `REJECTED`, `CANCELLED`), `ParticipationMode` (`NO_REGISTRATION`, `OPEN_REGISTRATION`, `APPROVAL_REQUIRED`).
  - Generated and executed migration `20260912140539_event_foundation_drafts` on both `ycep_dev` and `ycep_test`.
  - Configured idempotent development seed in `prisma/seed.ts` for default event categories.

- **Domain Validation & Service Layer:**
  - `src/validators/event.validator.ts`: Comprehensive Zod validation with superRefine rules:
    - Minimum/maximum length constraints on title, description, and venue.
    - Valid 24-hour time format (HH:mm) and strict rule that `endTime > startTime`.
    - Timezone-safe registration deadline parsing ensuring deadline is on or before event start date/time.
    - Positive registration limits (`> 0`, max 50,000).
    - Maximum 5 application questions for approval-required events.
  - `src/services/event.service.ts`:
    - Server-side participation mode normalizer (`normalizeParticipationFields`):
      - `NO_REGISTRATION`: `registrationDeadline = null`, `registrationLimit = null`, 0 questions.
      - `OPEN_REGISTRATION`: optional deadline/limit preserved, questions stripped (0 questions).
      - `APPROVAL_REQUIRED`: optional deadline/limit preserved, up to 5 ordered questions preserved.
    - Draft lifecycle operations (`createEventDraft`, `getOrganizerEventDrafts`, `getOrganizerEventDraftById`, `updateEventDraft`, `getEventFormData`).
    - Scoped draft access strictly to `req.organizerAuthorization.id`:
      - Primary authorization ID and snapshot public name derived exclusively server-side.
      - Another organizer receives 404.
      - Cross-cycle security: the same member re-approved in a later academic cycle receives a new `OrganizerAuthorization` and cannot view or edit draft events created under an earlier cycle's authorization.

- **Routing & Views:**
  - `src/routes/organizer-events.route.ts`:
    - `GET /organizer/events`: Lists drafts owned by the authenticated current-cycle authorization.
    - `GET /organizer/events/new`: Form to compose a new event draft with category, date/time, venue, participation mode, target audience, and eligibility selectors.
    - `POST /organizer/events`: Creates draft event and atomic junction records.
    - `GET /organizer/events/:id`: View draft details, target audience, eligibility, and configured application questions.
    - `GET /organizer/events/:id/edit`: Pre-populated edit form for existing drafts.
    - `POST /organizer/events/:id`: Updates draft event operational details, junctions, and questions.
    - Guarded with `organizerEventsRouter.use("/organizer/events", requireOrganizer)`.
  - Views:
    - `views/organizer/events/index.ejs`: Draft listing with status badges and creation CTAs.
    - `views/organizer/events/new.ejs`: Rich compose view with dynamic mode selector and question builder.
    - `views/organizer/events/edit.ejs`: Pre-populated edit interface.
    - `views/organizer/events/detail.ejs`: Detailed preview showing draft configuration, target audience, eligibility, and questions.
    - Integrated navigation links into `views/account.ejs` and `views/organizer/status.ejs`.

- **Scope Boundaries Preserved:**
  - `EventCoOrganizer` relation explicitly omitted.
  - Events remain in `DRAFT` status; no submission for approval, no public routes, no attendee registrations, no notifications, no attendance.

- **Automated Tests:**
  - Authored `tests/event-drafts.test.ts` covering 22 discrete scenarios:
    - Unauthenticated, non-organizer, revoked-organizer, and admin access denials.
    - Server-side authorization binding and public name snapshot.
    - Spoofed client identity/authorization field stripping.
    - Scoped access and cross-cycle authorization isolation (returns 404).
    - Participation mode normalization across all 3 modes.
    - Max 5 application questions validation.
    - Target audience vs. eligibility junction table independence and default unconstrained semantics.
    - Validation constraints (times, deadlines, limits, invalid categories).
    - Scope proof of omitted co-organizers and public route privacy.
  - Updated teardowns across `tests/admin.test.ts`, `tests/auth.test.ts`, `tests/identity.test.ts`, `tests/organizer.test.ts`, and `tests/registration.test.ts` to clean event tables in foreign key order.
  - Total test suite: 150 tests passing across all 8 files.

### Important files created/modified

- `prisma/schema.prisma` [MODIFIED]: Added `Event`, `EventCategory`, junctions, and `ApplicationQuestion`.
- `prisma/migrations/20260912140539_event_foundation_drafts/migration.sql` [NEW]: Milestone 4A migration.
- `prisma/seed.ts` [MODIFIED]: Default event category seed data.
- `src/validators/event.validator.ts` [NEW]: Event draft Zod schemas and validation refinements.
- `src/services/event.service.ts` [NEW]: Event draft service and participation mode normalizer.
- `src/routes/organizer-events.route.ts` [NEW]: Organizer event draft routes.
- `src/app.ts` [MODIFIED]: Mounted `organizerEventsRouter`.
- `views/organizer/events/index.ejs` [NEW]: Drafts list view.
- `views/organizer/events/new.ejs` [NEW]: Draft creation form.
- `views/organizer/events/edit.ejs` [NEW]: Draft edit form.
- `views/organizer/events/detail.ejs` [NEW]: Draft detail view.
- `views/account.ejs` [MODIFIED]: Added Event Drafts link.
- `views/organizer/status.ejs` [MODIFIED]: Added Event Drafts link.
- `tests/event-drafts.test.ts` [NEW]: 22 automated tests.
- `tests/admin.test.ts`, `tests/auth.test.ts`, `tests/identity.test.ts`, `tests/organizer.test.ts`, `tests/registration.test.ts` [MODIFIED]: Event table teardown maintenance.
- `TASKS.md` [MODIFIED]: Updated Milestone 4 checklist.
- `DECISIONS.md` [MODIFIED]: Recorded decisions D-044 through D-048.
- `DEVELOPMENT_LOG.md` [MODIFIED]: Recorded Milestone 4A entry.

### Test results

- Test runner: Vitest v3.2.7
- 8 test files, **150 tests passing (100% pass rate)**:
  - `tests/event-drafts.test.ts`: 22 tests passing
  - `tests/organizer.test.ts`: 32 tests passing
  - `tests/registration.test.ts`: 23 tests passing
  - `tests/identity.test.ts`: 27 tests passing
  - `tests/admin.test.ts`: 25 tests passing
  - `tests/auth.test.ts`: 17 tests passing
  - `tests/app.test.ts`: 3 tests passing
  - `tests/db.test.ts`: 1 test passing
- TypeScript compilation (`tsc`): 0 errors.
- Migration status: 5 migrations applied and verified on both `ycep_dev` and `ycep_test`.

### Unresolved issues

None.

### Recommended next task

**Milestone 5 — Event Approval Workflow**
- Implement draft submission by organizers (`status: PENDING_APPROVAL`).
- Build YABATECH Management admin approval/rejection queue with feedback reason.
- Enforce that operational changes preserve registrations while fundamental changes trigger reapproval.

---

## 2026-09-12 — Milestone 3: Stabilization Pass (UX, Form Semantics, UI Consistency, Responsive Admin)

### Status

Complete. Bounded stabilization pass successfully resolved all UX, form autofill, validation message, password behavior, UI consistency, responsive table, and copy accuracy issues without modifying core Milestone 3 business rules or database migrations. All 128 automated tests passing across all 7 test suites, TypeScript build passes with 0 errors, and Prisma migrations remain clean.

### Completed

- **Registration → Login Identity & Autofill (Root Cause & Fix):**
  - Root Cause: In `views/register.ejs`, `fullName` preceded the password input without `autocomplete="name"`, while `matricNumber` lacked `autocomplete="username"`. Browsers (Chrome/Edge) heuristically inferred `fullName` as the credential username for the saved password. On `/login`, `matricNumber` lacked `autocomplete="username"`, so the browser autofilled the saved name (`DaveOlana`) into the matric number field.
  - Fix: Configured `autocomplete="username"` and `autocapitalize="characters"` on the login matric number input, `autocomplete="name"` on registration full name, and `autocomplete="username"` on registration matric number. Verified that matric number remains the sole login identifier and that `fullName` is never passed or accepted into the matric login field. Added automated regression tests in `tests/registration.test.ts` and `tests/auth.test.ts`.

- **Registration Validation & Error State (Root Cause & Fix):**
  - Root Cause: In `src/validators/registration.validator.ts`, `z.string().trim().min(2, "Full name must be at least 2 characters")` evaluated an empty submission (`""`) to length 0 and produced the misleading error message `"Full name must be at least 2 characters"`. If an empty form was submitted and the server returned this 400 error, browser form restoration or autofill repopulated the user's name (`DaveOlana`) into the field client-side over the static server-rendered error message, creating a contradiction.
  - Fix: Added `.min(1, "Full name is required")` before `.min(2, "Full name must be at least 2 characters")`. Added client-side listener in `views/register.ejs` to dynamically clear error styling and error badges upon user editing. Added unit tests for empty vs short vs valid names.

- **Password Field Security & Autofill Semantics:**
  - Audited all password fields across member registration, member login, and admin login.
  - Confirmed all password inputs are `type="password"`.
  - Confirmed password values are never re-rendered after validation failures.
  - Applied explicit `autocomplete="new-password"` for registration and `autocomplete="current-password"` for login forms.
  - Verified passwords/hashes are never exposed in HTML, session state, logs, or redirects.

- **Form Autofill Semantics Audit:**
  - Standardized `name`, `id`, and `autocomplete` attributes across member registration, member login, admin login, and organizer application forms (`autocomplete="name"`, `autocomplete="username"`, `autocomplete="email"`, `autocomplete="tel"`, `autocomplete="organization"`, `autocomplete="organization-title"`).

- **UI Consistency Pass:**
  - Removed browser-default purple visited links (`a:visited` styled with emerald theme color).
  - Added visible, accessible `:focus-visible` focus rings (`outline: 2px solid var(--primary); outline-offset: 2px`).
  - Standardized buttons: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-sm`, and `.btn-block`.
  - Standardized status badges: `.badge-active`, `.badge-pending`, `.badge-rejected`, `.badge-revoked`, `.badge-expired`.

- **Admin Organizer Responsive & Usability Enhancements:**
  - Wrapped tables in responsive `.table-container` with horizontal overflow handling.
  - Added `.cell-wrap-clamp` with `max-width: 280px` to prevent long Management rejection notes from ballooning table rows.
  - Labeled revocation reason control with `<label class="sr-only">` and minimum 200px width.
  - Neutralized the review decision container background (`#f8fafc`) in `views/admin/organizers/detail.ejs` to avoid falsely framing rejection within a green positive container.

- **Copy Accuracy:**
  - Clarified Milestone 3 copy to eliminate false promises of unbuilt Milestone 4 functionality (updated text claiming approved organizers can already create/host/manage events to reflect eligibility to propose and coordinate events once event workflows open).

- **Automated Tests:**
  - Added 4 new tests in `tests/registration.test.ts` for semantic autocomplete attributes, empty fullName validation, short fullName validation, and valid names.
  - Updated `tests/auth.test.ts` to assert semantic autocomplete attributes on the login form.
  - Total test count increased from 124 to 128 tests, all passing.

### Important files modified

- `public/css/style.css`: Standardized links, focus rings, buttons, badges, table containers, cell clamping.
- `src/validators/registration.validator.ts`: Added required check before length check for `fullName`.
- `views/register.ejs`: Semantic autocomplete attributes and client-side error clearing on input.
- `views/login.ejs`: Semantic autocomplete (`username`, `current-password`), capitalization, spellcheck.
- `views/admin/login.ejs`: Autocomplete and button standardization.
- `views/organizer/apply.ejs`: Autocomplete attributes and copy adjustments.
- `views/organizer/status.ejs`: Responsive table container, note clamping, badge standardization, copy adjustments.
- `views/admin/organizers/index.ejs`: Responsive table container, note clamping, labeled revocation input, badge standardization.
- `views/admin/organizers/detail.ejs`: Neutral review container background, badge standardization, button standardization.
- `views/account.ejs`: Badge and button standardization, copy adjustments.
- `views/register-success.ejs`: Button styling.
- `views/index.ejs`: Button styling.
- `views/admin/dashboard.ejs`: Table containers, badge and button standardization.
- `tests/registration.test.ts`: Added tests for autocomplete attributes and validation messages.
- `tests/auth.test.ts`: Added tests for login autocomplete attributes.
- `tests/admin.test.ts`: Added tests for admin login autocomplete attributes.
- `DEVELOPMENT_LOG.md`: Added stabilization pass summary.

### Test results

- Test runner: Vitest v3.2.7
- 7 test files, **128 tests passing (100% pass rate)**:
  - `tests/organizer.test.ts`: 32 tests passing
  - `tests/registration.test.ts`: 23 tests passing (+4 new tests)
  - `tests/identity.test.ts`: 27 tests passing
  - `tests/admin.test.ts`: 25 tests passing
  - `tests/auth.test.ts`: 17 tests passing
  - `tests/app.test.ts`: 3 tests passing
  - `tests/db.test.ts`: 1 test passing
- TypeScript build (`tsc`): 0 errors.
- Prisma migration status: Up to date (4 migrations, 0 drift).

### Unresolved issues

None.

### Recommended next task

**Milestone 4 — Event Foundation**
- Define `Event`, `EventCategory`, `EventTargetDepartment`, `EventTargetLevel`, `EventEligibleDepartment`, `EventEligibleLevel`, and co-organizer models in `prisma/schema.prisma`.
- Ensure independent relational modeling for recommended target audience vs registration eligibility per `YCEP_V1_SPEC.md`.
- Implement draft event creation and editing for authorized organizers.
- Enforce that fundamental event changes return the event to a review state.

---



### Status

Complete. Implemented the Organizer Verification Foundation for YCEP according to the frozen specifications in `YCEP_V1_SPEC.md` and `AGENTS.md`. Established the dual-entity model separating `OrganizerApplication` from `OrganizerAuthorization`, enforced at most one pending application per member per cycle via a PostgreSQL partial unique index, derived current-cycle expiry, implemented transactional admin review with row-level locking (`SELECT ... FOR UPDATE`), added transactional audit logging, created the live `requireOrganizer` authorization guard, added member application and status views, added admin queue, detail review, and revocation workflows, and authored 32 automated organizer tests proving full contract compliance (124 total tests passing with 0 failures across the test suite).

### Completed

- **Database Schema & Relational Architecture (`prisma/schema.prisma`):**
  - Added enums `OrganizerApplicationStatus` (`PENDING`, `APPROVED`, `REJECTED`) and `OrganizerAuthorizationStatus` (`ACTIVE`, `REVOKED`, `EXPIRED`).
  - Added `OrganizerApplication` model storing full applicant responses (`requestedPublicName`, `phoneNumber`, `organizationName`, `positionTitle`, `reason`, `evidenceUrlOrText`) and admin review details (`reviewedAt`, `reviewedByAdminId`, `adminReviewNotes`). Public organizer identity (`requestedPublicName`) and represented organization (`organizationName`) are maintained as strictly separate concepts.
  - Added `OrganizerAuthorization` model representing the granted capability for the academic cycle with `approvedPublicName` copied directly from `requestedPublicName`, composite unique key `@@unique([userId, cycleId])`, and revocation fields (`revokedAt`, `revocationReason`).
  - Added relations on `User` and `AcademicYearCycle` with `onDelete: Restrict` to preserve historical integrity.

- **Migration with Custom Partial Unique Index (`prisma/migrations/20260911144215_organizer_verification_foundation/migration.sql`):**
  - Scaffolded migration and added custom PostgreSQL partial unique index:
    ```sql
    CREATE UNIQUE INDEX "OrganizerApplication_one_pending_per_cycle"
    ON "OrganizerApplication" ("user_id", "cycle_id")
    WHERE "status" = 'PENDING';
    ```
  - Applied migration to development database (`ycep_dev`) and test database (`ycep_test`).
  - Regenerated Prisma Client v7.10.0.

- **Audit Logging Subsystem (`src/services/audit.service.ts`):**
  - Extended `AUDIT_ACTIONS` with `ORGANIZER_APPLICATION_APPROVED`, `ORGANIZER_APPLICATION_REJECTED`, and `ORGANIZER_AUTHORIZATION_REVOKED`.
  - Transactional invariant enforced: All admin review and revocation mutations record audit logs within the same database transaction; audit failure triggers total transaction rollback.

- **Validation Schemas (`src/validators/organizer.validator.ts`):**
  - `organizerApplicationSchema`: Validates `requestedPublicName` (trimmed, 2–100 chars), `phoneNumber` (trimmed, 7–20 chars, regex `/^[0-9+\s\-()]+$/`), optional `organizationName` (trimmed, max 150 chars), optional `positionTitle` (trimmed, max 100 chars), `reason` (trimmed, 10–1000 chars), and optional `evidenceUrlOrText` (trimmed, max 1000 chars).
  - `adminRejectApplicationSchema`: Validates `adminReviewNotes` (required, trimmed, min 5, max 500 chars).
  - `adminRevokeAuthorizationSchema`: Validates `revocationReason` (required, trimmed, min 5, max 500 chars).

- **Organizer Domain Service (`src/services/organizer.service.ts`):**
  - Domain error classes: `OrganizerEligibilityError` (403), `OrganizerConflictError` (409), `OrganizerNotFoundError` (404), `OrganizerInvalidStateError` (400).
  - `submitOrganizerApplication`: Validates current cycle, active member verification, duplicate pending checks, and prevents application if an authorization already exists in that cycle.
  - `getMemberOrganizerStatus`: Retrieves current cycle, active authorization, and latest application history.
  - `getAdminPendingOrganizerApplications`: Lists pending applications ordered by submission date.
  - `getAdminOrganizerApplicationDetail`: Fetches full application and applicant academic history.
  - `approveOrganizerApplication`: Row-level locking via `SELECT ... FOR UPDATE` in interactive transaction; verifies current cycle currency and active applicant verification; creates `OrganizerAuthorization` copying `requestedPublicName` into `approvedPublicName`; writes `ORGANIZER_APPLICATION_APPROVED` audit log.
  - `rejectOrganizerApplication`: Row-level locking via `SELECT ... FOR UPDATE`; rejects pending application requiring feedback notes (min 5 chars); writes `ORGANIZER_APPLICATION_REJECTED` audit log.
  - `revokeOrganizerAuthorization`: Row-level locking via `SELECT ... FOR UPDATE`; updates status to `REVOKED` with timestamp and reason; preserves historical application record; writes `ORGANIZER_AUTHORIZATION_REVOKED` audit log.

- **Authorization Guard & Middleware (`src/middleware/auth.middleware.ts`):**
  - Extended `Express.Request` type with `organizerAuthorization?: OrganizerAuthorization`.
  - `requireOrganizer`: Checks live database state on every request; enforces active member verification in current cycle; strictly rejects ADMIN users (ADMIN is not an organizer); attaches authorization to request context.

- **Routes & Views:**
  - `src/routes/organizer.route.ts`: Member application flow (`GET /organizer/apply`, `POST /organizer/apply`, `GET /organizer/status`). No test-only endpoints exposed in production routes.
  - `src/routes/admin.route.ts`: Admin organizer review and revocation endpoints (`GET /admin/organizers`, `GET /admin/organizers/:applicationId`, `POST /admin/organizers/:applicationId/approve`, `POST /admin/organizers/:applicationId/reject`, `POST /admin/organizer-authorizations/:authorizationId/revoke`).
  - Server-rendered EJS templates:
    - `views/organizer/apply.ejs`: Application form with input guidance and validation error display for all frozen fields.
    - `views/organizer/status.ejs`: Comprehensive status dashboard showing active capability, pending applications, or past rejection feedback with reapply actions.
    - `views/admin/organizers/index.ejs`: Admin queue of pending applications.
    - `views/admin/organizers/detail.ejs`: Application review page with applicant academic profile, requested public name vs organization separation, and inline approve/reject modal forms.
  - Navigation updates: Added Organizer links to `views/account.ejs` and `views/admin/dashboard.ejs`.
  - App integration: Mounted `organizerRouter` in `src/app.ts`.

- **Automated Tests (`tests/organizer.test.ts`):**
  - 32 automated tests covering:
    1. ADMIN account cannot apply for organizer capability.
    2. Member with inactive or expired verification cannot apply (403).
    3. Active current-cycle member applies successfully.
    4. Duplicate PENDING application in same cycle is rejected (409).
    5. REJECTED application permits submitting a fresh application in the same cycle while preserving history.
    6. ACTIVE authorization blocks submitting another application in that cycle.
    7. REVOKED authorization blocks reapplication in that cycle.
    8. Phone number format validation.
    9. Admin approves PENDING application and creates ACTIVE authorization copying `requestedPublicName` into `approvedPublicName`.
    10. Admin rejects PENDING application with feedback notes without creating authorization.
    11. Duplicate approval fails safely.
    12. Rejecting an already approved application fails.
    13. Stale application from prior cycle cannot be reviewed or approved.
    14. Member whose verification expires/deactivates after applying cannot be approved.
    15. Concurrent review race conditions (approve vs reject) handled safely via row-level locks.
    16. Admin revokes ACTIVE authorization with reason while preserving original application.
    17. Revocation requires reason of at least 5 characters.
    18. `requireOrganizer` accepts valid active organizer.
    19. `requireOrganizer` rejects member without organizer authorization (403).
    20. `requireOrganizer` rejects organizer whose yearly verification has expired or changed.
    21. `requireOrganizer` rejects ADMIN accounts.
    22. Unauthenticated requests to organizer routes redirect to `/login`.
    23. Simulated audit log failure inside approval transaction safely rolls back state mutations.
    24. Status view renders application history and reapply button when rejected.
    25. Admin queue displays pending applications.
    26. Requested public name stored separately from represented organization.
    27. Application with no organization permitted (`organizationName === null`).
    28. Approval copies `requestedPublicName` to `approvedPublicName`.
    29. Statement of reason length enforced (min 10 chars).
    30. Supporting evidence URL or text stored correctly.
    31. Admin rejection requires feedback notes (min 5 chars).
    32. Production router does not expose `GET /organizer/test-protected` (returns 404).
  - Updated teardowns in `tests/admin.test.ts`, `tests/auth.test.ts`, `tests/identity.test.ts`, and `tests/registration.test.ts` to cleanly remove authorizations and applications in foreign key order.

- **Governance & Specification Updates:**
  - `DECISIONS.md`: Added decisions D-040 to D-043.
  - `YCEP_V1_SPEC.md`: Updated Section 6 with frozen application and authorization contract.
  - `TASKS.md`: Verified Milestone 3 checklist.

### Important files created/modified

- `prisma/schema.prisma` [MODIFIED]: Added `OrganizerApplication`, `OrganizerAuthorization`, and corresponding enums.
- `prisma/migrations/20260911144215_organizer_verification_foundation/migration.sql` [NEW]: Migration with partial unique index for pending applications.
- `src/validators/organizer.validator.ts` [NEW]: Zod validation schemas.
- `src/services/organizer.service.ts` [NEW]: Transactional organizer domain service.
- `src/services/audit.service.ts` [MODIFIED]: Added organizer audit action constants.
- `src/middleware/auth.middleware.ts` [MODIFIED]: Added `requireOrganizer` guard and updated `Express.Request` typing.
- `src/routes/organizer.route.ts` [NEW]: Member organizer routes.
- `src/routes/admin.route.ts` [MODIFIED]: Admin organizer review and revocation endpoints.
- `src/app.ts` [MODIFIED]: Mounted `organizerRouter`.
- `views/organizer/apply.ejs` [NEW]: Application form view.
- `views/organizer/status.ejs` [NEW]: Status and history view.
- `views/admin/organizers/index.ejs` [NEW]: Admin pending queue view.
- `views/admin/organizers/detail.ejs` [NEW]: Admin review detail view.
- `views/account.ejs` [MODIFIED]: Added Organizer link.
- `views/admin/dashboard.ejs` [MODIFIED]: Added Organizer Applications link.
- `tests/organizer.test.ts` [NEW]: 32 comprehensive automated tests.
- `tests/admin.test.ts`, `tests/auth.test.ts`, `tests/identity.test.ts`, `tests/registration.test.ts` [MODIFIED]: Updated table cleanup teardown order.
- `DECISIONS.md` [MODIFIED]: Added decisions D-040 to D-043.
- `YCEP_V1_SPEC.md` [MODIFIED]: Updated Section 6.
- `TASKS.md` [MODIFIED]: Marked Milestones 0–3 as completed.
- `DEVELOPMENT_LOG.md` [MODIFIED]: Added Milestone 3 log entry.

### Test results

- Test runner: Vitest v3.2.7
- 7 test files, **124 tests passing (100% pass rate)**:
  - `tests/organizer.test.ts`: 32 tests passing
  - `tests/registration.test.ts`: 19 tests passing
  - `tests/identity.test.ts`: 27 tests passing
  - `tests/admin.test.ts`: 25 tests passing
  - `tests/auth.test.ts`: 17 tests passing
  - `tests/app.test.ts`: 3 tests passing
  - `tests/db.test.ts`: 1 test passing
- TypeScript compilation (`tsc`): 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 4 — Event Foundation**
- Define `Event`, `EventCategory`, `EventTargetDepartment`, `EventTargetLevel`, `EventEligibleDepartment`, `EventEligibleLevel`, and co-organizer models in `prisma/schema.prisma`.
- Ensure independent relational modeling for recommended target audience vs registration eligibility per `YCEP_V1_SPEC.md`.
- Implement draft event creation and editing for authorized organizers.
- Enforce that fundamental event changes return the event to a review state.

---

## 2026-09-11 — Milestone 2: YABATECH Management Admin Foundation & Audit Logging

### Status

Complete. Established the administrative foundation for YABATECH Management. Implemented the single-admin database constraint, admin null academic identity CHECK constraint, idempotent bootstrap script with security validation, dedicated email-based admin authentication and session management, requireAdmin authorization middleware, an immutable append-only audit logging subsystem with defensive metadata sanitization, a minimal admin foundation dashboard, and 25 new automated tests (92 total tests passing).

### Completed

- **Database Schema & Constraints (`prisma/schema.prisma`, `prisma/migrations/20260911011313_admin_foundation_and_audit/migration.sql`):**
  - Added `AuditLog` model with foreign key relation to `User` (`onDelete: Restrict` ensures admin history is never cascade-deleted).
  - Scaffolded migration with `--create-only` and manually enriched with custom PostgreSQL invariants:
    - Single ADMIN constraint: `CREATE UNIQUE INDEX "User_one_admin" ON "User" ("role") WHERE "role" = 'ADMIN';`
    - ADMIN null academic identity constraint:
      `ALTER TABLE "User" ADD CONSTRAINT "User_admin_no_academic_identity_check" CHECK ("role" != 'ADMIN' OR ("matric_number" IS NULL AND "department_id" IS NULL AND "level_id" IS NULL));`
  - Successfully applied migration to both `ycep_dev` and `ycep_test`.
  - Regenerated Prisma Client v7.10.0.

- **Admin Bootstrap Script (`scripts/bootstrap-admin.ts`):**
  - Added CLI script runnable via `npm run admin:bootstrap`.
  - Added configuration placeholders in `.env.example` (`YCEP_ADMIN_NAME`, `YCEP_ADMIN_EMAIL`, `YCEP_ADMIN_PASSWORD`).
  - Validates environment/options with Zod (name, valid email, minimum 12-character password).
  - Explicitly rejects unchanged placeholder/default passwords.
  - Idempotent: If an ADMIN with matching email exists, exits safely without altering or resetting the password.
  - Conflict detection: If an ADMIN exists with a different email, fails with a clear conflict error.
  - Guarded execution ensures importing `bootstrapAdmin` in test suites does not run CLI commands.

- **Audit Logging Subsystem (`src/services/audit.service.ts`):**
  - Centralized action constants (`AUDIT_ACTIONS.ADMIN_LOGIN`, `AUDIT_ACTIONS.ADMIN_LOGOUT`).
  - Defensive metadata sanitizer recursively strips sensitive keys (`password`, `passwordHash`, `session`, `cookie`, `token`, `secret`, `authorization`).
  - Append-only service methods: `createAuditLog` (supports optional `tx` client for transactional mutations) and `getRecentAuditLogs`.
  - No update or delete methods exposed.

- **Admin Authentication & Authorization (`src/routes/admin.route.ts`, `src/middleware/auth.middleware.ts`):**
  - `GET /admin/login`: Renders dedicated sign-in portal; redirects already-authenticated admins to `/admin`.
  - `POST /admin/login`: Authenticates dedicated ADMIN using email + password. Rejects unknown emails, bad passwords, and `MEMBER` accounts with identical generic message: `"Invalid email or password."`.
  - Session fixation protection: regenerates session upon login.
  - Atomic session safety: if audit log creation fails during login, session is destroyed and cookie cleared.
  - `POST /admin/logout`: Guarded by `requireAdmin` (members cannot trigger admin audit records). Writes `ADMIN_LOGOUT` audit log and destroys session; session destruction guaranteed even if audit logging fails.
  - `requireAdmin`: Checks live database role (`role === 'ADMIN'`), never trusting browser input or session cache. Redirects unauthenticated requests to `/admin/login` and rejects members with 403 Forbidden.
  - Boundary: `/account` preserves member area by redirecting authenticated `ADMIN` users to `/admin`.

- **Admin Views & UI (`views/admin/login.ejs`, `views/admin/dashboard.ejs`):**
  - `views/admin/login.ejs`: Clean admin sign-in form with clear error presentation (free of unsubstantiated CSRF claims).
  - `views/admin/dashboard.ejs`: Minimal foundation dashboard showing administrator identity, system status (database connected, active cycle), and recent audit log table.
  - Mounted `adminRouter` in `src/app.ts`.

- **Automated Tests (`tests/admin.test.ts`):**
  - Added 25 comprehensive tests covering schema constraints, bootstrap, login, logout, authorization, session destruction safety, and metadata sanitization.
  - Updated `beforeEach` in `tests/auth.test.ts`, `tests/identity.test.ts`, and `tests/registration.test.ts` to clean `AuditLog` records before `User` records.
  - All 92 tests passing across all 6 test suites with 0 failures.

- **Documentation Updates:**
  - `DECISIONS.md`: Added decisions D-036 through D-039.
  - `YCEP_V1_SPEC.md`: Updated Section 5.1 and Section 5.6 to formally record the single admin model, dual CHECK constraints, bootstrap requirements, and audit logging specification.

### Important files created/modified

- `prisma/schema.prisma` [MODIFIED]: Added `AuditLog` model and `auditLogs` relation on `User`.
- `prisma/migrations/20260911011313_admin_foundation_and_audit/migration.sql` [NEW]: Migration adding `AuditLog`, `User_one_admin` partial unique index, and `User_admin_no_academic_identity_check`.
- `.env.example` [MODIFIED]: Added `YCEP_ADMIN_*` placeholders.
- `package.json` [MODIFIED]: Added `admin:bootstrap` script.
- `scripts/bootstrap-admin.ts` [NEW]: Admin bootstrap script with Zod validation, placeholder rejection, and CLI execution guard.
- `src/services/audit.service.ts` [NEW]: Append-only audit service with defensive metadata sanitizer.
- `src/middleware/auth.middleware.ts` [MODIFIED]: Implemented `requireAdmin` authorization middleware.
- `src/routes/admin.route.ts` [NEW]: Admin routes (`/admin/login`, `/admin/logout`, `/admin`).
- `src/routes/auth.route.ts` [MODIFIED]: Redirected `ADMIN` accessing `/account` to `/admin`.
- `src/app.ts` [MODIFIED]: Mounted `adminRouter`.
- `views/admin/login.ejs` [NEW]: Admin sign-in template.
- `views/admin/dashboard.ejs` [NEW]: Minimal admin dashboard template.
- `tests/admin.test.ts` [NEW]: 25 comprehensive automated tests for Milestone 2.
- `tests/auth.test.ts` [MODIFIED]: Updated cleanup and admin test for null academic fields.
- `tests/identity.test.ts` [MODIFIED]: Added audit log cleanup.
- `tests/registration.test.ts` [MODIFIED]: Added audit log cleanup.
- `DECISIONS.md` [MODIFIED]: Added D-036 to D-039.
- `YCEP_V1_SPEC.md` [MODIFIED]: Updated Sections 5.1 and 5.6.
- `DEVELOPMENT_LOG.md` [MODIFIED]: Added Milestone 2 entry.

### Test results

- Test runner: Vitest v3.2.7
- 6 test suites, **92 tests passing (100% pass rate)**:
  - `tests/admin.test.ts`: 25 passed
  - `tests/auth.test.ts`: 17 passed
  - `tests/registration.test.ts`: 19 passed
  - `tests/identity.test.ts`: 27 passed
  - `tests/db.test.ts`: 1 passed
  - `tests/app.test.ts`: 3 passed
- Prisma validate: Schema validated successfully.
- TypeScript build (`tsc`): 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 3 — Organizer Verification Foundation**
- Implement organizer application domain model (`OrganizerApplication`) and application statuses (`PENDING`, `APPROVED`, `REJECTED`).
- Implement organizer application submission flow (`GET /organizer/apply`, `POST /organizer/apply`) guarded by `requireActiveVerification`.
- Implement admin review interface and approval/rejection endpoints on the admin dashboard.
- Enforce transactional audit logging for organizer application status transitions.
- Write automated tests for organizer verification workflows.

---

## 2026-09-11 — Milestone 1D: Admin-Compatible Identity Model

### Status

Complete. Successfully updated the identity schema and database to support the dedicated YABATECH Management ADMIN account without requiring fake academic data, while preserving mandatory academic identity fields for MEMBER users at both the database level (PostgreSQL CHECK constraint) and application level (Zod validation).

### Completed

- **Prisma Schema Update (`prisma/schema.prisma`):**
  - Updated `User` model: `matricNumber`, `departmentId`, `department`, `levelId`, and `level` are now nullable (`String?` / `Department?` / `Level?`).
  - Preserved required and unique `email`, required `fullName`, required `passwordHash`, and enum `role` (`MEMBER` | `ADMIN`).
  - Preserved unique constraint on `matricNumber`.

- **Database Migration (`prisma/migrations/20260911002631_admin_compatible_identity/migration.sql`):**
  - Made `matric_number`, `department_id`, and `level_id` nullable on `User`.
  - Added PostgreSQL CHECK constraint `User_member_academic_identity_check`:
    ```sql
    ALTER TABLE "User" ADD CONSTRAINT "User_member_academic_identity_check"
      CHECK ("role" != 'MEMBER' OR ("matric_number" IS NOT NULL AND "department_id" IS NOT NULL AND "level_id" IS NOT NULL));
    ```
  - Successfully executed migration against `ycep_dev` and `ycep_test`.

- **Application Typings & Invariants (`src/middleware/auth.middleware.ts`):**
  - Updated `SafeUser` type definition to reflect optional relations `department?: Department | null; level?: Level | null;`.
  - Preserved all existing member-registration Zod validation in `src/routes/registration.route.ts` requiring `matricNumber`, `departmentId`, and `levelId`.
  - Preserved member login in `src/routes/auth.route.ts` (`GET /login`, `POST /login`) requiring matric number and password (did not weaken or change to email-or-matric).
  - Preserved `requireActiveVerification` admin exemption (ADMIN users do not require `MemberVerification`).

- **Automated Tests:**
  - `tests/identity.test.ts`: Added 6 new database-level constraint tests:
    1. Valid `MEMBER` with all required academic fields can be created.
    2. Database rejects `MEMBER` missing `matricNumber` with CHECK constraint violation.
    3. Database rejects `MEMBER` missing `departmentId` with CHECK constraint violation.
    4. Database rejects `MEMBER` missing `levelId` with CHECK constraint violation.
    5. `ADMIN` can be created with null `matricNumber`, `departmentId`, and `levelId`.
    6. `ADMIN` does not require `MemberVerification`.
  - `tests/registration.test.ts`: Added 3 tests proving member registration still strictly requires `matricNumber`, `departmentId`, and `levelId`.
  - All existing authentication, registration, identity, database, and app test suites remain 100% passing.

- **Documentation Updates:**
  - `DECISIONS.md`: Added D-035 detailing role-differentiated academic fields and the database CHECK constraint.
  - `YCEP_V1_SPEC.md`: Updated Section 5.1 and Section 5.6 to record role differentiation, database CHECK constraint, admin verification exemption, and Milestone 2 email auth for the admin account.

### Important files created/modified

- `prisma/schema.prisma` [MODIFIED]: Nullable `matricNumber`, `departmentId`, `levelId`.
- `prisma/migrations/20260911002631_admin_compatible_identity/migration.sql` [NEW]: Migration altering columns and adding CHECK constraint.
- `src/middleware/auth.middleware.ts` [MODIFIED]: Updated `SafeUser` type for nullable relations.
- `tests/identity.test.ts` [MODIFIED]: Added 6 tests for academic identity CHECK constraint and ADMIN account creation.
- `tests/registration.test.ts` [MODIFIED]: Added 3 tests verifying mandatory academic fields in member registration.
- `DECISIONS.md` [MODIFIED]: Added D-035.
- `YCEP_V1_SPEC.md` [MODIFIED]: Updated Section 5.1 and 5.6.
- `DEVELOPMENT_LOG.md` [MODIFIED]: Added Milestone 1D entry.

### Test results

- Test runner: Vitest v3.2.7
- 5 test suites, **67 tests passing (100% pass rate)**:
  - `tests/auth.test.ts`: 17 tests passing
  - `tests/registration.test.ts`: 19 tests passing (16 baseline + 3 mandatory field tests)
  - `tests/identity.test.ts`: 27 tests passing (21 baseline + 6 identity constraint tests)
  - `tests/app.test.ts`: 3 tests passing
  - `tests/db.test.ts`: 1 test passing
- Prisma validate: Environment and schema validated successfully.
- TypeScript build (`tsc`): 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 2 — YABATECH Management Admin Foundation & Audit Logging**
- Create dedicated YABATECH Management ADMIN account seeding/initialization.
- Implement admin authorization guard (`requireAdmin`).
- Implement admin login (`GET /admin/login`, `POST /admin/login`) with email + password.
- Implement admin dashboard foundation (`GET /admin`).
- Implement basic audit logging for sensitive admin actions.
- Write automated tests for admin permissions and audit logging.

---

## 2026-09-10 — Milestone 1C: Login, Session Authentication & Active-Verification Guards

### Status

Complete. PostgreSQL-backed session authentication with express-session and connect-pg-simple, secure cookie sessions, matric-based bcrypt login, session fixation protection, requireAuth and requireActiveVerification middleware guards, and account profile view are fully implemented and verified.

### Completed

- **Session Infrastructure (`src/session.ts`):**
  - Configured `express-session` with `connect-pg-simple` backed by PostgreSQL (`session` table).
  - Session cookie configuration: `httpOnly: true`, `sameSite: "lax"`, `secure: process.env.NODE_ENV === "production"`, `name: "ycep.sid"`.
  - Added helper `ensureSessionTable()` to guarantee the PostgreSQL session table exists across environments.
  - Added `SESSION_SECRET` placeholder to `.env.example` (never commits real secrets).

- **Authentication Routes & Controller (`src/routes/auth.route.ts`):**
  - `GET /login`: Renders clean sign-in form; redirects already-authenticated sessions to `/account`.
  - `POST /login`:
    - Normalizes matric number before lookup using existing utility (`normalizeMatricNumber`).
    - Authenticates password using bcrypt comparison against `user.passwordHash`.
    - Returns generic error message ("Invalid matric number or password.") regardless of whether the matric number or password failed.
    - Preserves core YCEP invariant: expired yearly verification does NOT prevent login.
    - Regenerates session (`req.session.regenerate`) upon successful authentication to prevent session fixation attacks.
    - Stores only the minimal identity reference (`req.session.userId`), never caching roles, verification states, or passwords in the session.
  - `POST /logout`: Destroys server-side session and clears `ycep.sid` cookie.
  - `GET /account`: Minimal authenticated profile page requiring `requireAuth` (accessible to expired members). Displays full name, matric number, email, role, department, level, and current academic cycle verification status.
  - `GET /account/protected-action`: Minimal demonstration and test route guarded by both `requireAuth` and `requireActiveVerification`.

- **Middleware Guards (`src/middleware/auth.middleware.ts`):**
  - `requireAuth`:
    - Validates active session and resolves `req.user` (excluding `passwordHash`).
    - Redirects HTML requests to `/login`; responds with 401 Unauthorized for API/JSON requests.
  - `requireActiveVerification`:
    - Validates that normal members have an `ACTIVE` `MemberVerification` belonging specifically to the current `AcademicYearCycle`.
    - Active verifications from prior/expired cycles or non-current cycles do NOT satisfy the guard.
    - YABATECH Management `ADMIN` accounts are exempt from yearly member-verification expiry under the frozen spec.
    - Fails safely with 503 Service Unavailable if no active academic cycle is configured.

- **Views & UI (`views/login.ejs`, `views/account.ejs`, `views/protected-action.ejs`):**
  - `views/login.ejs`: Server-rendered sign-in template with generic error alert.
  - `views/account.ejs`: Account overview showing user identity and yearly verification status badge.
  - `views/protected-action.ejs`: Confirmation view for actions requiring active yearly status.
  - Updated homepage (`views/index.ejs`) with quick link to Sign In.

- **Automated Tests (`tests/auth.test.ts`):**
  - Added 17 comprehensive tests covering:
    1. Login page rendering.
    2. Valid matric/password login.
    3. Matric normalization during login.
    4. Incorrect password rejection with generic message.
    5. Unknown matric rejection with the same generic message.
    6. PostgreSQL session creation and persistence.
    7. Unauthenticated access blocked from `/account` (redirect for HTML, 401 for JSON).
    8. Authenticated access allowed to `/account`.
    9. Logout invalidation of server-side session and cookie.
    10. Expired member allowed to authenticate and log in.
    11. Expired member allowed to access `/account`.
    12. Expired member blocked by `requireActiveVerification` (403).
    13. Active current-cycle member passes `requireActiveVerification` (200).
    14. Active verification from an old cycle rejected by `requireActiveVerification`.
    15. Missing current cycle fails safely with 503.
    16. ADMIN account exempt from annual member verification expiry.
    17. Passwords and password hashes never stored in session or rendered.

### Important files created/modified

- `src/session.ts` [NEW]: Express session and PostgreSQL store setup.
- `src/middleware/auth.middleware.ts` [NEW]: `requireAuth` and `requireActiveVerification` guards.
- `src/routes/auth.route.ts` [NEW]: Auth routes (`/login`, `/logout`, `/account`, `/account/protected-action`).
- `views/login.ejs` [NEW]: Login page template.
- `views/account.ejs` [NEW]: Account profile template.
- `views/protected-action.ejs` [NEW]: Active verification demonstration view.
- `src/app.ts` [MODIFIED]: Mounted session middleware and `authRouter`.
- `views/index.ejs` [MODIFIED]: Added Sign In link.
- `.env.example` [MODIFIED]: Added `SESSION_SECRET` placeholder.
- `package.json` [MODIFIED]: Added `express-session`, `connect-pg-simple`, and typings.
- `tests/auth.test.ts` [NEW]: 17 automated tests for authentication and guards.

### Test results

- Test runner: Vitest v3.2.7
- 5 test files, **58 tests passing (100% pass rate)**:
  - `tests/auth.test.ts`: 17 tests (login, logout, session storage, requireAuth, requireActiveVerification)
  - `tests/registration.test.ts`: 16 tests (registration, normalization, transaction atomicity, UI)
  - `tests/identity.test.ts`: 21 tests (identity schema constraints, partial unique index)
  - `tests/app.test.ts`: 3 tests (health check, home, 404 handler)
  - `tests/db.test.ts`: 1 test (PostgreSQL connectivity)
- TypeScript build (`tsc`): Successful with 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 2 — YABATECH Management Admin Foundation & Audit Logging**
- Create dedicated YABATECH Management ADMIN account seeding/initialization.
- Implement admin authorization guard (`requireAdmin`).
- Implement admin dashboard foundation (`GET /admin`).
- Implement basic audit logging for sensitive admin actions.
- Write automated tests for admin permissions and audit logging.

---

## 2026-09-10 — Milestone 1B: Member Registration & Automatic Current-Cycle Verification

### Status

Complete. Member registration with Zod validation, matric number normalization, atomic User + MemberVerification creation, EJS views, and comprehensive tests are fully implemented and verified.

### Completed

- **Matric Number Normalization & Validation (`src/utils/matric.ts`):**
  - Normalization rule: trims whitespace, converts to uppercase, removes whitespace surrounding slashes (`\s*/\s*` -> `/`).
  - Validation pattern: `^[A-Z]{1,4}/[A-Z]{2,4}/\d{2}/\d{7}$` (frozen rule).
  - Handles variations like `  f / nd / 24 / 3210051  ` -> `F/ND/24/3210051`.

- **Zod Validation Schema (`src/validators/registration.validator.ts`):**
  - `fullName`: string, min 2, max 150 chars.
  - `matricNumber`: transformed via `normalizeMatricNumber`, validated against regex.
  - `email`: lowercased, trimmed, valid email format.
  - `departmentId`: UUID string.
  - `levelId`: UUID string.
  - `password`: min 8 characters (sensible V1 security baseline).
  - `passwordConfirmation`: matched against `password`.

- **Atomic Registration Service (`src/services/registration.service.ts`):**
  - Atomic transaction via `prisma.$transaction`.
  - Confirms exactly one current `AcademicYearCycle` (`isCurrent = true`); fails safely with `CycleConfigurationError` (503) if missing or misconfigured.
  - Verifies department and level existence.
  - Enforces duplicate prevention for email and normalized matric number with clear domain errors (`DuplicateConflictError`).
  - Hashes passwords using bcrypt with 10 salt rounds (never stored plaintext).
  - Atomically creates the `User` with role `MEMBER` and `MemberVerification` with status `ACTIVE` for the current cycle.
  - Complete rollback if any part fails.

- **Web Routes & UI (`src/routes/registration.route.ts`, `views/register.ejs`, `views/register-success.ejs`):**
  - `GET /register`: fetches active departments and levels, renders clean registration form.
  - `POST /register`: handles form submissions with support for both HTML form POST and JSON API requests.
  - Controlled user-facing error reporting; avoids exposing raw database or Prisma exceptions.
  - `views/register.ejs`: server-rendered EJS form with field error badges and guidance text.
  - `views/register-success.ejs`: registration success feedback with confirmed active verification for the current academic cycle.
  - `views/error.ejs`: user-friendly application error template.
  - Homepage (`views/index.ejs`) and stylesheet (`public/css/style.css`) updated with clean form controls.

- **Automated Tests (`tests/registration.test.ts`):**
  - 16 comprehensive tests proving:
    1. Valid registration succeeds and creates ACTIVE verification.
    2. Matric number normalization works.
    3. Malformed matric number is rejected.
    4. Duplicate matric number is rejected.
    5. Duplicate email is rejected.
    6. Invalid department is rejected.
    7. Invalid level is rejected.
    8. Password mismatch is rejected.
    9. Password shorter than 8 characters is rejected.
    10. Password is stored securely hashed with bcrypt, never plaintext.
    11. Successful registration automatically creates ACTIVE verification for the current cycle.
    12. Registration transaction rolls back if verification creation fails.
    13. Registration fails safely if there is no current academic cycle.
    14. GET /register renders registration page with 200 OK and populated options.
  - `vitest.config.ts`: configured with `fileParallelism: false` to ensure test database operations run deterministically without race conditions across test files.

### Important files created/modified

- `src/utils/matric.ts` [NEW]: Matric normalization and validation utility.
- `src/validators/registration.validator.ts` [NEW]: Zod schema for member registration.
- `src/services/registration.service.ts` [NEW]: Transactional registration service and domain error classes.
- `src/routes/registration.route.ts` [NEW]: `GET /register` and `POST /register` route handlers.
- `views/register.ejs` [NEW]: Registration form EJS view.
- `views/register-success.ejs` [NEW]: Registration success page EJS view.
- `views/error.ejs` [NEW]: Application error EJS view.
- `src/db.ts` [MODIFIED]: Added support for `TEST_DATABASE_URL` in `test` environment.
- `src/app.ts` [MODIFIED]: Mounted `registrationRouter`.
- `public/css/style.css` [MODIFIED]: Added minimal styling for form elements, alerts, and buttons.
- `views/index.ejs` [MODIFIED]: Added link to `/register`.
- `package.json` [MODIFIED]: Added `bcrypt`, `@types/bcrypt`, `prisma:validate`, `prisma:generate`.
- `vitest.config.ts` [MODIFIED]: Set `fileParallelism: false` and timeouts for serial database testing.
- `tests/registration.test.ts` [NEW]: 16 automated tests for registration and verification.

### Test results

- Test runner: Vitest v3.2.7
- 4 test files, 41 tests passing (100% pass rate):
  - `tests/identity.test.ts`: 21 tests (identity model schema constraints)
  - `tests/registration.test.ts`: 16 tests (registration, validation, transactions, UI)
  - `tests/app.test.ts`: 3 tests (health check, home, 404 handler)
  - `tests/db.test.ts`: 1 test (PostgreSQL connectivity)
- Prisma validation (`prisma validate`): Valid schema
- Prisma client generation (`prisma generate`): Generated client v7.10.0
- Test DB migrations (`npm run test:migrate`): Up to date (1 migration applied)
- TypeScript build (`tsc`): Successful with 0 errors

### Unresolved issues

None.

### Recommended next task

**Milestone 1C — Login, Session Authentication & Active-Verification Guards**
- Implement session-based authentication using Express session + secure HTTP-only cookies.
- Implement member login (`GET /login`, `POST /login`) with bcrypt password verification.
- Implement logout (`POST /logout`).
- Implement active-verification guards to protect actions when yearly verification has expired.
- Implement test suite for authentication flows and verification status guards.

---

## 2026-09-10 — Milestone 1A: Core Identity Schema & Migrations

### Status

Complete. All identity models are defined, migrated, seeded, and tested. Ready for Milestone 1B (Authentication).

### Completed

- **Prisma 7 Configuration:**
  - Created `prisma.config.ts` with `defineConfig()` for Prisma 7 CLI (migration URL, seed command).
  - Prisma 7 no longer supports `url` in `schema.prisma` `datasource` block; moved to config file.

- **Identity Schema (`prisma/schema.prisma`):**
  - `User` model: `fullName`, `email` (unique), `matricNumber` (unique, mapped to `matric_number`), `passwordHash`, `role` (MEMBER | ADMIN, default MEMBER), FK to `Department` (onDelete Restrict), FK to `Level` (onDelete Restrict).
  - `Department` model: `name` (unique), `code` (unique).
  - `Level` model: `code` (unique, LevelCode enum: ND1, ND2, HND1, HND2), `label`.
  - `AcademicYearCycle` model: `name` (unique), `startDate`, `endDate`, `isCurrent` (default false).
  - `MemberVerification` model: `status` (ACTIVE | EXPIRED | REVOKED), FK to `User` (onDelete Restrict), FK to `AcademicYearCycle` (onDelete Restrict), `verifiedAt`, `expiresAt`, `revokedAt`. Composite unique constraint `(userId, cycleId)`.
  - Enums: `UserRole`, `VerificationStatus`, `LevelCode`.

- **Migration (`20260910155353_init_identity_models`):**
  - Generated via `prisma migrate dev --create-only`, reviewed, then applied.
  - Manually added PostgreSQL partial unique index:
    ```sql
    CREATE UNIQUE INDEX "AcademicYearCycle_one_current"
    ON "AcademicYearCycle" ("isCurrent") WHERE "isCurrent" = true;
    ```
  - This enforces at most one current academic year cycle at the database level.
  - Applied to both `ycep_dev` and `ycep_test` databases.

- **Seed Script (`prisma/seed.ts`):**
  - Idempotent (uses `upsert`).
  - Seeds: ND1, ND2, HND1, HND2 levels; Computer Science (CSC) department; 2025/2026 academic cycle (isCurrent = true).

- **Test Migration Script (`scripts/migrate-test.ts`):**
  - Helper that applies migrations to `ycep_test` by overriding `DATABASE_URL` with `TEST_DATABASE_URL`.
  - Available via `npm run test:migrate`.

- **npm Scripts Added:**
  - `test:migrate`: Applies migrations to the test database.
  - `db:seed`: Runs the seed script.

### Important files created/modified

- `prisma.config.ts` [NEW]: Prisma 7 CLI configuration (datasource URL, seed command, migration path).
- `prisma/schema.prisma` [MODIFIED]: Full identity schema with 5 models, 3 enums, and all constraints.
- `prisma/migrations/20260910155353_init_identity_models/migration.sql` [NEW]: Initial identity migration with partial unique index.
- `prisma/seed.ts` [NEW]: Development seed data.
- `scripts/migrate-test.ts` [NEW]: Test database migration helper.
- `tests/identity.test.ts` [NEW]: 21 database constraint tests.
- `package.json` [MODIFIED]: Added `test:migrate` and `db:seed` scripts.

### Test results

- Test runner: Vitest v3.2.7
- 3 test files, 25 tests passing (100% pass rate):
  - `tests/app.test.ts`: 3 tests (health check, home route, 404 handler)
  - `tests/db.test.ts`: 1 test (PostgreSQL connectivity)
  - `tests/identity.test.ts`: 21 tests covering:
    - Department uniqueness (name, code)
    - Level uniqueness and all 4 valid codes
    - AcademicYearCycle uniqueness, multiple non-current cycles, partial unique index enforcement
    - User email and matric number uniqueness, default MEMBER role, onDelete Restrict on department and level
    - MemberVerification user+cycle uniqueness, multi-cycle support, all status transitions, onDelete Restrict on user and cycle
- TypeScript compile (`tsc`): Successful with 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 1B — Authentication (Registration & Login)**
- Implement member registration endpoint with matric number validation and automatic ACTIVE verification.
- Implement session-based login with bcrypt password verification.
- Implement secure HTTP-only cookie sessions.
- Implement logout.
- Add middleware for authentication and authorization checks.
- Write Vitest + Supertest tests for registration, login, session management, and authorization.

---

## 2026-09-10 — Database environment readiness & Prisma 7 toolchain verified

### Status

Database environment readiness is complete. Docker Desktop and PostgreSQL container (`ycep-postgres`) are operational. Prisma 7.10.0 toolchain with `@prisma/adapter-pg` is installed and verified against PostgreSQL. ESM conversion complete with all existing tests passing. Ready for Milestone 1A schema implementation.

### Completed

- **Docker & PostgreSQL Environment:**
  - Verified Docker Desktop engine status and running daemon.
  - Created persistent volume `ycep_pgdata`.
  - Started local development PostgreSQL container `ycep-postgres` (`postgres:17`, port `5432:5432`).
  - Initialized development database `ycep_dev` and dedicated test database `ycep_test`.
  - Configured gitignored `.env` with local PostgreSQL connection URLs; updated `.env.example` with placeholder URLs.
- **ESM Conversion:**
  - Converted TypeScript and Express foundation to ESM (`"type": "module"` in `package.json`, `NodeNext` in `tsconfig.json`).
  - Added ESM `import.meta.url` path resolution for `__dirname` in `src/app.ts`.
  - Updated internal route imports to use `.js` extensions per NodeNext specification.
- **Prisma 7 Toolchain Integration:**
  - Installed pinned `prisma@7.10.0`, `@prisma/client@7.10.0`, and `@prisma/adapter-pg@7.10.0`.
  - Installed `pg@^8.23.0` and `@types/pg@^8.23.1`.
  - Created minimal toolchain validation schema (`prisma/schema.prisma`).
  - Validated schema (`npx prisma validate`) and generated Prisma Client (`npx prisma generate`).
  - Created database integration test (`tests/db.test.ts`) proving PostgreSQL connectivity via Prisma Client and `@prisma/adapter-pg`.
- **Verification:**
  - Vitest test suite: 4 of 4 tests passing (3 application routes + 1 database connection).
  - TypeScript build (`npm run build`): Completed with 0 errors.

### Installed packages

- `prisma`: 7.10.0
- `@prisma/client`: 7.10.0
- `@prisma/adapter-pg`: 7.10.0
- `pg`: 8.23.0
- `@types/pg`: 8.23.1

### Test results

- Test runner: Vitest v3.2.7
- 2 test files, 4 tests passing (100% pass rate):
  - `tests/app.test.ts` (3 tests passing: health check, home route, 404 handler)
  - `tests/db.test.ts` (1 test passing: PostgreSQL raw query via Prisma 7 adapter)
- TypeScript compile (`tsc`): Successful with 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 1A — Core Identity Schema & Migrations**
- Define domain models in `prisma/schema.prisma`: `User`, `Department`, `Level`, `AcademicYearCycle`, and `MemberVerification`.
- Enforce the single-current-cycle database invariant on `AcademicYearCycle`.
- Enforce `onDelete: Restrict` on identity and verification relations to prevent cascading deletes of historical records.
- Run initial Prisma migration against `ycep_dev`.
- Create development seed data (ND1/ND2/HND1/HND2, development departments, initial academic cycle).
- Add database constraint tests using dedicated test database `ycep_test`.

---

## 2026-09-10 — Repository foundation initialized

### Status

Repository foundation setup is complete. Application builds cleanly, runs in development and production modes, and passes automated testing. Ready for Milestone 1 (Core Identity).

### Completed

- Initialized Node.js 24 + TypeScript project tooling (`package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`).
- Configured scripts: `dev` (`tsx watch`), `build` (`tsc`), `start` (`node dist/server.js`), `test` (`vitest run`).
- Established modular source structure:
  - `src/app.ts`: Express application factory and middleware configuration.
  - `src/server.ts`: HTTP server listening on configured port.
  - `src/routes/health.route.ts`: `GET /health` endpoint returning system health and uptime.
  - `src/routes/index.route.ts`: `GET /` endpoint rendering minimal YCEP landing page.
- Configured EJS template engine (`views/index.ejs`) and static asset handling (`public/css/style.css`).
- Created automated test suite using Vitest + Supertest (`tests/app.test.ts`) covering:
  - Application startup and `GET /health` response;
  - `GET /` rendering YCEP landing page;
  - 404 handling for unknown routes.
- Executed `build` and `tests` successfully:
  - Vitest: 3 of 3 tests passing.
  - TypeScript compilation: 0 errors, output generated in `dist/`.

### Important files created

- `package.json`: Dependencies and build/test scripts.
- `tsconfig.json`: TypeScript configuration.
- `vitest.config.ts`: Vitest test runner configuration.
- `.gitignore`: Ignoring `node_modules/`, `dist/`, `.env`, `coverage/`, logs.
- `.env.example`: Environment variable template.
- `src/app.ts`: Express app setup and middleware.
- `src/server.ts`: Express HTTP listener.
- `src/routes/health.route.ts`: Health check route.
- `src/routes/index.route.ts`: Root route.
- `views/index.ejs`: Root EJS template.
- `public/css/style.css`: Vanilla styling.
- `tests/app.test.ts`: Integration tests.

### Dependencies added

- Production: `express`, `ejs`, `zod`, `dotenv`.
- Development: `typescript`, `@types/node`, `@types/express`, `@types/ejs`, `@types/supertest`, `supertest`, `vitest`, `tsx`.

### Test results

- Test runner: Vitest v3.2.7
- 1 test file, 3 tests passing (100% pass rate).
- TypeScript compile (`tsc`): Successful with 0 errors.

### Unresolved issues

None.

### Recommended next task

**Milestone 1 — Core Identity: Database Schema & Authentication Setup**
- Install Prisma and configure PostgreSQL connection.
- Define initial Prisma schema for `User`, `Department`, `Level`, `AcademicYearCycle`, and `MemberVerification`.
- Implement user registration endpoint with unique matric number validation and automatic `ACTIVE` cycle verification.
- Write tests verifying registration, matric uniqueness, and verification status gating.

---

## 2026-10-09 — Logo integration and advanced UI refinement

### Completed

- Preserved the approved source at `design resources/YCEP Campus Events Emblem.png` and created a pixel-preserving navbar crop at `public/assets/brand/ycep-navbar.png`.
- Integrated the production mark into public, member/organizer, and Management shells with restrained responsive sizing.
- Refined the neutral navy/blue/teal palette, atmospheric page canvas, navigation treatment, typography, surfaces, focus states, and reduced-motion behavior.
- Converted My Events from a dense table into responsive management rows with date, metadata, lifecycle state, and actions.
- Rebuilt Create/Edit Event as a structured publishing workflow with reusable responsive field groups.
- Improved authentication, error/forbidden, organizer status, account, Management dashboard, event queue, and review presentation without changing their behavior.

### Verification

- No schema or migration was created for this pass.
- Presentation-affected suites: 67 passed across 3 files.
- Full suite: 148 passed across 8 files.
- TypeScript production build and `git diff --check` passed.
- Home, member authentication, registration, Management authentication, and production logo asset returned HTTP 200 from the running development server.

---

## 2026-10-09 — UI foundation and application shell

### Completed

- Established reusable design tokens for color, typography, spacing, widths, radii, focus states, and restrained surfaces.
- Added shared public, member/organizer, and Management navigation shells with a replaceable text brand treatment.
- Standardized buttons, fields, checkboxes, notices, empty states, status pills, metadata grids, and responsive tables.
- Reworked the account, organizer event workspace/detail, and Management event review surfaces around the new system.
- Applied the shared shell and component styling across all current EJS views without changing routes, form contracts, authorization, lifecycle rules, schema, or migrations.

### Verification

- Full suite: 148 passed across 8 files.
- TypeScript production build passed.
- Public home, member login/registration, and Management login returned HTTP 200 from the running development server.

### Deferred

- Final YCEP logo and public event-discovery presentation remain separate future work.

---

## 2026-10-09 — Milestone 4B: Event submission and management approval

### Completed

- Added nullable event submission/review timestamps, reviewer relation, rejection feedback, and pending-queue index through forward migration `20261009014919_event_submission_management_review`.
- Added organizer submission and read-only lifecycle views for draft, pending, published, and rejected events; editing remains draft-only.
- Added protected management event queue, detail, approval, and rejection routes and views.
- Enforced `DRAFT → PENDING_APPROVAL → PUBLISHED | REJECTED` with interactive transactions, event row locks, post-lock state reads, live authorization checks, and atomic audit records.
- Approval now fails safely if organizer authorization, current cycle, member role, or verification has become invalid. Rejection does not depend on continued organizer trust.
- Added `EVENT_SUBMITTED`, `EVENT_APPROVED`, and `EVENT_REJECTED` audit actions.

### Files/modules changed

- Prisma schema and migration; event/audit services; organizer and admin event routes; review validator; organizer/admin EJS views; application router; event lifecycle tests.

### Verification

- Prisma validation and client generation passed.
- Focused event suite: 19 passed.
- Full suite: 148 passed across 8 files.
- TypeScript production build passed.

### Unresolved issues

- None for Milestone 4B. The existing `pg` deprecation warning during tests remains unrelated to this milestone.

### Recommended next task

- Implement the next explicitly approved simplified-V1 milestone; do not add public discovery or external registration behavior as part of 4B.

---

## 2026-09-10 — Milestone 0: Architecture discovery completed & decisions frozen

### Status

Milestone 0 is complete. The engineering baseline and critical product architecture decisions are now frozen. The repository is ready for Milestone 1 (Core Identity).

### Completed

- Repository discovery completed; greenfield baseline confirmed under git version control.
- Engineering baseline frozen:
  - Runtime: Node.js 24 + TypeScript
  - Backend: Express.js
  - Frontend: EJS server-rendered templates + Vanilla JavaScript + Vanilla CSS
  - Database: PostgreSQL (for both dev and prod; SQLite prohibited)
  - ORM: Prisma
  - Validation: Zod
  - Authentication: Session-based, secure HTTP-only cookies, bcrypt password hashing
  - Email: Nodemailer behind `EmailService` abstraction (dev environments do not require real prod credentials)
  - Testing: Vitest + Supertest
- Normal member verification decision recorded:
  - Registration with a valid, unassigned YABATECH matric number automatically receives `ACTIVE` verification for the current yearly cycle.
  - Normal member registration does not require manual administrator approval.
  - Manual YABATECH Management approval begins when a member applies for organizer privileges.
  - Accounts remain persistent across yearly verification expiry.
- Audience and eligibility relational architecture locked:
  - Target audience and registration eligibility are kept strictly separate.
  - Department and level are not modeled as a single nullable pair; modeled via independent relationships: `EventTargetDepartment`, `EventTargetLevel`, `EventEligibleDepartment`, `EventEligibleLevel`.
  - Eligibility evaluation rules formalized: empty department/level list allows all; restrictions require member to match; both restrictions require matching both; target audience influences discovery only.
- Concurrency and database constraints locked:
  - Registration limits must be enforced transactionally using PostgreSQL transactions and synchronization/locking strategies (such as `SELECT ... FOR UPDATE` or serializable isolation) to prevent race conditions.
  - PostgreSQL is mandatory for both development and production.
- Governance files updated: `YCEP_V1_SPEC.md`, `DECISIONS.md` (D-028 superseded, D-029 to D-032 added), `AGENTS.md`, and `DEVELOPMENT_LOG.md`.

### Next task

**Milestone 1 — Core Identity**

Set up project scaffolding with the frozen TypeScript + Express + Prisma + PostgreSQL baseline and implement user registration, matric uniqueness, password hashing, academic cycle, and verification logic with Vitest test coverage.

---

## 2026-09-10 — Product specification prepared

### Status

Development has not yet started under the frozen YCEP V1 specification.

### Completed

- Product ideation consolidated.
- V1 scope defined.
- User/organizer/admin model defined.
- Organizer verification model defined.
- Event approval requirement defined.
- Registration/application modes defined.
- Registration-limit behaviour defined.
- Yearly verification expiry behaviour defined.
- Target audience vs eligibility distinction defined.
- Co-organizer model defined.
- Attendance scope defined.
- Email-only notification scope defined.
- Event cancellation/history rules defined.
- Initial AI-agent workflow documentation prepared.

### Important implementation defaults

The following were selected to remove ambiguity before implementation:

- event banner/poster is optional;
- approval-based events may contain up to 5 text questions;
- comments/reviews are excluded from V1;
- CSV export is optional/non-blocking;
- technology stack must be confirmed from the repository before major implementation.

### Next task

**Milestone 0 — Repository Discovery & Architecture Freeze**

The next coding agent should inspect the repository and report:

1. current stack;
2. current project structure;
3. existing implemented features;
4. conflicts with `YCEP_V1_SPEC.md`;
5. recommended architecture/build order.

Do not start a large rewrite before this review.
