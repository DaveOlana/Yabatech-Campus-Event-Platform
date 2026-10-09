# YCEP — Decision Log

This file records important product decisions that should not be casually re-litigated during implementation.

## D-001 — Product identity

**Decision:** The project is YCEP — YABATECH Campus Events Platform.

**Reason:** The platform is broader than simple event registration but is not a full event-budgeting/planning suite.

## D-002 — YABATECH-only institutional context

**Decision:** YCEP is designed specifically for YABATECH.

## D-003 — Public event visibility

**Decision:** Approved events are visible to everyone.

Private/specialized event visibility is outside V1.

## D-004 — Organizer is an approved capability

**Decision:** Organizer is not a completely separate authentication system. A normal member receives organizer capability after YABATECH Management approval.

## D-005 — Two trust gates

**Decision:** A member must be approved as an organizer, and each event must still be approved before publication.

Organizer approval does not automatically approve events.

## D-006 — Admin represents YABATECH Management

**Decision:** V1 uses a dedicated YABATECH Management administrator role/account. The admin does not expire yearly.

## D-007 — Matric number is sufficient institutional identifier for V1

**Decision:** YCEP uses matric number as the primary school identifier and enforces uniqueness.

**Trade-off:** This does not eliminate impersonation risk, but stronger institutional identity integration is outside V1.

## D-008 — Account expiry means verification expiry

**Decision:** Accounts are never automatically deleted at year end. Instead, yearly verification expires.

**Reason:** Historical events, registrations, and attendance must survive.

## D-009 — Organizer approval expires yearly

**Decision:** Organizer privilege must be renewed/reapproved after yearly expiry.

## D-010 — No staff profile in V1

**Decision:** V1 does not introduce a separate staff-profile architecture.

## D-011 — Department and level are stored

**Decision:** Member profiles store department and level.

## D-012 — Recommendation and eligibility are separate

**Decision:** Department/level targeting does not automatically block participation. Organizers may separately configure registration eligibility.

## D-013 — Event participation modes

**Decision:** Each event uses one of:

- no registration required;
- open registration;
- approval-required application.

## D-014 — Registration limit is not venue capacity

**Decision:** Organizer may choose unlimited registration or a numeric registration ceiling.

**Reason:** Campus events can have significant no-show rates.

## D-015 — Pending applications do not consume registration limit

**Decision:** For approval-based events, only approved applicants count toward the registration limit.

## D-016 — Member cancellation is allowed

**Decision:** Members may cancel their own registration/application. Cancellation preserves history rather than deleting the record.

## D-017 — One primary organizer, multiple co-organizers

**Decision:** Events may have multiple co-organizers but exactly one primary organizer.

## D-018 — Organization identity without organization accounts

**Decision:** A real member account may be verified to publicly represent an organization such as NACOS YABATECH. V1 does not build a separate shared organization-login system.

## D-019 — Venue reservation is outside YCEP

**Decision:** YCEP stores venue information but does not authorize or reserve physical venues.

## D-020 — Email-only notifications

**Decision:** V1 uses email notifications. SMS, WhatsApp, and push notifications are outside V1.

## D-021 — Manual attendance in V1

**Decision:** Organizer marks participants present manually. QR attendance is deferred.

## D-022 — Preserve published-event history

**Decision:** Completed and cancelled events remain in the system. Hard deletion is not the normal lifecycle action.

## D-023 — Fundamental event changes require reapproval

**Decision:** Title, organizer identity, or core-purpose changes trigger reapproval. Operational schedule/venue/deadline/limit changes may remain live but should notify affected participants.

## D-024 — Application questions remain simple

**Decision:** V1 defaults to at most 5 text questions per approval-based event.

**Status:** Implementation default chosen to keep the MVP useful without creating a full form builder.

## D-025 — Event image

**Decision:** Event banner/poster image is optional in V1.

**Status:** Implementation default.

## D-026 — No comments/reviews in V1

**Decision:** Comments, ratings, and reviews are excluded.

## D-027 — CSV export is non-blocking

