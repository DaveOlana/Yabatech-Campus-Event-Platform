# YCEP V1 — Product & Functional Specification

## 1. Product name

**YCEP — YABATECH Campus Events Platform**

## 2. Product definition

YCEP is a centralized event discovery, registration, application, management, and attendance platform for the Yaba College of Technology community.

The main purpose is to give the school one trusted place where people can discover what is happening across YABATECH while verified organizers can create and manage events under YABATECH Management oversight.

YCEP is not intended to replace physical venue approval or become a full event-planning/budgeting system in V1.

## 3. Core problem

Event information inside YABATECH can be fragmented across WhatsApp groups, social media, physical flyers/posters, word of mouth, departmental channels, student associations, and informal announcements.

This causes poor event discovery, missed information, repeated questions about date/time/venue, inconsistent registration methods, manual participant management, weak attendance records, and no central historical archive of campus events.

YCEP centralizes these functions.

---

# 4. V1 users and roles

## 4.1 Public visitor

No account required.

Can:

- browse events;
- search events;
- filter events;
- open event details;
- view public event information.

Cannot:

- register/apply;
- create events;
- view private participant information.

## 4.2 Member

A normal YCEP account associated with YABATECH matric details.

Can:

- log in;
- maintain profile information;
- register for open-registration events;
- apply for approval-required events;
- cancel own registration/application where permitted;
- view personal event history;
- apply to become an organizer.

## 4.3 Verified organizer

Organizer is a capability attached to a normal YCEP account.

A member becomes an organizer only after approval by YABATECH Management.

Can:

- create events;
- save event drafts;
- submit events for approval;
- manage approved/published events they own or co-organize;
- view necessary participant/applicant account details for their events;
- approve/reject applications where the event requires approval;
- manage attendance;
- update event information within the defined rules.

Organizer privilege expires with the yearly verification cycle and must be reapproved.

## 4.4 Primary organizer

Every event has exactly one primary organizer.

The primary organizer is the event owner.

Can additionally:

- cancel the event;
- add/remove co-organizers;
- control sensitive event actions;
- retain final responsibility for the event.

## 4.5 Co-organizer

An event may have multiple co-organizers.

Co-organizers must already be verified YCEP organizers.

They may assist with applicant review, participant management, attendance, and ordinary event management.

They do not automatically receive ownership-level actions such as event cancellation or ownership transfer.

## 4.6 Administrator

The administrator represents **YABATECH Management**.

V1 uses a dedicated management account/role.

The admin account does not expire yearly.

Can:

- approve/reject organizer applications;
- revoke organizer privileges;
- approve/reject events;
- manage platform records;
- review important activity;
- manage exceptional cases.

Important administrative actions should be logged.

---

# 5. Account and verification model

## 5.1 Account data and role differentiation

All accounts require:
- full name;
- email (unique);
- password/authentication data;
- role (`MEMBER` | `ADMIN`).

Role differentiation for academic identity fields:
- For `MEMBER` users, academic identity fields (`matricNumber`, `department`, `level`) are mandatory.
- For `ADMIN` users (representing YABATECH Management), academic identity fields must be null.
- These invariants are enforced at the database level using two PostgreSQL CHECK constraints:
  1. `User_member_academic_identity_check`:
     `"role" != 'MEMBER' OR ("matric_number" IS NOT NULL AND "department_id" IS NOT NULL AND "level_id" IS NOT NULL)`
  2. `User_admin_no_academic_identity_check`:
     `"role" != 'ADMIN' OR ("matric_number" IS NULL AND "department_id" IS NULL AND "level_id" IS NULL)`
- Exactly one dedicated `ADMIN` account exists in V1, enforced at the database level via a PostgreSQL partial unique index:
  `CREATE UNIQUE INDEX "User_one_admin" ON "User" ("role") WHERE "role" = 'ADMIN'`
- Ordinary member login remains matric-number based (`POST /login` with matric number and password).
- The dedicated YABATECH Management account authenticates separately using email (`POST /admin/login` with email and password).
- There is no public admin registration route; the admin account is provisioned via an environment-based CLI bootstrap script (`npm run admin:bootstrap`).
- Admin credentials can later be transferred or rotated by changing the credentials of the single account.
- `/account` remains strictly the `MEMBER` account area; authenticated `ADMIN` users accessing `/account` are redirected to `/admin`.

