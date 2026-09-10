# YCEP V1 — Implementation Roadmap

Do not attempt to build the entire product in one prompt.

Each milestone should end with working code, relevant tests, migration status, and an updated `DEVELOPMENT_LOG.md`.

# Milestone 0 — Repository Discovery & Architecture Freeze

- [ ] Inspect repository structure.
- [ ] Identify backend framework.
- [ ] Identify frontend approach.
- [ ] Identify database.
- [ ] Identify existing authentication system.
- [ ] Identify current models/schema.
- [ ] Identify deployment/environment setup.
- [ ] Identify test framework.
- [ ] Compare current project with `YCEP_V1_SPEC.md`.
- [ ] List conflicts/gaps.
- [ ] Propose implementation architecture.
- [ ] Freeze the stack before major implementation.

**Exit condition:** Team understands the existing codebase and agrees how YCEP V1 will be implemented.

# Milestone 1 — Core Identity

- [ ] User registration.
- [ ] Unique matric number.
- [ ] Full name.
- [ ] Email.
- [ ] Department.
- [ ] Level.
- [ ] Password/login/logout.
- [ ] Verification status.
- [ ] Verification expiry/year.
- [ ] Expired-verification guards.
- [ ] Account history survives expiry.

Tests:

- [ ] duplicate matric rejected;
- [ ] expired account cannot perform protected actions;
- [ ] expired account can still access permitted history/login;
- [ ] passwords stored securely.

# Milestone 2 — Admin Foundation

- [ ] YABATECH Management admin role/account.
- [ ] Admin dashboard foundation.
- [ ] Admin-only authorization guard.
- [ ] Basic audit logging for sensitive actions.

# Milestone 3 — Organizer Verification

- [ ] Organizer application model/form.
- [ ] Requested public organizer name.
- [ ] Optional represented organization.
- [ ] Position/role.
- [ ] Reason/evidence fields.
- [ ] Pending organizer queue.
- [ ] Admin approve/reject.
- [ ] Admin revoke.
- [ ] Yearly organizer expiry.
- [ ] Reapproval flow.

# Milestone 4 — Event Foundation

- [ ] Event model.
- [ ] Event categories.
- [ ] Draft state.
- [ ] Title.
- [ ] Description.
- [ ] Optional banner/poster.
- [ ] Date.
- [ ] Start/end time.
- [ ] Venue.
- [ ] Public organizer display identity.
- [ ] Primary organizer.
- [ ] Co-organizer relation.
- [ ] Target department(s).
- [ ] Target level(s).
- [ ] Participation mode.
- [ ] Optional deadline.
- [ ] Optional registration limit.
- [ ] Eligibility configuration.

# Milestone 5 — Event Approval

- [ ] Organizer submits draft.
- [ ] Pending approval state.
- [ ] Admin approval queue.
- [ ] Approve.
- [ ] Reject with reason.
- [ ] Approved event becomes public.
- [ ] Rejected event remains historical/editable as designed.

# Milestone 6 — Public Discovery

- [ ] Public homepage.
- [ ] Upcoming events.
- [ ] Event details.
- [ ] Search.
- [ ] Category filtering.
- [ ] Date filtering.
- [ ] Completed/cancelled status display where appropriate.
- [ ] Simple relevance/recommendation using stored department/level and target audience.

# Milestone 7 — Open Registration

- [ ] Register action.
- [ ] Duplicate prevention.
- [ ] Registration deadline.
- [ ] Eligibility checks.
- [ ] Registration-limit enforcement.
- [ ] Unlimited registration.
- [ ] Member cancellation.
- [ ] Registration history.

# Milestone 8 — Approval-Based Applications

- [ ] Apply action.
- [ ] Up to 5 organizer-defined text questions.
- [ ] Store application answers.
- [ ] Pending state.
- [ ] Organizer/co-organizer applicant list.
- [ ] Approve.
- [ ] Reject.
- [ ] Prevent reapplication after rejection unless decision is reversed.
- [ ] Registration-limit enforcement based on approved count only.

# Milestone 9 — Organizer Event Management

- [ ] Participant/applicant management.
- [ ] Necessary participant account details.
- [ ] Co-organizer permissions.
- [ ] Primary-organizer-only sensitive controls.
- [ ] Optional CSV export if low-cost.

# Milestone 10 — Event Updates & Reapproval

- [ ] Edit operational fields.
- [ ] Preserve registrations.
- [ ] Track/notify date/time/venue/deadline changes.
- [ ] Detect fundamental changes.
- [ ] Trigger reapproval for title/core-purpose/organizer identity changes.

# Milestone 11 — Event Cancellation

- [ ] Primary organizer/admin cancel action.
- [ ] Cancellation reason.
- [ ] Preserve participants/applications.
- [ ] Cancelled status.
- [ ] Historical event visibility.

# Milestone 12 — Attendance

- [ ] Participant attendance view.
- [ ] Mark present.
- [ ] Attendance separate from registration.
- [ ] No-show derivation after event.

# Milestone 13 — Email Notifications

Implement email delivery through a configurable service/interface.

- [ ] registration confirmation;
- [ ] application submitted;
- [ ] application approved/rejected;
- [ ] organizer approved/rejected;
- [ ] event approved/rejected;
- [ ] event update;
- [ ] event cancellation;
- [ ] reminder.

# Milestone 14 — History & Dashboards

Member:

- [ ] registrations;
- [ ] applications;
- [ ] completed events;
- [ ] cancelled events;
- [ ] account verification status.

Organizer:

- [ ] drafts;
- [ ] pending approval;
- [ ] published;
- [ ] completed;
- [ ] cancelled;
- [ ] participant counts;
- [ ] application counts.

Admin:

- [ ] organizer queue;
- [ ] event queue;
- [ ] important platform records;
- [ ] audit/activity view.

# Milestone 15 — Security & Data Integrity Pass

- [ ] Backend authorization review.
- [ ] Secret/environment review.
- [ ] File upload validation.
- [ ] Input validation.
- [ ] Duplicate constraints.
- [ ] Status transition validation.
- [ ] Registration-limit race-condition review.
- [ ] CSRF/session protection according to framework.
- [ ] Sensitive data exposure review.

# Milestone 16 — QA & Acceptance

Run every acceptance scenario from `YCEP_V1_SPEC.md`.

- [ ] public discovery;
- [ ] organizer verification;
- [ ] event approval;
- [ ] open registration;
- [ ] approval application;
- [ ] target audience vs eligibility;
- [ ] cancellation;
- [ ] event updates;
- [ ] attendance;
- [ ] yearly expiry;
- [ ] permissions;
- [ ] email behaviour.

**Exit condition:** V1 flow succeeds without manual database edits.

# Milestone 17 — Deployment Readiness

- [ ] Production environment configuration.
- [ ] Database migration strategy.
- [ ] Static/media storage.
- [ ] Email configuration.
- [ ] Environment secrets.
- [ ] Error logging.
- [ ] Backup approach.
- [ ] Domain/HTTPS.
- [ ] Admin credential handover process.
- [ ] Production smoke test.

Do not deploy secrets into source control.
