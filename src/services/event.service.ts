import { Event, EventStatus, OrganizerAuthorization } from "@prisma/client";
import { prisma } from "../db.js";
import { EventDraftInput } from "../validators/event.validator.js";

export class EventNotFoundError extends Error {
  constructor(message = "Event draft not found") {
    super(message);
    this.name = "EventNotFoundError";
  }
}

export class EventValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EventValidationError";
  }
}

export class EventInvalidStateError extends Error {
  constructor(message = "Only draft events can be edited") {
    super(message);
    this.name = "EventInvalidStateError";
  }
}

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
    const departments = await prisma.department.findMany({
      where: { id: { in: input.targetDepartmentIds } },
      select: { id: true },
    });
    if (departments.length !== input.targetDepartmentIds.length) {
      throw new EventValidationError("One or more selected target departments do not exist");
    }
  }

  if (input.targetLevelIds.length > 0) {
    const levels = await prisma.level.findMany({
      where: { id: { in: input.targetLevelIds } },
      select: { id: true },
    });
    if (levels.length !== input.targetLevelIds.length) {
      throw new EventValidationError("One or more selected target levels do not exist");
    }
  }
}

const eventRelations = {
  category: true,
  targetDepartments: { include: { department: true } },
  targetLevels: { include: { level: true } },
} as const;

export async function createEventDraft(
  currentAuth: OrganizerAuthorization,
  input: EventDraftInput
): Promise<Event> {
  await validateReferences(input);
  const eventDate = new Date(`${input.eventDate}T00:00:00Z`);

  return prisma.$transaction((tx) =>
    tx.event.create({
      data: {
        title: input.title,
        description: input.description,
        posterUrl: input.posterUrl,
        categoryId: input.categoryId,
        eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venue: input.venue,
        primaryOrganizerAuthorizationId: currentAuth.id,
        organizerPublicName: currentAuth.approvedPublicName,
        status: EventStatus.DRAFT,
        targetDepartments: {
          create: input.targetDepartmentIds.map((departmentId) => ({ departmentId })),
        },
        targetLevels: {
          create: input.targetLevelIds.map((levelId) => ({ levelId })),
        },
      },
      include: eventRelations,
    })
  );
}

export async function getOrganizerEventDrafts(currentAuthId: string) {
  return prisma.event.findMany({
    where: { primaryOrganizerAuthorizationId: currentAuthId, status: EventStatus.DRAFT },
    include: { category: true },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getOrganizerEventDraftById(eventId: string, currentAuthId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      primaryOrganizerAuthorizationId: currentAuthId,
      status: EventStatus.DRAFT,
    },
    include: eventRelations,
  });
  if (!event) throw new EventNotFoundError();
  return event;
}

export async function updateEventDraft(
  eventId: string,
  currentAuthId: string,
  input: EventDraftInput
): Promise<Event> {
  const existing = await prisma.event.findFirst({
    where: { id: eventId, primaryOrganizerAuthorizationId: currentAuthId },
  });
  if (!existing) throw new EventNotFoundError();
  if (existing.status !== EventStatus.DRAFT) throw new EventInvalidStateError();

  await validateReferences(input);
  const eventDate = new Date(`${input.eventDate}T00:00:00Z`);

  return prisma.$transaction(async (tx) => {
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
        eventDate,
        startTime: input.startTime,
        endTime: input.endTime,
        venue: input.venue,
        targetDepartments: {
          create: input.targetDepartmentIds.map((departmentId) => ({ departmentId })),
        },
        targetLevels: {
          create: input.targetLevelIds.map((levelId) => ({ levelId })),
        },
      },
      include: eventRelations,
    });
  });
}