**Decision:** Participant CSV export is useful but is not required for V1 acceptance.

## D-028 — Technology stack not frozen by this document

**Decision:** The existing repository and architecture review should determine the stack unless the project owner explicitly selects one.

**Status:** Superseded by D-029 following Milestone 0 architecture review.

## D-029 — Frozen engineering baseline

**Decision:** The engineering baseline for YCEP V1 is frozen as follows:

- **Runtime:** Node.js 24, TypeScript
- **Backend:** Express.js
- **Frontend:** EJS server-rendered templates, Vanilla JavaScript, Vanilla CSS
- **Database:** PostgreSQL (for both development and production environments; SQLite is prohibited)
- **ORM:** Prisma
- **Validation:** Zod
- **Authentication:** Session-based authentication, secure HTTP-only cookies, bcrypt password hashing
- **Email:** Nodemailer behind an `EmailService` abstraction (development environments must not require real production email credentials)
- **Testing:** Vitest, Supertest

No AI agent or developer may substitute frameworks, template engines, ORMs, or databases without explicit owner revision.

## D-030 — Normal member verification rules

**Decision:** A new member who registers with a matric number matching YCEP's configured YABATECH matric-number validation rules, and whose matric number is not already registered, automatically receives `ACTIVE` verification for the current yearly cycle.

Normal member registration does **not** require manual administrator approval.

Manual YABATECH Management approval begins when a member applies for organizer privileges.

Accounts remain persistent when yearly verification expires.

## D-031 — Audience and eligibility independent relational model

**Decision:** Recommended audience and registration eligibility remain completely separate concepts and schema structures.

Department and level are **not** modeled as a single nullable pair. Instead, independent relationships must be used:

- `EventTargetDepartment`
- `EventTargetLevel`
- `EventEligibleDepartment`
- `EventEligibleLevel`

**Evaluation rules:**

1. No eligible departments selected = all departments allowed.
2. No eligible levels selected = all levels allowed.
3. If department restrictions exist, the member must belong to an allowed department.
4. If level restrictions exist, the member must belong to an allowed level.
5. If both exist, the member must satisfy both.
6. Target departments/levels influence discovery and recommendation only; they never automatically block participation.

## D-032 — Database concurrency and PostgreSQL-only requirement

**Decision:** PostgreSQL is the mandatory database for both development and production environments. SQLite must not be documented or used as an alternative.

When numeric registration-limit logic is implemented, concurrency must be handled transactionally using PostgreSQL transactions and an appropriate synchronization/locking strategy (such as `SELECT ... FOR UPDATE` or serializable transaction isolation) to prevent race conditions and overbooking.

## D-033 — Matric number normalization, structural validation, and institutional scope

**Decision:**
- Matric numbers are manually entered by the user.
- Expected general structure: `PREFIX/PROGRAMME/YEAR/SERIAL` (e.g., `F/ND/24/3210051`, `PT/HND/25/2100001`).
- Normalization: trim leading and trailing whitespace, remove harmless whitespace surrounding `/` separators, and convert letters to uppercase.
- Store only the normalized matric number, which must remain unique across accounts.
- V1 structural validation regex: `^[A-Z]{1,4}/[A-Z]{2,4}/\d{2}/\d{7}$`.
- YCEP does not claim this proves that the matric number exists in the central YABATECH database.
- Department and level are entered/selected independently and are not inferred from the matric number.

## D-034 — Member registration password minimum requirement

**Decision:** The password minimum length for member registration in V1 is 8 characters.

## D-035 — Admin-compatible identity model and role-differentiated academic fields

**Decision:**
- Academic identity fields (`matricNumber`, `departmentId`, `levelId`) are mandatory for `MEMBER` accounts, but optional (nullable) for `ADMIN` accounts.
- This invariant is enforced at the database level using a PostgreSQL CHECK constraint:
  `"role" != 'MEMBER' OR ("matric_number" IS NOT NULL AND "department_id" IS NOT NULL AND "level_id" IS NOT NULL)`
