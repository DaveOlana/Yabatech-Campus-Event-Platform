import { EventStatus, LevelCode } from "@prisma/client";
import { prisma } from "../db.js";
import { getLagosTodayDate } from "../utils/event-display.js";

export interface PublicEvent {
  id: string;
  title: string;
  description: string;
  posterUrl: string | null;
  category: { name: string; code: string };
  eventDate: Date;
  startTime: string;
  endTime: string;
  venue: string;
  organizerPublicName: string;
  targetDepartments: Array<{ name: string; code: string }>;
  targetLevels: Array<{ code: LevelCode; label: string }>;
}

const publicEventSelect = {
  id: true,
  title: true,
  description: true,
  posterUrl: true,
  category: { select: { name: true, code: true } },
  eventDate: true,
  startTime: true,
  endTime: true,
  venue: true,
  organizerPublicName: true,
  targetDepartments: { select: { department: { select: { name: true, code: true } } } },
  targetLevels: { select: { level: { select: { code: true, label: true } } } },
} as const;

function toPublicEvent(event: {
  id: string; title: string; description: string; posterUrl: string | null;
  category: { name: string; code: string }; eventDate: Date; startTime: string;
  endTime: string; venue: string; organizerPublicName: string;
  targetDepartments: Array<{ department: { name: string; code: string } }>;
  targetLevels: Array<{ level: { code: LevelCode; label: string } }>;
}): PublicEvent {
  return {
    ...event,
    targetDepartments: event.targetDepartments.map(({ department }) => department),
    targetLevels: event.targetLevels.map(({ level }) => level),
  };
}

export async function getPublicUpcomingEvents(options: { now?: Date; limit?: number } = {}): Promise<PublicEvent[]> {
  const events = await prisma.event.findMany({
    where: {
      status: EventStatus.PUBLISHED,
      eventDate: { gte: getLagosTodayDate(options.now) },
    },
    select: publicEventSelect,
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { title: "asc" }],
    take: Math.min(Math.max(options.limit ?? 24, 1), 24),
  });
  return events.map(toPublicEvent);
}

export async function getPublicEventById(eventId: string): Promise<PublicEvent | null> {
  const event = await prisma.event.findFirst({
    where: { id: eventId, status: EventStatus.PUBLISHED },
    select: publicEventSelect,
  });
  return event ? toPublicEvent(event) : null;
}
