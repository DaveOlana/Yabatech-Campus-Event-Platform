import {
  Event,
  EventStatus,
  OrganizerAuthorization,
  OrganizerAuthorizationStatus,
  Prisma,
  UserRole,
  VerificationStatus,
} from "@prisma/client";
import { prisma } from "../db.js";
import { EventDraftInput } from "../validators/event.validator.js";
import { AUDIT_ACTIONS, createAuditLog } from "./audit.service.js";
import { getLagosTodayDate } from "../utils/event-display.js";

export class EventError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "EventError";
  }
}

export class EventNotFoundError extends EventError {
  constructor(message = "Event not found") {
    super(message, 404);
    this.name = "EventNotFoundError";
  }
}

export class EventValidationError extends EventError {
  constructor(message: string) {
    super(message, 400);
    this.name = "EventValidationError";
  }
}

export class EventInvalidStateError extends EventError {
  constructor(message = "Event is not in a valid state for this action") {
    super(message, 409);
    this.name = "EventInvalidStateError";
  }
}

export class EventTrustConflictError extends EventError {
  constructor(message = "Organizer authorization is no longer active. This event cannot be approved.") {
    super(message, 409);
    this.name = "EventTrustConflictError";
  }
}

const eventRelations = {
  category: true,
  targetDepartments: { include: { department: true } },
  targetLevels: { include: { level: true } },
} as const;

type TransactionClient = Prisma.TransactionClient;

export async function getEventFormData() {
  const [categories, departments, levels] = await Promise.all([
    prisma.eventCategory.findMany({ orderBy: { name: "asc" } }),
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.level.findMany({ orderBy: { code: "asc" } }),
  ]);
  return { categories, departments, levels };
}

async function validateReferences(input: EventDraftInput): Promise<void> {
  const category = await prisma.eventCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw new EventValidationError("Selected event category does not exist");

  if (input.targetDepartmentIds.length > 0) {
    const count = await prisma.department.count({ where: { id: { in: input.targetDepartmentIds } } });
    if (count !== input.targetDepartmentIds.length) {
      throw new EventValidationError("One or more selected target departments do not exist");
    }
  }
  if (input.targetLevelIds.length > 0) {
    const count = await prisma.level.count({ where: { id: { in: input.targetLevelIds } } });
    if (count !== input.targetLevelIds.length) {
      throw new EventValidationError("One or more selected target levels do not exist");
    }
  }
}

async function lockEvent(tx: TransactionClient, eventId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; status: EventStatus; primary_organizer_authorization_id: string }>>`
    SELECT id, status, primary_organizer_authorization_id
    FROM "Event"
    WHERE id = ${eventId}
    FOR UPDATE
  `;
  if (rows.length === 0) throw new EventNotFoundError();
  return rows[0];
}

async function requireLiveAdmin(tx: TransactionClient, adminUserId: string) {
  const actor = await tx.user.findUnique({ where: { id: adminUserId } });
  if (!actor || actor.role !== UserRole.ADMIN) {
    throw new EventError("Live YABATECH Management authorization is required.", 403);
  }
  return actor;
}

async function getOrganizerTrustState(tx: TransactionClient, authorizationId: string) {
  const authorization = await tx.organizerAuthorization.findUnique({
    where: { id: authorizationId },
    include: { user: true, cycle: true },
  });
  if (!authorization) return { valid: false as const, reason: "Organizer authorization no longer exists.", authorization: null };
  if (authorization.status !== OrganizerAuthorizationStatus.ACTIVE) {
    return { valid: false as const, reason: "Organizer authorization is no longer active.", authorization };
  }
  const currentCycle = await tx.academicYearCycle.findFirst({ where: { isCurrent: true } });
  if (!currentCycle || currentCycle.id !== authorization.cycleId) {
    return { valid: false as const, reason: "Organizer authorization does not belong to the current academic cycle.", authorization };
  }
  if (!authorization.user || authorization.user.role !== UserRole.MEMBER) {
    return { valid: false as const, reason: "The owning organizer no longer has a valid member account.", authorization };
  }
  const verification = await tx.memberVerification.findUnique({
    where: { userId_cycleId: { userId: authorization.userId, cycleId: authorization.cycleId } },
  });
  if (!verification || verification.status !== VerificationStatus.ACTIVE) {
    return { valid: false as const, reason: "The owning organizer's member verification is no longer active.", authorization };
  }
  return { valid: true as const, reason: null, authorization };
}

