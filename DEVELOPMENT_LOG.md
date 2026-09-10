# YCEP — Development Log

Use this file as the handoff record between Claude, Gemini, Codex, and human developers.

Newest entries should be added at the top.

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
