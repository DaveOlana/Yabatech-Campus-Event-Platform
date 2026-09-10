# AGENTS.md — Instructions for AI Coding Agents

These instructions apply to Claude, Gemini, Codex, and any other AI coding agent working on YCEP.

## 1. Source of truth

Read `YCEP_V1_SPEC.md` before modifying product behaviour.

If code and specification disagree:

1. do not silently choose one;
2. identify the conflict;
3. preserve data and working behaviour where possible;
4. update the implementation only when the intended V1 behaviour is clear.

Do not invent new product rules when the specification already defines them.

## 2. Protect V1 scope

Do not add features outside V1 merely because they are easy or attractive.

Examples intentionally outside V1 include:

- QR-code attendance;
- online payments;
- SMS/WhatsApp notifications;
- advanced recommendation engines;
- venue reservation systems;
- complex organization-account infrastructure;
- waitlists;
- comments/reviews;
- certificates;
- advanced analytics.

Record such ideas in `FUTURE_IDEAS.md`.

## 3. Inspect before editing

Before changing a feature:

- inspect related models/schema;
- inspect routes/controllers/views/services;
- inspect authorization rules;
- inspect tests;
- inspect migrations;
- inspect templates/components using the feature.

Avoid replacing a working subsystem when a targeted change is enough.

## 4. Preserve domain distinctions

Never collapse these concepts into one:

### Recommended audience vs registration eligibility

Recommended audience influences discovery/relevance.

Eligibility determines who may register/apply.

An event may be recommended to ND1 Computer Science students while still allowing everyone to register.

### Registration vs attendance

A registration does not mean the participant attended.

Attendance is recorded separately.

### Account vs verification

An account persists.

Yearly verification can expire.

Do not delete accounts automatically when yearly verification expires.

### Member vs organizer

Organizer is an approved capability on a normal YCEP account, not a separate unrelated authentication system.

### Organizer approval vs event approval

An approved organizer still requires event approval for each event.

## 5. Historical data must survive

Prefer status changes over hard deletion for important domain records.

Do not hard-delete:

- events that have been published;
- registrations/applications with history;
- attendance records;
- approval decisions;
- important admin actions.

Use states such as cancelled, rejected, completed, expired, or archived.

## 6. Security rules

- Never hardcode passwords, API keys, SMTP credentials, secret keys, or admin credentials.
- Keep secrets in environment configuration.
- Enforce authorization on the backend, not only by hiding UI buttons.
- Do not expose participant lists publicly.
- Do not expose unrelated user data to organizers.
- Never store plaintext passwords.
- Validate uploaded images/files.
- Protect state-changing operations against unauthorized requests.

## 7. Permissions

Use the permission matrix in `YCEP_V1_SPEC.md`.

Sensitive primary-organizer actions should not automatically be given to co-organizers.

Admin functions belong only to the YABATECH Management account/role.

## 8. Event changes

Operational changes such as date, time, venue, registration deadline, or registration limit may be updated while preserving registrations and notifying affected participants.

Fundamental changes such as event title, organizer identity, or core purpose/description should trigger reapproval before the modified event is treated as approved.

## 9. Registration limits

Registration limit is an organizer-defined registration ceiling, not a claim about physical venue capacity.

For approval-based events:

- pending applications do not consume the limit;
- approved applicants do;
- the organizer cannot approve beyond the configured limit.

For open-registration events:

- registered participants consume the limit.

Unlimited registration is allowed.

## 10. Tests

For every material feature:

- add/update tests;
- test permissions;
- test valid flow;
- test invalid transitions;
- test expired verification;
- test cancellation;
- test duplicate registration/application;
- test registration-limit behaviour.

Run the relevant test suite after changes.

Do not report "done" when tests are failing unless the failure is clearly documented.

## 11. Database changes

Do not casually rewrite migrations or wipe development data.

For schema changes:

- explain the change;
- create proper migrations;
- consider existing data;
- use constraints where appropriate;
- preserve historical records.

## 12. Handoffs between models

At the end of a meaningful milestone, update `DEVELOPMENT_LOG.md` with:

- what was implemented;
- files/modules changed;
- migrations added;
- tests run and results;
- unresolved issues;
- next recommended task.

If a decision changes product behaviour, update `DECISIONS.md` and `YCEP_V1_SPEC.md`.

## 13. Architecture changes

Do not switch frameworks, databases, authentication strategies, frontend architecture, deployment platform, or major dependencies without explicit approval.

If the repository already has a stack, work within it unless there is a strong documented reason not to.

## 14. Coding behaviour

Prefer:

- clear names;
- small focused functions/services;
- explicit status transitions;
- reusable authorization checks;
- database constraints for critical invariants;
- readable code over clever abstractions.

Avoid:

- giant files;
- duplicated business rules;
- status strings scattered everywhere;
- client-side-only enforcement;
- unnecessary dependencies;
- speculative abstractions for future features.

## 15. When uncertain

Do not guess silently.

Document the ambiguity in the development log and choose the least destructive implementation that preserves V1 behaviour.
