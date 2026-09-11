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
- Atomic session safety: if audit log creation fails during `POST /admin/login`, the session is destroyed and the user is not left in a privileged session. On logout, session destruction proceeds even if audit logging fails.
- Frozen rule for future milestones: When an admin performs a privileged database mutation, the mutation and its audit record must be written in the same database transaction wherever practical.

# How to change a decision

If a decision must change:

1. add a new decision entry;
2. mark the old decision superseded;
3. update `YCEP_V1_SPEC.md`;
4. update affected tasks/tests;
5. record the change in `DEVELOPMENT_LOG.md`.

