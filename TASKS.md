# YCEP V1 — Implementation Roadmap

This roadmap follows the approved publishing/discovery pivot. Registration-era functionality is not an active V1 requirement.

Each milestone ends with working code, relevant tests, migration status, and an updated `DEVELOPMENT_LOG.md`.

# Milestones 0–3 — Foundation

- [x] Repository discovery and frozen engineering architecture.
- [x] Member identity, secure authentication, and yearly verification.
- [x] Dedicated YABATECH Management account and audit foundation.
- [x] Organizer application, approval/rejection, authorization, revocation, expiry, and live authorization guard.

# Milestone 4A — Event Draft Foundation

- [x] Authorization-bound event ownership.
- [x] Categories, title, description, poster URL, schedule, and venue.
- [x] Draft creation, listing, detail, and editing.
- [x] Target departments and levels.
- [x] Server-derived organizer public identity.
- [x] Draft permission and validation tests.

Registration-era fields/relations introduced here are legacy structures pending simplification review. Do not extend them as V1 features.

# Legacy Milestone 4A Simplification — COMPLETE

- [x] Preflight development and test data.
- [x] Remove registration-era schema structures with a forward migration.
- [x] Simplify validator, service, routes, and organizer views.
- [x] Rewrite event-draft coverage around the D-049 contract.
- [x] Retain `EventTargetDepartment` and `EventTargetLevel` for discovery relevance.

# Milestone 4B — Event Submission and Management Approval — COMPLETE

- [x] Owner submits `DRAFT` to `PENDING_APPROVAL`.
- [x] Reject duplicate, stale, and unauthorized submissions.
- [x] Management pending-event queue and review view.
- [x] Approve pending event to `PUBLISHED` only while organizer trust remains effective.
- [x] Reject pending event with required feedback.
- [x] Keep rejected events terminal and view-only for this milestone.
- [x] Audit important submission/review transitions atomically.
- [x] Transactionally lock contested decisions.
- [x] Test permissions, valid flow, invalid transitions, and trust changes.

# Milestone 5 — Publication and Public Discovery — Not Started

- [ ] Publish approved events only.
- [ ] Public flyer/poster-centered event feed.
- [ ] Public event detail page.
- [ ] Upcoming-event ordering.
- [ ] Exclude drafts, pending, and rejected events from public routes.
- [ ] Display cancelled/completed history where appropriate.
- [ ] Verify visitors require no account.

# Milestone 6 — Search, Filtering, and Relevance

- [ ] Keyword/title search.
- [ ] Category and date filtering.
- [ ] Target-department and target-level filtering/relevance.
- [ ] Keep every published event discoverable regardless of target audience.
- [ ] Test empty results, combined filters, and private-data exclusion.

# Milestone 7 — Event Management and Historical Integrity

- [ ] Define permitted published-event edits.
- [ ] Trigger reapproval for fundamental changes.
- [ ] Preserve approval/publication history.
- [ ] Primary-organizer/Management cancellation with reason.
- [ ] Preserve cancelled and completed events.
- [ ] Review co-organizer need; do not add without approved permissions.

# Milestone 9 — Layer 1 UI and Content Polish

- [ ] Responsive, accessible flyer/poster cards and detail pages.
- [ ] Clear public event information and fallback imagery.
- [ ] Accessible organizer/Management workflows.
- [ ] Empty, loading, validation, and error states.
- [ ] Image/flyer validation.

# Milestone 10 — Security, QA, and Acceptance

- [ ] Backend authorization and status-transition review.
- [ ] CSRF/session, secrets, input, and image/file security review.
- [ ] Concurrency and sensitive-data exposure review.
- [ ] Run all simplified-V1 acceptance scenarios.
- [ ] Confirm public routes expose published data only.
- [ ] Confirm yearly expiry preserves history while blocking protected actions.

# Milestone 11 — Deployment Readiness

- [ ] Production configuration, secrets, and PostgreSQL migration strategy.
- [ ] Static/media storage, logging, and backups.
- [ ] Domain and HTTPS.
- [ ] Admin credential handover.
- [ ] Production smoke test of the complete Layer 1 lifecycle.

# Layer 2 — External Registration Links (Deferred)

Do not begin until Layer 1 is complete and this feature has an approved design.

- [ ] Design an optional external registration URL.
- [ ] Define URL validation and safe external-link behavior.
- [ ] Design the public “Register” / “Learn More” action.
- [ ] Consider guidance for Luma, Google Forms, Microsoft Forms, Eventbrite, and similar services.
- [ ] Make clear YCEP does not track/synchronize registration status.

# Removed from active V1 roadmap

- Internal attendee registration/applications and answers.
- Participant/applicant management.
- Registration limits/deadline enforcement, cancellation, and history.
- Attendance, no-shows, QR attendance, and waitlists.
- Registration confirmation/reminder emails.

**V1 exit condition:** The trusted organizer-to-publication loop works end to end without manual database edits, and a visitor can discover approved events without an account.