## 5.2 Matric number

Matric number is accepted as the institutional identifier for V1.

V1 enforces one account per matric number.

Matric number rules:
- Matric numbers are manually entered by the user.
- General accepted structure: `PREFIX/PROGRAMME/YEAR/SERIAL`.
- Examples: `F/ND/24/3210051`, `PT/HND/25/2100001`.
- Normalization: trim leading and trailing whitespace, remove harmless whitespace around `/` separators, and convert letters to uppercase.
- Only the normalized matric number is stored, and uniqueness is enforced across all accounts.
- V1 structural validation regex: `^[A-Z]{1,4}/[A-Z]{2,4}/\d{2}/\d{7}$`.
- YCEP does not claim this proves that the matric number exists in the central YABATECH database.
- Department and level are entered and selected independently and are not inferred from the matric number.

## 5.3 Password requirements

- Member-registration password minimum length for V1 is 8 characters.
- Admin bootstrap password minimum length for V1 is 12 characters, and unchanged default placeholder passwords are rejected.

## 5.4 Normal member verification

A new member who provides a matric number matching YCEP's configured YABATECH matric-number validation rules, and whose matric number is not already registered, automatically receives `ACTIVE` verification for the current yearly cycle upon successful registration.

Normal member registration does **not** require manual administrator approval.

Manual YABATECH Management approval begins only when a member applies for organizer privileges.

## 5.5 Yearly expiry

Accounts are not deleted yearly.

Instead, yearly verification expires.

When verification expires:

- account remains;
- history remains;
- previous events/registrations remain;
- protected actions become unavailable until renewal.

Protected actions include registration/application and organizer actions.

## 5.5 Organizer expiry

Organizer privileges also expire yearly.

After normal verification is renewed, organizer privileges require YABATECH Management reapproval.

This is intentional because student organizational authority may change yearly.

## 5.6 Admin continuity and audit logging

The YABATECH Management admin role/account remains constant and does not follow the yearly member expiry rule. ADMIN users do not require `MemberVerification` records. The dedicated YABATECH Management account authenticates separately using email.

Privileged administrative operations are tracked in an immutable, append-only `AuditLog` table.
- Normal update/delete operations on audit logs are prohibited in application code.
- Audit records defensively exclude sensitive authentication data (passwords, hashes, session secrets, tokens).
- Transactional invariant: When an admin performs a privileged database mutation in future milestones, the mutation and its audit entry must be written in the same database transaction wherever practical.

---

# 6. Organizer verification

A normal verified member may request organizer privileges.

Organizer capability is not a separate user role. Roles remain strictly `MEMBER` and `ADMIN`. Instead, organizer is an approved, cycle-bound capability granted to a verified `MEMBER` by YABATECH Management.

The architecture separates the historical application record from the granted capability.

## 6.1 Two-entity model

### `OrganizerApplication`
An immutable/state-tracked historical record of an organizer request:
- `user_id`: Reference to applicant (`MEMBER`).
- `cycle_id`: Academic cycle in which the request was submitted.
- `requested_public_name`: Required public display name representing the organizer identity (trimmed, 2–100 chars).
- `phone_number`: Required contact phone number (digits, `+`, spaces, hyphens, parentheses; 7–20 chars).
- `organization_name`: Optional represented organization, association, club, or department body (trimmed, max 150 chars). Note: Public organizer identity (`requested_public_name`) and represented organization (`organization_name`) are strictly separate concepts.
- `position_title`: Optional title or position within the represented organization (trimmed, max 100 chars).
- `reason`: Required statement of intent and rationale for requesting organizer privileges (trimmed, min 10, max 1000 chars).
- `evidence_url_or_text`: Optional reference link or supporting qualification text (trimmed, max 1000 chars).
- `status`: `PENDING`, `APPROVED`, or `REJECTED`.
- `reviewed_at`, `reviewed_by_admin_id`: Review timestamp and admin reference.
- `rejection_reason`: Feedback notes provided by admin if rejected (required on rejection, min 5, max 500 chars).

