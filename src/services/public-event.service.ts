import { EventStatus, LevelCode, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { getLagosClockTime, getLagosTodayDate, getPublicDateRange } from "../utils/event-display.js";
import type { PublicDateFilter } from "../validators/public-event-query.validator.js";

export interface PublicEvent {
  id: string; title: string; description: string; posterUrl: string | null;
  registrationUrl: string | null;
  category: { name: string; code: string }; eventDate: Date; startTime: string;
  endTime: string; venue: string; organizerPublicName: string;
  status: EventStatus;
  cancelledAt: Date | null; cancellationReason: string | null;
  targetDepartments: Array<{ name: string; code: string }>;
  targetLevels: Array<{ code: LevelCode; label: string }>;
}

export interface PublicEventFilters {
  q?: string; category?: string; department?: string; level?: LevelCode; date: PublicDateFilter;
}

export interface PublicDiscoveryResult { events: PublicEvent[]; total: number; limit: number }
export interface PublicDiscoveryOptions {
  categories: Array<{ code: string; name: string }>;
  departments: Array<{ code: string; name: string }>;
  levels: Array<{ code: LevelCode; label: string }>;
}

const publicEventSelect = {
  id: true, title: true, description: true, posterUrl: true, registrationUrl: true,
  category: { select: { name: true, code: true } }, eventDate: true,
  startTime: true, endTime: true, venue: true, organizerPublicName: true,
  status: true, cancelledAt: true, cancellationReason: true,
  targetDepartments: { select: { department: { select: { name: true, code: true } } } },
  targetLevels: { select: { level: { select: { code: true, label: true } } } },
} as const;

function toPublicEvent(event: {
  id: string; title: string; description: string; posterUrl: string | null;
  registrationUrl: string | null;
  category: { name: string; code: string }; eventDate: Date; startTime: string;
  endTime: string; venue: string; organizerPublicName: string;
  status: EventStatus;
  cancelledAt: Date | null; cancellationReason: string | null;
  targetDepartments: Array<{ department: { name: string; code: string } }>;
  targetLevels: Array<{ level: { code: LevelCode; label: string } }>;
}): PublicEvent {
  return { ...event, targetDepartments: event.targetDepartments.map(({ department }) => department), targetLevels: event.targetLevels.map(({ level }) => level) };
}

function buildPublicEventWhere(filters: PublicEventFilters, now?: Date): Prisma.EventWhereInput {
  const and: Prisma.EventWhereInput[] = [];
  if (filters.q) {
    const contains = { contains: filters.q, mode: Prisma.QueryMode.insensitive };
    and.push({ OR: [
      { title: contains }, { description: contains }, { venue: contains },
      { organizerPublicName: contains }, { category: { name: contains } },
    ] });
  }
  if (filters.category) and.push({ category: { code: filters.category } });
  if (filters.department) and.push({ OR: [
    { targetDepartments: { some: { department: { code: filters.department } } } },
    { targetDepartments: { none: {} } },
  ] });
  if (filters.level) and.push({ OR: [
    { targetLevels: { some: { level: { code: filters.level } } } },
    { targetLevels: { none: {} } },
  ] });
  const range = getPublicDateRange(filters.date, now);
  const today = getLagosTodayDate(now);
  const todayIsIncluded = range.gte.getTime() === today.getTime();
  if (todayIsIncluded) {
    const futureDateRange = range.lte ? { gt: today, lte: range.lte } : { gt: today };
    and.push({ OR: [
      { eventDate: futureDateRange },
      { eventDate: today, endTime: { gt: getLagosClockTime(now) } },
    ] });
  } else {
    and.push({ eventDate: range });
  }
  return { status: EventStatus.PUBLISHED, ...(and.length ? { AND: and } : {}) };
}

export async function getPublicDiscoveryOptions(): Promise<PublicDiscoveryOptions> {
  const [categories, departments, levels] = await Promise.all([
    prisma.eventCategory.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.department.findMany({ select: { code: true, name: true }, orderBy: { name: "asc" } }),
    prisma.level.findMany({ select: { code: true, label: true }, orderBy: { code: "asc" } }),
  ]);
  return { categories, departments, levels };
}

export async function getPublicUpcomingEvents(filters: PublicEventFilters = { date: "upcoming" }, options: { now?: Date; limit?: number; valid?: boolean } = {}): Promise<PublicDiscoveryResult> {
  const limit = Math.min(Math.max(options.limit ?? 24, 1), 24);
  if (options.valid === false) return { events: [], total: 0, limit };
  const where = buildPublicEventWhere(filters, options.now);
  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, select: publicEventSelect, orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { title: "asc" }], take: limit }),
    prisma.event.count({ where }),
  ]);
  return { events: events.map(toPublicEvent), total, limit };
}

export async function getPublicEventById(eventId: string): Promise<PublicEvent | null> {
  const event = await prisma.event.findFirst({ where: { id: eventId, status: { in: [EventStatus.PUBLISHED, EventStatus.CANCELLED] } }, select: publicEventSelect });
  return event ? toPublicEvent(event) : null;
}