- The dedicated YABATECH Management `ADMIN` account authenticates separately using email in Milestone 2.
- Ordinary member login remains matric-number based (`POST /login` accepts matric number and password).
- `ADMIN` accounts do not require a `MemberVerification` record and are permanently exempt from annual verification expiry.

## D-036 — Exactly one dedicated ADMIN account enforced at database level

**Decision:**
- YCEP V1 has exactly one dedicated YABATECH Management `ADMIN` account.
- Enforced at the database level via a PostgreSQL partial unique index:
  `CREATE UNIQUE INDEX "User_one_admin" ON "User" ("role") WHERE "role" = 'ADMIN'`
- An `ADMIN` account must not have fake academic identity fields. Enforced at the database level via a PostgreSQL CHECK constraint:
  `"role" != 'ADMIN' OR ("matric_number" IS NULL AND "department_id" IS NULL AND "level_id" IS NULL)`
- There is no public admin-registration route.

## D-037 — Admin email authentication separation and account area boundaries

**Decision:**
- Admin authentication is dedicated (`GET /admin/login`, `POST /admin/login`, `POST /admin/logout`) and strictly accepts email + password.
- Member authentication remains strictly matric-number based (`POST /login`).
- `POST /admin/login` only authenticates accounts where `role === 'ADMIN'`. A `MEMBER` attempting login at `/admin/login` receives the identical generic invalid-credentials error.
- `/account` remains strictly the `MEMBER` account area. Authenticated `ADMIN` users accessing `/account` are redirected to `/admin` to prevent template and runtime errors on null academic fields.
- Admin credentials can later be transferred or rotated by changing the credentials of the single account.

## D-038 — Admin bootstrap script and security invariants

**Decision:**
- Initial admin account is created via an explicit CLI bootstrap script (`npm run admin:bootstrap` / `scripts/bootstrap-admin.ts`) reading `YCEP_ADMIN_NAME`, `YCEP_ADMIN_EMAIL`, and `YCEP_ADMIN_PASSWORD`.
- Requires a minimum 12-character admin password.
- Rejects default placeholder/example passwords.
- Idempotent: If an `ADMIN` already exists with the same email, it exits safely without overwriting or resetting the password. If conflicting credentials are provided, it throws a clear conflict error.
- Guarded to ensure importing in test suites does not trigger CLI execution.

## D-039 — Append-only immutable audit logging and transactional privileged mutations

**Decision:**
- Privileged administrative events are recorded in an immutable, append-only `AuditLog` table.
- Application code must never expose update or delete operations on audit logs.
- Audit service defensively sanitizes metadata to exclude sensitive authentication data (`password`, `passwordHash`, `session`, `cookie`, `token`).
- `POST /admin/logout` is guarded by `requireAdmin` (members cannot generate admin audit logs).
## D-040 — Separate OrganizerApplication and OrganizerAuthorization architecture

**Decision:**
- Organizer capability is modelled using two distinct entities rather than a single mutable row:
  1. `OrganizerApplication`: An immutable/state-tracked historical record of an organizer request, containing applicant answers (`requestedPublicName`, `phoneNumber`, optional `organizationName`, optional `positionTitle`, `reason`, optional `evidenceUrlOrText`) and administrative review history (`status`, `reviewedAt`, `reviewedByAdminId`, `adminReviewNotes`). Note: Public organizer identity (`requestedPublicName`) and represented organization (`organizationName`) are strictly separate concepts.
  2. `OrganizerAuthorization`: The active capability record granting organizer authority for a specific academic cycle (`ACTIVE`, `REVOKED`, `EXPIRED`), with `approvedPublicName` copied directly from `OrganizerApplication.requestedPublicName`.
- Preserves complete administrative audit history: a member's application details and prior review decisions are never overwritten upon revocation or reapplication.

## D-041 — Reapplication policy, partial unique pending index, and cycle revocation finality

**Decision:**
- Enforced at the database level: At most one `PENDING` `OrganizerApplication` per member per cycle via a PostgreSQL partial unique index:
  `CREATE UNIQUE INDEX "OrganizerApplication_one_pending_per_cycle" ON "OrganizerApplication" ("user_id", "cycle_id") WHERE "status" = 'PENDING'`
