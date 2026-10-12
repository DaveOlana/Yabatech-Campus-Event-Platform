const LAGOS_TIME_ZONE = "Africa/Lagos";

export function getLagosTodayDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: LAGOS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return new Date(`${value("year")}-${value("month")}-${value("day")}T00:00:00.000Z`);
}

export function getLagosClockTime(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: LAGOS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("hour")}:${value("minute")}`;
}

export function isEventPast(eventDate: Date, endTime: string, now = new Date()): boolean {
  const today = getLagosTodayDate(now).getTime();
  const date = new Date(eventDate).getTime();
  return date < today || (date === today && endTime <= getLagosClockTime(now));
}

export function isEventRegistrationActionable(
  event: { eventDate: Date; endTime: string; status: string; registrationUrl: string | null },
  now = new Date(),
): boolean {
  return event.status === "PUBLISHED" && !!event.registrationUrl && !isEventPast(event.eventDate, event.endTime, now);
}

export function getUpcomingEventWhere(now = new Date()): { OR: Array<Record<string, unknown>> } {
  const today = getLagosTodayDate(now);
  return { OR: [{ eventDate: { gt: today } }, { eventDate: today, endTime: { gt: getLagosClockTime(now) } }] };
}

export function getPastEventWhere(now = new Date()): { OR: Array<Record<string, unknown>> } {
  const today = getLagosTodayDate(now);
  return { OR: [{ eventDate: { lt: today } }, { eventDate: today, endTime: { lte: getLagosClockTime(now) } }] };
}

export function getPublicDateRange(filter: "upcoming" | "today" | "week" | "month", now = new Date()): { gte: Date; lte?: Date } {
  const today = getLagosTodayDate(now);
  if (filter === "upcoming") return { gte: today };
  if (filter === "today") return { gte: today, lte: today };
  const end = new Date(today);
  if (filter === "week") end.setUTCDate(end.getUTCDate() + ((7 - end.getUTCDay()) % 7));
  else end.setUTCMonth(end.getUTCMonth() + 1, 0);
  return { gte: today, lte: end };
}

export function getEventDateState(eventDate: Date, now = new Date()): "today" | "upcoming" | "past" {
  const today = getLagosTodayDate(now).getTime();
  const date = new Date(eventDate).getTime();
  if (date === today) return "today";
  return date > today ? "upcoming" : "past";
}

export function getEventTimeState(eventDate: Date, startTime: string, endTime: string, now = new Date()): "upcoming" | "live" | "past" {
  if (isEventPast(eventDate, endTime, now)) return "past";
  const today = getLagosTodayDate(now).getTime();
  const date = new Date(eventDate).getTime();
  if (date === today && startTime <= getLagosClockTime(now)) return "live";
  return "upcoming";
}

export function formatEventCardDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

export function formatEventLongDate(date: Date): string {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatCampusTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return time;
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export function formatEventTimeRange(startTime: string, endTime: string): string {
  return `${formatCampusTime(startTime)} – ${formatCampusTime(endTime)}`;
}
