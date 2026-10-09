# YCEP V1 — Product & Functional Specification

## 1. Product definition

YCEP is the **trusted YABATECH campus event publishing and discovery platform**. It replaces fragmented discovery across WhatsApp, flyers, departmental groups, social media, word of mouth, and informal announcements with one public source for Management-approved events.

YCEP V1 governs organizer trust, event approval, publication, and public visibility. It is not an internal attendee-registration or attendance-management system.

## 2. Authoritative V1 lifecycle and success

```text
Verified Organizer
      ↓
Create Event Draft
      ↓
Submit Event
      ↓
YABATECH Management Review
      ↓
Approve / Reject
      ↓
Published Event
      ↓
Public Student Discovery
```

V1 succeeds when that flow works end to end without manual database edits and any visitor can discover an approved event without creating an account.

## 3. Users and roles

### Public visitor

No account is required. Visitors can browse, search, filter, and open published events. They can view the flyer/poster, title, description, category, date/time, venue, organizer identity, and target audience. They cannot access drafts, review data, private account data, or state-changing organizer/Management actions.

### Member

A normal YCEP account associated with YABATECH academic identity. The member system remains as the trusted identity foundation for organizer authorization. Members can authenticate, maintain permitted account information, and apply for organizer privileges. A viewer does not need membership merely to discover events.

### Verified organizer

Organizer is an approved yearly capability on a verified `MEMBER` account, not a separate role or authentication system. An organizer can create/edit owned drafts, submit them for review, and manage owned events within approved rules. Organizer authority expires with the yearly cycle and requires reapproval.

### Primary organizer and co-organizers

Every event has exactly one primary organizer, who owns the event and sensitive actions. Co-organizer behavior is not required for the core publishing/discovery loop and must not be added without an approved permission design.

### Administrator

The dedicated `ADMIN` account represents YABATECH Management and does not expire yearly. Management approves/rejects/revokes organizers, reviews submitted events, approves/rejects events, manages exceptional cases, and reviews important audit activity.

## 4. Account and verification model

Existing identity rules remain authoritative:

- Roles are `MEMBER` and `ADMIN`; organizer is a capability.
- Members require full name, unique email, unique normalized matric number, department, level, and a bcrypt-hashed password.
- Admin academic identity fields must be null, and exactly one admin account exists in V1.
- Members log in with matric number/password; Management uses email/password.
- There is no public admin-registration route.
- A valid new member automatically receives `ACTIVE` verification for the current yearly cycle.
- Normal member registration does not require Management approval.
- Accounts and history survive verification expiry.
- Expired/revoked verification blocks protected organizer actions but does not delete the account.

Matric numbers are trimmed, whitespace around separators is removed, and letters are uppercased. The V1 structural rule remains `^[A-Z]{1,4}/[A-Z]{2,4}/\d{2}/\d{7}$`; it does not prove central YABATECH enrollment. Member passwords require at least 8 characters; admin bootstrap passwords require at least 12 and must reject unchanged placeholders.

## 5. Organizer verification

The implemented two-entity model remains authoritative:

- `OrganizerApplication` preserves each request and decision.
- `OrganizerAuthorization` grants the cycle-bound capability after approval.

Only an actively verified current-cycle member may apply. Admin cannot apply. At most one pending application per member/cycle is allowed. Rejection permits a fresh application while preserving history. Any authorization for that cycle, including revoked/expired, blocks reapplication; revocation is final for the cycle.

Authorization is valid only alongside active current-cycle member verification. Approval, rejection, and revocation use transactional locking and write audit records in the same transaction wherever practical. Public organizer identity remains distinct from an optional represented organization.

## 6. Event lifecycle

V1 states are `DRAFT`, `PENDING_APPROVAL`, `PUBLISHED`, `REJECTED`, `CANCELLED`, and `COMPLETED`.