- If an application is `REJECTED`, the member is permitted to submit a new application within the same cycle, with both records retained in the database.
- If an `OrganizerAuthorization` already exists for that user in that cycle (whether `ACTIVE`, `REVOKED`, or `EXPIRED`), no new application can be submitted for that cycle.
- Revocation of an authorization is final for the remainder of that academic cycle.

## D-042 — Derived current-cycle expiry and live organizer authorization guard

**Decision:**
- An organizer authorization only confers authority if its `cycleId` matches the currently active `AcademicYearCycle` (`isCurrent: true`) and the underlying member's `MemberVerification` in that cycle is `ACTIVE`.
- `requireOrganizer` middleware inspects live database state on every request to ensure revoked authorizations, cycle rollovers, or deactivated member verifications immediately revoke organizer access without stale session leakage.
- Applications submitted in prior cycles cannot be reviewed or approved once the cycle is no longer current.
- The dedicated `ADMIN` account is not an organizer and cannot be granted or assume organizer capability.

## D-043 — Transactional concurrency safety, row-level locking, and transactional audit logging

**Decision:**
- Administrative decision transitions (`approve`, `reject`) and authorization revocations (`revoke`) execute within PostgreSQL database transactions utilizing row-level locks via raw `SELECT ... FOR UPDATE`.
- Prevents race conditions and duplicate authorization generation under concurrent administrative reviews.
- All state-changing administrative organizer mutations (`ORGANIZER_APPLICATION_APPROVED`, `ORGANIZER_APPLICATION_REJECTED`, `ORGANIZER_AUTHORIZATION_REVOKED`) write their respective `AuditLog` records in the exact same database transaction. If the audit log fails, the entire mutation is rolled back.

## D-044 — Authorization-bound event ownership and snapshot public identity

**Decision:**
- Primary event ownership is bound to `OrganizerAuthorization` via `primaryOrganizerAuthorizationId` with `onDelete: Restrict`, rather than directly to a raw `User`.
- `organizerPublicName` is stored directly on `Event` as an immutable snapshot derived exclusively server-side from `OrganizerAuthorization.approvedPublicName` at event creation time.
- Draft creation, listing, viewing, and editing are scoped strictly to the organizer's active current-cycle `OrganizerAuthorization.id`.
- If a member is approved as an organizer in a subsequent cycle, they receive a new `OrganizerAuthorization` and cannot view or edit draft events created under an earlier cycle's authorization (preventing cross-cycle draft pollution).
- Neither `primaryOrganizerAuthorizationId`, `organizerPublicName`, user identity, nor cycle information may be submitted by or accepted from client forms; all are populated server-side from `req.organizerAuthorization`.

## D-045 — Omission of redundant Event cycleId in favour of single source of truth

**Decision:**
- An explicit `cycleId` column is omitted from the `Event` model.
- Because `Event.primaryOrganizerAuthorizationId` references `OrganizerAuthorization`, which already contains `cycleId`, the event's academic cycle context is deterministically accessible via the relationship without denormalization.
- Omitting a redundant `cycleId` prevents multi-column synchronization inconsistencies and eliminates any potential for client or application layer drift between the authorization cycle and the event cycle.

## D-046 — Independent junction modelling for target audience vs. registration eligibility

**Decision:**
- Recommended target audience and registration eligibility are strictly separated and modeled via four independent relational junction tables:
  1. `EventTargetDepartment` (`eventId`, `departmentId`)
  2. `EventTargetLevel` (`eventId`, `levelId`)
  3. `EventEligibleDepartment` (`eventId`, `departmentId`)
  4. `EventEligibleLevel` (`eventId`, `levelId`)
- Target audience influences discovery and recommendation ranking only and never blocks registration.
- Registration eligibility governs who is permitted to register or apply.
- If no eligible departments are assigned to an event (0 rows in `EventEligibleDepartment`), all departments are eligible.
- If no eligible levels are assigned to an event (0 rows in `EventEligibleLevel`), all levels are eligible.
- If restrictions exist, the student must satisfy all configured constraints.