Database invariant: Enforced via PostgreSQL partial unique index:
`CREATE UNIQUE INDEX "OrganizerApplication_one_pending_per_cycle" ON "OrganizerApplication" ("user_id", "cycle_id") WHERE "status" = 'PENDING'`

### `OrganizerAuthorization`
The active capability record granting organizer authority for a specific cycle:
- `user_id`: Reference to authorized member.
- `cycle_id`: Academic cycle for which authorization is valid.
- `approved_public_name`: Approved public organizer display name, copied directly from `OrganizerApplication.requested_public_name`.
- `status`: `ACTIVE`, `REVOKED`, or `EXPIRED`.
- `revoked_at`, `revocation_reason`: Recorded when an admin revokes an active authorization (required on revocation, min 5, max 500 chars).

Database invariant: Exactly one `OrganizerAuthorization` per member per cycle (`@@unique([userId, cycleId])`).

## 6.2 Application & reapplication rules

1. **Eligibility:** Only authenticated `MEMBER` users with an `ACTIVE` `MemberVerification` in the currently active `AcademicYearCycle` can submit an application.
2. **Dedicated ADMIN Exclusion:** The dedicated `ADMIN` account cannot apply for or be granted organizer privileges.
3. **Rejection & Reapplication:** A `REJECTED` application permits a fresh application within the same cycle, retaining all previous application records for historical audit.
4. **Authorization Finality:** If an `OrganizerAuthorization` exists for a member in a cycle (`ACTIVE`, `REVOKED`, or `EXPIRED`), no new applications may be submitted for that cycle. Revocation is final for that academic cycle.

## 6.3 Derived current-cycle expiry & authorization guard

- An authorization confers authority only if its `cycleId` matches the currently active cycle (`isCurrent: true`) and the member's `MemberVerification` in that cycle is `ACTIVE`.
- `requireOrganizer` middleware inspects live database state on every request. Stale session capabilities are not permitted.
- Applications submitted in prior cycles cannot be reviewed or approved once the cycle rolls over.

## 6.4 Concurrency, locking & transactional audit logging

- Administrative review operations (`approve`, `reject`) and authorization revocations (`revoke`) execute inside PostgreSQL transactions utilizing row-level locks via `SELECT ... FOR UPDATE`.
- Concurrent reviews resolve deterministically without race conditions or orphan state.
- Every state mutation writes an append-only `AuditLog` entry in the same transaction:
  - `ORGANIZER_APPLICATION_APPROVED`
  - `ORGANIZER_APPLICATION_REJECTED`
  - `ORGANIZER_AUTHORIZATION_REVOKED`
- If audit logging fails, the transaction is rolled back completely.

## 6.5 Public organizer identity

An organizer may operate publicly as an individual, e.g. `DaveOlana`, or a recognized organization/association label, e.g. `NACOS YABATECH`.

The underlying login account still belongs to a real person.

YCEP V1 does not require a separate organization-account authentication system.

---

# 7. Event lifecycle

Recommended event states:

1. `DRAFT`
2. `PENDING_APPROVAL`
3. `PUBLISHED`
4. `COMPLETED`
5. `REJECTED`
6. `CANCELLED`

A previously approved event may return to a review state when a fundamental approved field changes.

## 7.1 Basic flow

Organizer creates draft → submits for approval → admin reviews → approve/reject → approved event becomes public → registrations/applications occur → event takes place → attendance recorded → event becomes completed.

Cancelled and rejected events remain in historical records as appropriate.

---

# 8. Event information

Each event should support at least:

## Basic information

- title;
- description;
- category;
- optional banner/poster image;
- public organizer display name.

## Schedule

- date;
- start time;
- end time;
- venue.

Venue information is informational.

YCEP does not reserve or authorize physical YABATECH venues in V1.

Organizers are expected to complete physical venue confirmation outside YCEP.

## Discovery/recommendation audience

Organizer may select target department(s) and target level(s).

These values help YCEP surface relevant events.

They do not automatically restrict who may attend.

## Participation configuration

Organizer chooses one:

1. No registration required
2. Open registration
3. Approval-required application

Optional:

- registration/application deadline;
- registration limit;
- eligibility restriction;
- application questions.

---

# 9. Public visibility