export async function createEventDraft(currentAuth: OrganizerAuthorization, input: EventDraftInput): Promise<Event> {
  await validateReferences(input);
  return prisma.$transaction((tx) => tx.event.create({
    data: {
      title: input.title,
      description: input.description,
      posterUrl: input.posterUrl,
      categoryId: input.categoryId,
      eventDate: new Date(`${input.eventDate}T00:00:00Z`),
      startTime: input.startTime,
      endTime: input.endTime,
      venue: input.venue,
      primaryOrganizerAuthorizationId: currentAuth.id,
      organizerPublicName: currentAuth.approvedPublicName,
      status: EventStatus.DRAFT,
      targetDepartments: { create: input.targetDepartmentIds.map((departmentId) => ({ departmentId })) },
      targetLevels: { create: input.targetLevelIds.map((levelId) => ({ levelId })) },
    },
    include: eventRelations,
  }));
}

export type OrganizerEventView = "all" | "drafts" | "pending" | "published" | "rejected" | "history";

export async function getOrganizerEvents(currentAuthId: string, view: OrganizerEventView = "all", now = new Date()) {
  const today = getLagosTodayDate(now);
  const viewWhere: Record<OrganizerEventView, Prisma.EventWhereInput> = {
    all: {},
    drafts: { status: EventStatus.DRAFT },
    pending: { status: EventStatus.PENDING_APPROVAL },
    published: { status: EventStatus.PUBLISHED, eventDate: { gte: today } },
    rejected: { status: EventStatus.REJECTED },
    history: { OR: [{ status: EventStatus.CANCELLED }, { status: EventStatus.PUBLISHED, eventDate: { lt: today } }] },
  };
  return prisma.event.findMany({
    where: { primaryOrganizerAuthorizationId: currentAuthId, ...viewWhere[view] },
    include: { category: true },
    orderBy: [{ eventDate: "desc" }, { startTime: "desc" }, { title: "asc" }],
  });
}

export const getOrganizerEventDrafts = getOrganizerEvents;

export async function getOrganizerEventById(eventId: string, currentAuthId: string) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, primaryOrganizerAuthorizationId: currentAuthId },
    include: { ...eventRelations, reviewer: { select: { id: true, fullName: true } } },
  });
  if (!event) throw new EventNotFoundError();
  return event;
}

export async function getOrganizerEventDraftById(eventId: string, currentAuthId: string) {
  const event = await getOrganizerEventById(eventId, currentAuthId);
  if (event.status !== EventStatus.DRAFT) throw new EventNotFoundError("Event draft not found");
  return event;
}

export async function updateEventDraft(eventId: string, currentAuthId: string, input: EventDraftInput): Promise<Event> {
  await validateReferences(input);
  return prisma.$transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId);
    if (locked.primary_organizer_authorization_id !== currentAuthId) throw new EventNotFoundError();
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.DRAFT) throw new EventInvalidStateError("Only draft events can be edited");
    await Promise.all([
      tx.eventTargetDepartment.deleteMany({ where: { eventId } }),
      tx.eventTargetLevel.deleteMany({ where: { eventId } }),
    ]);
    return tx.event.update({
      where: { id: eventId },
      data: {
        title: input.title,
        description: input.description,
        posterUrl: input.posterUrl,
        categoryId: input.categoryId,
        eventDate: new Date(`${input.eventDate}T00:00:00Z`),
        startTime: input.startTime,
        endTime: input.endTime,
        venue: input.venue,
        targetDepartments: { create: input.targetDepartmentIds.map((departmentId) => ({ departmentId })) },
        targetLevels: { create: input.targetLevelIds.map((levelId) => ({ levelId })) },
      },
      include: eventRelations,
    });
  });
}