## D-047 — Server-side normalization of participation mode constraints

**Decision:**
- Participation mode (`NO_REGISTRATION`, `OPEN_REGISTRATION`, `APPROVAL_REQUIRED`) constraints are enforced and normalized server-side in the domain service layer, regardless of browser input:
  1. `NO_REGISTRATION`:
     - `registrationDeadline = null`
     - `registrationLimit = null`
     - 0 `ApplicationQuestion` records persisted.
  2. `OPEN_REGISTRATION`:
     - Optional `registrationDeadline` allowed.
     - Optional `registrationLimit` allowed.
     - 0 `ApplicationQuestion` records persisted (stripped if submitted).
  3. `APPROVAL_REQUIRED`:
     - Optional `registrationDeadline` allowed.
     - Optional `registrationLimit` allowed.
     - Up to 5 ordered text questions (`ApplicationQuestion`) persisted.

## D-048 — Application question constraints and deferral of co-organizer subsystem

**Decision:**
- `ApplicationQuestion` stores ordered text questions (`questionText`, `orderIndex`) for `APPROVAL_REQUIRED` events.
- An unapproved `isRequired` boolean is explicitly omitted in V1; all questions configured by the organizer are simple text prompts.
- Co-organizer relations (`EventCoOrganizer`) are explicitly excluded from Milestone 4A and deferred to Milestone 9 to keep the event foundation tightly focused on draft management and authorization invariants.
- Event status in Milestone 4A is strictly `DRAFT`. State transitions (`PENDING_APPROVAL`, `PUBLISHED`, `COMPLETED`, `REJECTED`, `CANCELLED`) and public discovery are deferred to Milestones 5 and 6.

## D-049 — Simplified V1 is trusted event publishing and public discovery

**Date:** 2026-10-09

**Status:** Approved. This supersedes the registration-heavy V1 direction wherever the two conflict.

**Decision:** YCEP V1 is primarily a trusted YABATECH campus event publishing and discovery platform. Its required loop is verified organizer → event draft → submission → YABATECH Management review → approval/rejection → publication → public discovery. Ordinary viewers do not require accounts.

YCEP governs organizer trust, event approval, and event visibility. It does not own attendee registration in simplified V1. A later Layer 2 may link to Luma, Google Forms, Microsoft Forms, Eventbrite, or another legitimate service. The external service—not YCEP—governs registration; YCEP will not synchronize attendee status.

The following earlier decisions are superseded as active V1 requirements:

- D-012 insofar as it requires an internal registration-eligibility system; target audience remains useful for discovery.
- D-013 through D-016: internal participation modes, limits, approval counts, and cancellation.
- D-020 insofar as it requires attendee registration/application notifications.
- D-021: manual attendance in V1.
- D-023 insofar as it requires preserving registrations or notifying participants; fundamental changes still require reapproval.
- D-024: attendee application questions in V1.
- D-027 insofar as CSV export concerns participant records.
- D-031 and D-032 insofar as they require internal eligibility and registration-limit implementation; PostgreSQL remains mandatory.
- D-046 insofar as registration-eligibility junctions are active V1 design; target-audience junctions remain approved.
- D-047: participation-mode normalization as an active V1 requirement.
- D-048 insofar as application questions are active V1; its Milestone 4A history and co-organizer deferral remain recorded.

D-001 is narrowed: YCEP remains a campus event platform, but simplified V1 is not a complete registration, participant-management, or attendance platform.

Existing `ParticipationMode`, `registrationDeadline`, `registrationLimit`, `eligibilityInstructions`, `EventEligibleDepartment`, `EventEligibleLevel`, and `ApplicationQuestion` structures are **legacy Milestone 4A structures pending deliberate simplification review**. They must not be removed in place or treated as permission to build the old attendee workflow. Any removal requires a new forward migration and preserved migration history.

`EventTargetDepartment` and `EventTargetLevel` remain approved for discovery, filtering, and simple relevance. They do not control registration or public visibility.

