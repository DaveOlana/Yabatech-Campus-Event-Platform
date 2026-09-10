# YCEP — Development Log

Use this file as the handoff record between Claude, Gemini, Codex, and human developers.

Newest entries should be added at the top.

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