All approved/published events are publicly visible.

YCEP V1 does not create hidden/private/department-only event pages.

Anyone can discover an event.

Whether a member may participate is controlled separately by event eligibility.

---

# 10. Recommended audience vs eligibility

These are different concepts and must be modeled using independent schema relationships.

Do not model department + level as a single nullable pair.

Use independent relationships equivalent to:

- `EventTargetDepartment`
- `EventTargetLevel`
- `EventEligibleDepartment`
- `EventEligibleLevel`

## 10.1 Recommended audience

Used for discovery, search filtering, and relevance.

Target departments/levels influence discovery only and **never** automatically block participation.

This does not block other users from viewing or participating in the event.

## 10.2 Registration eligibility

Optional organizer-controlled restriction governing who may register or apply.

Default: **Any active/verified YCEP member may register/apply.**

### Evaluation rules

1. **No eligible departments selected:** All departments are allowed.
2. **No eligible levels selected:** All levels are allowed.
3. **Department restrictions exist:** The member must belong to an allowed department.
4. **Level restrictions exist:** The member must belong to an allowed level.
5. **Both restrictions exist:** The member must satisfy both (belong to an allowed department AND an allowed level).
6. **Target departments/levels:** Influence discovery only and never automatically block participation.

The event remains publicly visible even when a member is ineligible to participate.

The system should explain why registration/application is unavailable if an ineligible member views the event.

---

# 11. Participation modes

## 11.1 No registration required

Used for informational/open events.

Users view details only.

No registration record is required.

## 11.2 Open registration

Member clicks Register.

If valid:

- registration is created immediately;
- status becomes registered;
- email confirmation is sent.

## 11.3 Approval-required application

Member clicks Apply.

Application becomes pending.

Organizer/co-organizer can approve or reject.

Approved applicants receive email notification.

---

# 12. Application questions

V1 supports simple organizer-defined text questions.

Default V1 limit: **maximum 5 text questions per event.**

No advanced form-builder behaviour is required.

No file-upload questions are required in V1.

This limit is an implementation default and may be revised intentionally later.

---

# 13. Registration limits

Registration limit is optional.

Values:

- unlimited;
- numeric ceiling.

It represents the number of accepted/registered participants the organizer chooses to allow.

It is not necessarily equal to physical venue capacity.

## 13.1 Open registration

Registered participants count toward the limit.

When the limit is reached, further registrations are closed unless a slot becomes available through cancellation or the organizer increases the limit.

## 13.2 Approval-based applications

Pending applications do **not** count toward the limit.

Approved applications count toward the limit.

Example:

- limit: 250
- pending: 350
- approved: 185

Organizer may still approve 65 additional applicants.

The system must prevent approval beyond the configured limit.

## 13.3 No waitlist

V1 does not include automated waitlists.

## 13.4 Database concurrency & limit enforcement

Registration limits must be enforced transactionally to eliminate race conditions and overbooking.

PostgreSQL is the mandatory database for both development and production (SQLite is prohibited).

When numeric registration-limit logic is implemented, concurrency must be handled using PostgreSQL transactions and an appropriate synchronization/locking strategy (such as row-level locking via `SELECT ... FOR UPDATE` or serializable transaction isolation).

---

# 14. Duplicate participation

A member may not maintain multiple active registrations/applications for the same event.

For approval-required events:

- one application per account per event;
- rejected applicants do not automatically reapply;
- organizer/admin may reverse a decision if necessary.

---

# 15. User cancellation

Members may cancel their own registration/application.

Cancellation should preserve history, free a registration-limit slot when relevant, and not hard-delete the record.

---

# 16. Organizer access to participant data

For their own events, authorized organizers may see necessary participant/applicant information such as:

- name;
- matric number;
- department;
- level;
- email;
- application answers;
- participation status;
- attendance status.

Organizers must not see passwords, authentication secrets, unrelated event history, or security/internal admin data.

Public visitors and unrelated members must not see participant lists.

---

# 17. Attendance

Attendance is separate from registration/application.

V1 attendance is intentionally simple.

Organizer/co-organizer may mark a participant as present.

Suggested attendance states:

- not checked in;
- present.

A no-show can be derived after an event from an accepted/registered participant who was not marked present.