## D-050 — Remove legacy Milestone 4A attendee structures

**Date:** 2026-10-09

**Status:** Implemented by forward migration `20261009010424_simplify_layer1_events`.

**Decision:** Following D-049, remove `ParticipationMode`, the Event registration/deadline/limit/eligibility fields, `EventEligibleDepartment`, `EventEligibleLevel`, and `ApplicationQuestion`. These objects have no Layer 1 purpose and must not remain as an attractive path back to the superseded attendee-management product.

Preserve `EventTargetDepartment` and `EventTargetLevel` solely for public discovery, filtering, and relevance. Targeting never restricts public visibility.

Migration `20260912140539_event_foundation_drafts` remains immutable history. Cleanup is forward-only through migration `20261009010424_simplify_layer1_events`.

## D-051 — Event submission and management approval lifecycle

**Date:** 2026-10-09

**Status:** Implemented by forward migration `20261009014919_event_submission_management_review`.

**Decision:** Milestone 4B implements only `DRAFT → PENDING_APPROVAL → PUBLISHED | REJECTED`. Submission and management decisions use PostgreSQL row locking and atomic audit writes. Approval revalidates the owning organizer's current authorization and member verification; rejection remains available if that trust later becomes invalid. Rejected events are terminal and view-only in this milestone. Public discovery, cancellation, completion, and external registration links remain deferred.

## D-052 — Public discovery baseline

**Date:** 2026-10-09

**Status:** Implemented in Milestone 4C without a schema migration.

**Decision:** Public queries constrain event status to `PUBLISHED` at the database boundary and select only approved public fields. The homepage is account-free, uses the Africa/Lagos calendar day, lists today/future events only, orders by date then start time then title, and caps results at 24. Published past events remain accessible at their direct detail URLs. Every other status and an unknown ID return the same generic 404. Search, filtering, recommendations, registration, attendance, and participant features are not part of this milestone.

## D-053 — Public search, filtering, and relevance contract

**Date:** 2026-10-09

**Status:** Implemented in Milestone 4D without a schema migration.

**Decision:** Public discovery accepts `q`, `category`, `department`, `level`, and `date` as singular URL parameters. Search is a case-insensitive substring match over title, description, venue, organizer public name, and category name. Reference filters use persisted codes. Department/level filters include explicit matches plus events with no targets in that dimension; targeting remains relevance-only and never eligibility. Different dimensions combine with AND semantics. Date values mean upcoming, today, today-through-Sunday, or today-through-month-end in Africa/Lagos. Results retain date/time/title ordering and the 24-card cap; a shared query condition powers both cards and the accurate total count. Malformed or unknown filters return a safe empty result rather than broadening visibility. Every query remains `PUBLISHED`-only with the explicit public projection.

## D-054 — Post-publication event management and historical integrity

**Date:** 2026-10-09

**Status:** Implemented in Milestone 4E with forward migration `20261009081200_event_cancellation_history`.

**Decision:** Published events are immutable in V1; replacements use a fresh draft and approval. Today/upcoming/past are derived from the Africa/Lagos event date, and `COMPLETED` remains unused. The only approved post-publication transition is irreversible `PUBLISHED → CANCELLED`. The current exact owner or Management may cancel with a public 10–500 character reason. The transition is row-locked, actor-revalidated, and committed atomically with cancellation metadata and one `EVENT_CANCELLED` audit. Public lists/search remain strictly `PUBLISHED`; a direct detail query may return `PUBLISHED` or `CANCELLED`, and a cancelled page shows its reason without actor identity. Later organizer trust loss does not automatically unpublish an approved event. Organizer history remains current-authorization-scoped; Management receives separate queue and history surfaces.

## D-055 — V1 browser security boundary

**Date:** 2026-10-09

**Status:** Implemented in Milestone 5A without a schema migration.

