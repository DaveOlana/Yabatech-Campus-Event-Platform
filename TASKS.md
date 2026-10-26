# YCEP V1 — Implementation Roadmap

This roadmap follows the approved publishing/discovery pivot. Registration-era functionality is not an active V1 requirement.

Each milestone ends with working code, relevant tests, migration status, and an updated `DEVELOPMENT_LOG.md`.

# Milestones 0–3 — Foundation

- [x] Repository discovery and frozen engineering architecture.
- [x] Member identity, secure authentication, and yearly verification.
- [x] Dedicated YABATECH Management account and audit foundation.
- [x] Dedicated normalized Management username login, self-service credential changes, and CLI password reset.
- [x] Vercel Fluid-compute and Neon production adaptation, shared-session migration, readiness, and production reference-data command.
- [x] Organizer application, approval/rejection, authorization, revocation, expiry, and live authorization guard.

# Milestone 4A — Event Draft Foundation

- [x] Authorization-bound event ownership.
- [x] Categories, title, description, managed poster upload, schedule, and venue. Poster optionality at this historical milestone was superseded by D-065.
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

# Milestone 4C — Public Event Discovery — COMPLETE

- [x] Publish approved events only.
- [x] Public flyer/poster-centered event feed.
- [x] Public event detail page, including direct access to past published events.
- [x] Upcoming-event ordering in Africa/Lagos calendar context, capped at 24.
- [x] Exclude every non-published status from public routes with a generic 404.
- [x] Verify visitors require no account and internal data is not projected.

# Milestone 4D — Search, Filtering, and Relevance — COMPLETE

- [x] Case-insensitive public search across approved event fields.
- [x] Category and Africa/Lagos calendar-date filtering.
- [x] Target-department and target-level relevance filtering.
- [x] Include untargeted general events under audience filters.
- [x] URL-driven state, accurate counts, and a retained 24-card cap.
- [x] Test empty results, combined filters, validation, and private-data exclusion.

# Milestone 4E — Event Management and Historical Integrity — COMPLETE

- [x] Keep published events immutable in V1.
- [x] Derive Today, Upcoming, and Past without lifecycle mutation.
- [x] Preserve approval/publication/rejection history.
- [x] Owner and Management cancellation with a public reason.
- [x] Preserve cancelled events and keep `COMPLETED` unused.
- [x] Separate the pending queue from Management event history.

# Milestone 4F — Final V1 UI Polish and Acceptance — COMPLETE

- [x] Responsive, accessible flyer/poster cards and editorial event details.
- [x] Compact public discovery controls, clear result context, and intentional fallback artwork.
- [x] Consistent organizer, Management, account, authorization, and authentication surfaces.
- [x] Polished lifecycle notices, empty states, validation feedback, 403, and 404 states.
- [x] Shared design tokens, controls, focus treatment, reduced motion, and mobile breakpoints.

# Milestone 10 — Security, QA, and Acceptance

- [x] Backend authorization and status-transition review.
- [x] CSRF/session, secrets, input, and poster security review.
- [x] Concurrency and sensitive-data exposure review.
- [x] Run all simplified-V1 acceptance scenarios.
- [x] Confirm public routes expose published data only.
- [x] Confirm yearly expiry preserves history while blocking protected actions.

# Milestone 11 — Deployment Readiness

- [ ] Production configuration, secrets, and PostgreSQL migration strategy.
- [x] Production Vercel Blob poster storage, ownership metadata, and lifecycle/orphan cleanup.
- [ ] Broader production logging and backup operations.
- [ ] Domain and HTTPS.
- [ ] Admin credential handover.
- [ ] Production smoke test of the complete Layer 1 lifecycle.

# Layer 2 — External Registration Links and Poster Uploads — COMPLETE

Approved by D-061 after Layer 1 completion.

- [x] Add an optional HTTPS external registration URL through forward migration 12.
- [x] Validate safe external-link behavior without server fetching or previews.
- [x] Add time-aware public `Register now` actions and poster-link behavior.
- [x] Replace organizer-entered poster URLs with signature-checked Vercel Blob uploads; D-065 subsequently made a persisted poster mandatory for new events.
- [x] Show poster/link previews to organizers and Management for manual review.
- [x] Keep YCEP independent from attendee data and external registration status.

# Production reliability and reviewed-content integrity — LOCAL IMPLEMENTATION COMPLETE

- [x] Require a verified persisted poster on every new organizer Event save while preserving historical fallback records.
- [x] Bind production Blob paths to the active organizer authorization and prevent shared Event references.
- [x] Bind Management decisions to the exact pending submission reviewed under the Event row lock.
- [x] Render CSRF fields directly in every audited mutation form, including JavaScript-disabled lifecycle actions.
- [x] Exclude poster metadata from browser recovery and reject recovery from an older server version.
- [x] Present long department recommendations as three visible values plus an accessible expansion.
- [ ] Deploy only after review, then perform the production smoke/retest plan below.
  - Use separate clean organizer and Management browser sessions; verify login, session regeneration, logout, and server-rendered CSRF mutations with JavaScript both enabled and disabled.
  - Create and first-save a poster-backed draft with an HTTPS registration link and audience targets, submit version A, reject it, revise every reviewed field plus the poster into version B, and resubmit the same Event row.
  - Confirm an action from the stale version-A review page is rejected, then approve from a freshly loaded version-B page.
  - Confirm public discovery/detail expose only approved version B, including its poster, registration action, and compact expandable department list; also verify cancelled/past registration actions remain disabled.

# Removed from active V1 roadmap

- Internal attendee registration/applications and answers.
- Participant/applicant management.
- Registration limits/deadline enforcement, cancellation, and history.
- Attendance, no-shows, QR attendance, and waitlists.
- Registration confirmation/reminder emails.

**V1 exit condition:** The trusted organizer-to-publication loop works end to end without manual database edits, and a visitor can discover approved events without an account.