- An authorized organizer creates a `DRAFT`.
- Its owner submits it to `PENDING_APPROVAL`.
- Management approves it to `PUBLISHED` or rejects it with a reason to `REJECTED`.
- Rejected events remain historical. In Milestone 4B they are terminal and view-only; any later revise/resubmit transition requires explicit approval and design.
- Only published events are publicly discoverable.
- Cancelled and completed events remain historical rather than being hard-deleted.

All transitions require backend authorization and validation. An approved organizer still needs approval for each event.

## 7. Event information

Layer 1 supports:

- title and clear public description;
- category;
- optional validated HTTPS flyer/poster URL for newly created or edited events;
- event date, start/end time, and venue;
- public organizer identity;
- one primary organizer authorization;
- optional target departments and levels;
- lifecycle status and required review history.

Venue information is informational; YCEP does not reserve or authorize physical venues.

## 8. Target audience and relevance

`EventTargetDepartment` and `EventTargetLevel` remain approved. They may support filtering, relevance ordering, recommendations, and explanation of an event's intended audience.

Targeting never makes a published event private and does not control registration. No advanced recommendation engine is required; simple deterministic filtering/relevance is sufficient.

## 9. Approval and publication

- Only the event owner may submit its draft.
- Only Management may approve or reject an event.
- Rejection requires an understandable reason.
- Important decisions and transitions must be audited.
- Draft, pending, and rejected events must not appear publicly.
- Only `PUBLISHED` means approved and public.
- Approval preserves ownership and submission history.
- Approval must revalidate that the owning organizer authorization, member role, current cycle, and member verification are still valid. If trust has lapsed, the event remains pending and Management may reject it with feedback.
- Concurrent/repeated review attempts must resolve safely without contradictory outcomes.

## 10. Public discovery

The public event feed is the primary product surface. It should be visually centered on flyer/poster cards and quickly show title, short description, date/time, venue, organizer identity, and category.

Visitors can open a public detail page for full approved information. Basic V1 search/filtering may cover keyword/title, category, date, target department, and target level. Public routes expose published-event information only and never leak draft, review, account, session, or administrative data.

Milestone 4C establishes the unfiltered discovery baseline. The homepage lists only `PUBLISHED` events dated today or later using the Africa/Lagos calendar date, ordered by event date, start time, then title, with a maximum of 24. Past published events remain available by direct detail URL. All other statuses and unknown identifiers return the same generic not-found response. Public queries use an explicit safe-field projection. Search, filters, and relevance ranking are deferred to their dedicated milestone.

Milestone 4D adds anonymous, URL-driven discovery through `q`, `category`, `department`, `level`, and `date`. Text search is a case-insensitive substring match across title, description, venue, organizer public name, and category name. Category, department, and level use persisted reference codes. Different dimensions combine with AND semantics. Department/level filters include both explicit target matches and untargeted general events; targeting remains relevance metadata and never eligibility. Date values are `upcoming`, `today`, `week`, and `month`, using Africa/Lagos calendar boundaries and never including earlier days. All result sets remain chronologically ordered and show at most 24 cards, with an accurate total count when more matches exist.

## 11. Event changes, cancellation, and history

Important event records must not be hard-deleted after publication. Operational changes may be supported with appropriate history. Fundamental changes—title, organizer identity, or core purpose/description—require reapproval before the modified event is treated as approved.

Cancellation records a reason and preserves the event. Completed/cancelled events may remain publicly historical where appropriate. There is no V1 participant-preservation or participant-notification requirement because YCEP does not own attendee registration.

Milestone 4E makes published events immutable. Corrections or replacements require a fresh draft and approval; no revision system is included. Today, upcoming, and past are derived using the Africa/Lagos event date, and `COMPLETED` has no approved V1 transition. The only post-publication transition is irreversible `PUBLISHED → CANCELLED`. The active authorization-bound owner or Management may cancel with a public 10–500 character reason. Cancellation is transactionally locked and audited. Cancelled events leave all public lists/search results but remain available at their direct public URL with a cancellation notice and reason. Later organizer trust loss does not silently unpublish an approved event; Management may withdraw it when necessary.