**Decision:** All browser mutations use a cryptographically random session-backed synchronizer token. Member login allows 10 failed attempts per 15 minutes per client IP, Management login allows 5, and registration allows 5 per hour; separate in-memory stores are acceptable only for a single-process V1 deployment. Login regenerates the session and logout remains CSRF-protected POST. Cookies are HttpOnly, SameSite=Lax, path `/`, and Secure only in production. Helmet provides a nonce-free, self-hosted script CSP and security headers; HSTS and proxy trust remain disabled until deployment topology is approved. Newly entered poster URLs require HTTPS, while historical data is not rewritten. Duplicate registration conflicts use one generic message.

## D-056 — Member-maintained current profile

**Date:** 2026-10-09

**Status:** Implemented without a schema migration.

**Decision:** Authenticated members may edit their current full name, email address, department, and level. Matric number remains immutable. Updates validate canonical department/level references and unique email ownership transactionally. Profile editing never changes yearly verification or organizer authorization; graduation and cycle departure preserve the account and history while verification expires.

## D-057 — Management-gated department suggestions

**Date:** 2026-10-09

**Status:** Implemented by forward migration `20261009142000_event_department_suggestions`.

**Decision:** An organizer may attach one proposed department name and short code to an editable event draft when the official catalogue does not contain it. The proposal remains non-public and does not create a `Department` while draft or pending. Management sees it during event review; approving the event atomically creates or reuses the exact non-conflicting department, links it as a relevance target, publishes the event, and records the accepted department in the approval audit. Rejecting the event leaves the official catalogue unchanged. Catalogue conflicts block approval rather than guessing or overwriting institutional data.

## D-058 — Dedicated Management username and credential controls

**Date:** 2026-10-09

**Status:** Implemented by forward migration `20261009150000_management_username_auth`. Supersedes D-037 and D-038 only where they specify email-based Management login, a 12-character password minimum, or email-based bootstrap identity matching.

**Decision:** Member authentication remains matric number plus password. The single `ADMIN` authenticates separately with a required Management username plus password; the normalized comparison is trimmed, collapses repeated whitespace, and is case-insensitive. Members cannot have Management usernames. Management passwords require at least 8 characters and remain bcrypt-hashed. Username and password changes require current-password confirmation, are ADMIN-only and CSRF-protected, and write credential-change audits without password metadata. Password changes invalidate prior Management sessions and regenerate the current session. Bootstrap and deliberate reset/update commands consume ignored environment variables, preserve the existing ADMIN row and relationships, and never print plaintext credentials.

## D-059 — Vercel and Neon scrutiny deployment foundation

**Date:** 2026-10-09

**Status:** Implemented by forward migration `20261009190000_vercel_neon_session_foundation`.

**Decision:** YCEP retains its Express/EJS architecture as one Node 24 Vercel Fluid-compute function backed by Neon PostgreSQL. Runtime access uses a bounded module-scoped `pg.Pool` with Neon's pooled URL; Prisma migration commands use a separate direct URL. The shared session table is migration-owned, production table creation and pruning timers are disabled, and expired sessions are removed deliberately. Secure-cookie proxy recognition and forwarded client addresses are trusted only when `VERCEL=1`; broad Express proxy trust remains prohibited. The scrutiny rate limiter remains per-instance with its reduced global guarantee documented, and Preview deployments receive no production database credentials.

## D-060 — Production reference data and two-semester structure

**Date:** 2026-10-09

**Status:** Implemented.

**Decision:** Production initialization is separate from development seeding and requires explicit academic-cycle name/start/end values. YCEP stores exactly the canonical semester names First Semester and Second Semester, four programme levels, the approved event categories, and the initial reviewed department catalogue. Department codes beginning `YCEP-` are deterministic internal identifiers, not claims about institutional codes. Re-running initialization is additive and idempotent: it does not delete Management-approved departments or create users, organizers, events, audits, or Management credentials. Missing departments continue through the event suggestion and Management approval workflow.

# How to change a decision

If a decision must change:

1. add a new decision entry;
2. mark the old decision superseded;
3. update `YCEP_V1_SPEC.md`;
4. update affected tasks/tests;
5. record the change in `DEVELOPMENT_LOG.md`.