QR attendance is not required in V1.

---

# 18. Event updates

Approved events may need updates.

## 18.1 Operational changes

Examples:

- date;
- time;
- venue;
- registration deadline;
- registration limit.

These may be updated while preserving registrations/applications, recording the change where appropriate, and emailing affected participants.

## 18.2 Fundamental changes

Examples:

- title;
- primary organizer/public organizer identity;
- main purpose/core description.

These should trigger administrative reapproval before the changed version is treated as approved.

---

# 19. Event cancellation

Published events should not be hard-deleted as the normal cancellation mechanism.

Primary organizer/admin can cancel an event.

Cancellation should:

- require/store a reason;
- mark the event cancelled;
- preserve registrations/applications;
- email affected participants;
- preserve historical visibility/records.

---

# 20. Email notifications

Email is the only required notification channel in V1.

No SMS, WhatsApp, or push-notification infrastructure is required.

Recommended email events:

- organizer application approved/rejected;
- organizer privilege revoked/expired where applicable;
- event approved/rejected;
- registration confirmation;
- application submitted;
- application approved/rejected;
- registration/application cancelled;
- event changed;
- event cancelled;
- event reminder.

---

# 21. Event history

Events should not disappear after their date.

Useful states/filters include upcoming, ongoing, completed, and cancelled.

Completed events should remain as a historical campus-event archive.

---

# 22. Search and discovery

Public event discovery should support:

- homepage with upcoming events;
- search;
- category filtering;
- date filtering;
- event details;
- simple recommendations based on stored department/level and organizer-selected target audience.

No machine-learning recommendation engine is required.

---

# 23. Admin responsibilities

YABATECH Management should be able to:

- review organizer requests;
- approve/reject organizers;
- revoke organizer privileges;
- review event submissions;
- approve/reject events;
- review cancelled/rejected/completed event history;
- view important platform activity;
- intervene in exceptional records where necessary.

Because V1 may use a shared/dedicated management account, the audit log identifies the admin account action but may not identify the exact human who used the shared credentials.

---

# 24. Audit/history

Important actions should be logged where practical.

Examples:

- organizer approved/rejected/revoked;
- event approved/rejected;
- event cancelled;
- major event change;
- admin change to a sensitive record.

Audit logs should not expose secrets.

---

# 25. CSV export

Participant export is useful but is **not a core V1 acceptance blocker**.

If implemented in V1, a simple CSV export is sufficient.

Do not delay core functionality for spreadsheet export.

---

# 26. Explicitly outside V1

Do not implement unless V1 is intentionally revised:

- payments;
- QR-code attendance;
- SMS notifications;
- WhatsApp integration;
- push notifications;
- venue booking/reservation authority;
- physical venue clash resolution;
- automated waitlists;
- full organization-account system;
- budgeting;
- vendor management;
- event-task planning;
- certificates;
- comments/reviews;
- ratings;
- complex private events;
- advanced analytics;
- machine-learning recommendations;
- file-upload application questions.

---

# 27. Privacy and security

V1 must enforce basic web security including hashed passwords, backend authorization, secure session/authentication handling, environment-based secrets, input validation, safe file/image upload handling, no public participant lists, no unauthorized organizer access to other events, unique matric-number enforcement, and protection against duplicate participation.

## 27.1 Frozen engineering baseline

The technology baseline for YCEP V1 is frozen as follows:

- **Runtime:** Node.js 24, TypeScript
- **Backend:** Express.js
- **Frontend:** EJS server-rendered templates, Vanilla JavaScript, Vanilla CSS
- **Database:** PostgreSQL (for both development and production; SQLite is prohibited)
- **ORM:** Prisma
- **Validation:** Zod
- **Authentication:** Session-based authentication, secure HTTP-only cookies, bcrypt password hashing
- **Email:** Nodemailer behind an `EmailService` abstraction (development environments must not require real production email credentials)
- **Testing:** Vitest, Supertest

---

# 28. Core entities

The domain requires the following relational entities:

- `User`
- `Department`
- `Level`
- `AcademicYearCycle`
- `MemberVerification`
- `OrganizerProfile` / `OrganizerApplication`
- `Event`
- `EventCategory`
- `EventCoOrganizer`
- `EventTargetDepartment` (discovery/recommendation)
- `EventTargetLevel` (discovery/recommendation)
- `EventEligibleDepartment` (registration restriction)
- `EventEligibleLevel` (registration restriction)
- `ApplicationQuestion` (max 5 simple text questions)
- `EventParticipation` (handles registration & application states)
- `ApplicationAnswer`
- `AttendanceRecord`
- `EventChangeLog`
- `AuditLog`
- `EmailNotificationLog`

The schema must preserve the behaviour defined in this specification.

---

# 29. Permission matrix

| Action | Public | Active Member | Verified Organizer | Co-organizer | Primary Organizer | Admin |
|---|---:|---:|---:|---:|---:|---:|
| Browse public events | Yes | Yes | Yes | Yes | Yes | Yes |
| Search/filter | Yes | Yes | Yes | Yes | Yes | Yes |
| Register/apply | No | Yes | Yes | Yes | Yes | As permitted |
| Cancel own participation | No | Yes | Yes | Yes | Yes | As permitted |
| Apply for organizer status | No | Yes | N/A | N/A | N/A | No |
| Create event | No | No | Yes | Yes | Yes | Yes |
| Submit event for approval | No | No | Yes | Depending on ownership | Yes | Yes |
| View own event applicants | No | No | Own only | Assigned event | Assigned event | Yes |
| Approve/reject applicants | No | No | Own only | Assigned event | Assigned event | Yes |
| Mark attendance | No | No | Own only | Assigned event | Assigned event | Yes |
| Add/remove co-organizers | No | No | No | No | Yes | Yes |
| Cancel event | No | No | No | No | Yes | Yes |
| Approve organizers | No | No | No | No | No | Yes |
| Approve events | No | No | No | No | No | Yes |
| Revoke organizer privilege | No | No | No | No | No | Yes |

Implementation should use explicit authorization rules rather than relying only on this UI-oriented table.

---

# 30. Acceptance scenarios

## Scenario A — Public discovery

A visitor without an account can browse published events, search them, filter them, and open event details.

## Scenario B — Open registration

An active verified member opens an eligible open-registration event and clicks Register.

Expected:

- duplicate participation is prevented;
- registration is created;
- limit is enforced if configured;
- confirmation email is queued/sent;
- registration appears in user history.

## Scenario C — Approval-required event

An active verified member submits an application with required answers.

Expected:

- application becomes pending;
- pending application does not consume the accepted-participant limit;
- organizer can approve/reject;
- approval cannot exceed registration limit;
- member receives decision email.

## Scenario D — Recommendation vs eligibility

An ND2 Computer Science member sees an event recommended to ND1.

If eligibility is unrestricted, the member may register.

If eligibility is ND1-only, the member can still view the event but cannot register, and the system explains ineligibility.

## Scenario E — Organizer approval

A normal active member cannot create events until organizer approval is granted.

After YABATECH Management approves, organizer tools become available.

When yearly organizer status expires, organizer actions become unavailable until reapproved.

## Scenario F — Event approval

A verified organizer creates a draft and submits it.

The event is not publicly published until YABATECH Management approves it.

## Scenario G — Event update

Organizer changes date/time/venue for a published event.

Expected:

- existing registrations remain;
- update is preserved;
- affected participants receive email notification.

A fundamental title/core-purpose change triggers reapproval.

## Scenario H — Cancellation

Primary organizer cancels a published event.

Expected:

- event becomes cancelled;
- reason is stored;
- participant records remain;
- affected participants receive email;
- event is not silently deleted.

## Scenario I — Attendance

Organizer opens participants and marks present attendees.

Expected:

- attendance remains separate from registration status;
- registered-but-not-present users can later be identified as no-shows.

## Scenario J — Yearly expiry

A member's yearly verification expires.

Expected:

- account and history remain;
- public browsing remains available;
- protected member actions become unavailable until renewal.

---

# 31. V1 product boundary

YCEP V1 is complete when the core trusted campus-event loop works reliably:

**discover → verify → become organizer → create → admin approve → publish → register/apply → organizer manage → attend → preserve history**

New features should not be added to V1 simply because they are technically possible.