## 12. External registration — deferred Layer 2

External registration links are not part of immediate Layer 1 work. The intended later model is:

```text
Organizer creates a registration page externally
      ↓
Organizer adds its URL to YCEP
      ↓
Student selects Register / Learn More
      ↓
External service handles registration
```

Possible services include Luma, Google Forms, Microsoft Forms, Eventbrite, and other legitimate platforms. YCEP will not know whether a visitor registered or synchronize external status. Later organizer guidance may explain how to create a page, but this must not be implemented before Layer 1 is complete and the feature is deliberately designed.

## 13. Removed/deferred from primary V1

- Internal student event registration.
- Approval-required attendee applications and answers.
- Participant/applicant lists and workflows.
- Internal registration limits and deadline enforcement.
- Participant cancellation, registration history, and “My Registrations.”
- Waitlists, attendance, no-shows, and QR attendance.
- Registration confirmation/reminder emails.
- Comments/reviews, online payments, SMS/WhatsApp notifications, certificates, advanced analytics/recommendations, venue reservation, and complex organization accounts.

## 14. Legacy Milestone 4A history

The pre-pivot migration introduced `ParticipationMode`, registration deadline/limit/eligibility fields, eligibility junctions, and application questions. D-050 removed those structures through forward migration `20261009010424_simplify_layer1_events` after a data preflight. The original migration remains immutable history and must never be rewritten.

## 15. Security and data integrity

V1 requires backend authorization, public access only to published data, secure HTTP-only sessions, bcrypt password hashing, environment-based secrets, input and flyer/poster validation, protection against unauthorized state changes, database constraints, auditable Management decisions, historical preservation, and transactional locking for contested approval transitions where necessary.

Duplicate registration conflicts use a generic response that does not disclose whether the matric number or email address already exists.

The frozen stack remains Node.js 24, TypeScript, Express, EJS, Vanilla JavaScript/CSS, PostgreSQL, Prisma, Zod, session authentication, bcrypt, Nodemailer behind an `EmailService` abstraction if later required, Vitest, and Supertest.

## 16. Permission matrix

| Action | Public | Member | Verified organizer | Management |
|---|---:|---:|---:|---:|
| Browse/view published events | Yes | Yes | Yes | Yes |
| Apply for organizer authority | No | Active only | N/A | No |
| Create/edit own draft | No | No | Yes | Exceptional only |
| Submit own event | No | No | Yes | No |
| Approve/reject/publish events | No | No | No | Yes |
| View unrelated drafts/review data | No | No | No | Yes |
| Revoke organizer authority | No | No | No | Yes |

Sensitive owner actions must not automatically be granted to future co-organizers.

## 17. Acceptance scenarios

1. **Organizer trust:** Active member applies; Management approves/rejects; authorization/revocation preserves history and is audited.
2. **Draft ownership:** Active organizer manages an owned draft; other organizers, expired authorizations, and visitors cannot access it.
3. **Submission:** Owner submits a valid draft to pending; repeated/unauthorized submissions fail safely; it remains non-public.
4. **Review:** Management approves or rejects with a reason; concurrent/repeated decisions cannot contradict.
5. **Publication:** Approval creates a published event visible without a viewer account.
6. **Discovery:** A visitor sees only published events, can search/filter, and can open approved public details.
7. **Target relevance:** Targets influence filtering/relevance but never public visibility or registration.
8. **Yearly expiry:** Account/history remain while protected organizer actions are denied.

## 18. Product boundary

The V1 boundary is the complete trusted publishing loop: organizer identity, event drafting, Management approval, publication, and public discovery. Do not expand V1 into an internal attendee platform. Complete Layer 1 before designing Layer 2 external registration links.