export async function submitEventForReview(eventId: string, organizerAuthorizationId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId);
    if (locked.primary_organizer_authorization_id !== organizerAuthorizationId) throw new EventNotFoundError();
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.DRAFT) throw new EventInvalidStateError("Only draft events can be submitted for review.");

    const trust = await getOrganizerTrustState(tx, organizerAuthorizationId);
    if (!trust.valid || !trust.authorization) throw new EventTrustConflictError(trust.reason ?? undefined);

    const now = new Date();
    const event = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PENDING_APPROVAL, submittedAt: now, reviewedAt: null, reviewerUserId: null, rejectionReason: null },
      include: eventRelations,
    });
    await createAuditLog({
      actorUserId: trust.authorization.userId,
      action: AUDIT_ACTIONS.EVENT_SUBMITTED,
      targetType: "Event",
      targetId: eventId,
      metadata: { fromStatus: EventStatus.DRAFT, toStatus: EventStatus.PENDING_APPROVAL, organizerAuthorizationId, cycleId: trust.authorization.cycleId, submittedAt: now.toISOString() },
    }, tx);
    return event;
  });
}

export async function getPendingEventsForManagement() {
  return prisma.event.findMany({
    where: { status: EventStatus.PENDING_APPROVAL },
    include: { category: true },
    orderBy: { submittedAt: "asc" },
  });
}

export type ManagementEventHistoryStatus = "all" | "published" | "rejected" | "cancelled" | "past";

export async function getEventHistoryForManagement(status: ManagementEventHistoryStatus = "all", now = new Date()) {
  const today = getLagosTodayDate(now);
  const statusWhere: Record<ManagementEventHistoryStatus, Prisma.EventWhereInput> = {
    all: { status: { in: [EventStatus.PUBLISHED, EventStatus.REJECTED, EventStatus.CANCELLED] } },
    published: { status: EventStatus.PUBLISHED },
    rejected: { status: EventStatus.REJECTED },
    cancelled: { status: EventStatus.CANCELLED },
    past: { status: EventStatus.PUBLISHED, eventDate: { lt: today } },
  };
  return prisma.event.findMany({
    where: statusWhere[status],
    include: { category: true },
    orderBy: [{ reviewedAt: "desc" }, { eventDate: "desc" }, { title: "asc" }],
  });
}

export async function getEventForManagementReview(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      ...eventRelations,
      reviewer: { select: { id: true, fullName: true } },
      primaryOrganizerAuthorization: { include: { user: true, cycle: true } },
      cancelledBy: { select: { id: true, fullName: true, role: true } },
    },
  });
  if (!event) throw new EventNotFoundError();
  const trust = await prisma.$transaction((tx) => getOrganizerTrustState(tx, event.primaryOrganizerAuthorizationId));
  return { event, organizerTrustValid: trust.valid, organizerTrustWarning: trust.valid ? null : `${trust.reason} This event cannot be approved.` };
}

export async function approveEvent(adminUserId: string, eventId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId);
    await requireLiveAdmin(tx, adminUserId);
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.PENDING_APPROVAL) throw new EventInvalidStateError("Only pending events can be approved.");

    const trust = await getOrganizerTrustState(tx, locked.primary_organizer_authorization_id);
    if (!trust.valid || !trust.authorization) throw new EventTrustConflictError(`${trust.reason} This event cannot be approved.`);

    const now = new Date();
    const event = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.PUBLISHED, reviewedAt: now, reviewerUserId: adminUserId, rejectionReason: null },
      include: eventRelations,
    });
    await createAuditLog({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.EVENT_APPROVED,
      targetType: "Event",
      targetId: eventId,
      metadata: { fromStatus: EventStatus.PENDING_APPROVAL, toStatus: EventStatus.PUBLISHED, organizerAuthorizationId: trust.authorization.id, cycleId: trust.authorization.cycleId, submittedAt: event.submittedAt?.toISOString(), reviewedAt: now.toISOString() },
    }, tx);
    return event;
  });
}

export async function rejectEvent(adminUserId: string, eventId: string, rejectionReason: string) {
  const reason = rejectionReason.trim();
  if (reason.length < 5 || reason.length > 500) throw new EventValidationError("Rejection feedback must be between 5 and 500 characters.");

  return prisma.$transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId);
    await requireLiveAdmin(tx, adminUserId);
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.PENDING_APPROVAL) throw new EventInvalidStateError("Only pending events can be rejected.");

    const now = new Date();
    const event = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.REJECTED, reviewedAt: now, reviewerUserId: adminUserId, rejectionReason: reason },
      include: eventRelations,
    });
    await createAuditLog({
      actorUserId: adminUserId,
      action: AUDIT_ACTIONS.EVENT_REJECTED,
      targetType: "Event",
      targetId: eventId,
      metadata: { fromStatus: EventStatus.PENDING_APPROVAL, toStatus: EventStatus.REJECTED, organizerAuthorizationId: locked.primary_organizer_authorization_id, submittedAt: event.submittedAt?.toISOString(), reviewedAt: now.toISOString(), rejectionReason: reason },
    }, tx);
    return event;
  });
}

function validateCancellationReason(value: string): string {
  const reason = value.trim();
  if (reason.length < 10 || reason.length > 500) throw new EventValidationError("Cancellation reason must be between 10 and 500 characters.");
  return reason;
}

export async function cancelPublishedEventAsOrganizer(eventId: string, organizerAuthorizationId: string, cancellationReason: string) {
  const reason = validateCancellationReason(cancellationReason);
  return prisma.$transaction(async (tx) => {
    const locked = await lockEvent(tx, eventId);
    if (locked.primary_organizer_authorization_id !== organizerAuthorizationId) throw new EventNotFoundError();
    const trust = await getOrganizerTrustState(tx, organizerAuthorizationId);
    if (!trust.valid || !trust.authorization) throw new EventTrustConflictError(trust.reason ?? undefined);
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.PUBLISHED) throw new EventInvalidStateError("Only published events can be cancelled.");
    const now = new Date();
    const event = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.CANCELLED, cancelledAt: now, cancellationReason: reason, cancelledByUserId: trust.authorization.userId },
      include: eventRelations,
    });
    await createAuditLog({ actorUserId: trust.authorization.userId, action: AUDIT_ACTIONS.EVENT_CANCELLED, targetType: "Event", targetId: eventId, metadata: { fromStatus: EventStatus.PUBLISHED, toStatus: EventStatus.CANCELLED, cancellationReason: reason, cancelledAt: now.toISOString(), initiatedBy: "ORGANIZER", cycleId: trust.authorization.cycleId } }, tx);
    return event;
  });
}

export async function cancelPublishedEventAsManagement(adminUserId: string, eventId: string, cancellationReason: string) {
  const reason = validateCancellationReason(cancellationReason);
  return prisma.$transaction(async (tx) => {
    await lockEvent(tx, eventId);
    await requireLiveAdmin(tx, adminUserId);
    const current = await tx.event.findUnique({ where: { id: eventId } });
    if (!current || current.status !== EventStatus.PUBLISHED) throw new EventInvalidStateError("Only published events can be withdrawn.");
    const now = new Date();
    const event = await tx.event.update({
      where: { id: eventId },
      data: { status: EventStatus.CANCELLED, cancelledAt: now, cancellationReason: reason, cancelledByUserId: adminUserId },
      include: eventRelations,
    });
    await createAuditLog({ actorUserId: adminUserId, action: AUDIT_ACTIONS.EVENT_CANCELLED, targetType: "Event", targetId: eventId, metadata: { fromStatus: EventStatus.PUBLISHED, toStatus: EventStatus.CANCELLED, cancellationReason: reason, cancelledAt: now.toISOString(), initiatedBy: "MANAGEMENT" } }, tx);
    return event;
  });
}
