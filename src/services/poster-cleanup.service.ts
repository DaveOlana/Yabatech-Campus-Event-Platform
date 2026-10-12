import { EventStatus, type Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { deleteManagedPoster, listManagedPosters } from "./poster-storage.service.js";

export const POSTER_RETENTION_DAYS = 30;
export const ORPHAN_GRACE_HOURS = 24;

export interface PosterCleanupResult {
  processed: number;
  eventPostersCleared: number;
  orphanPostersDeleted: number;
  failures: number;
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function expiredEventPosterWhere(now = new Date()): Prisma.EventWhereInput {
  const retentionCutoff = daysAgo(now, POSTER_RETENTION_DAYS);
  return {
    posterBlobPath: { not: null },
    OR: [
      { status: EventStatus.PUBLISHED, eventDate: { lte: retentionCutoff } },
      { status: EventStatus.COMPLETED, eventDate: { lte: retentionCutoff } },
      { status: EventStatus.CANCELLED, cancelledAt: { lte: retentionCutoff } },
      { status: EventStatus.REJECTED, reviewedAt: { lte: retentionCutoff } },
      { status: { in: [EventStatus.DRAFT, EventStatus.PENDING_APPROVAL] }, eventDate: { lte: retentionCutoff } },
    ],
  };
}

function safeCleanupLog(category: string, pathname: string, error: unknown): void {
  console.error(`Poster cleanup ${category} failed for ${pathname}:`, error instanceof Error ? error.name : "unknown error");
}

export async function prunePosters(now = new Date()): Promise<PosterCleanupResult> {
  const result: PosterCleanupResult = { processed: 0, eventPostersCleared: 0, orphanPostersDeleted: 0, failures: 0 };
  const handledPaths = new Set<string>();
  const expired = await prisma.event.findMany({
    where: expiredEventPosterWhere(now),
    select: { id: true, posterUrl: true, posterBlobPath: true },
  });

  for (const event of expired) {
    if (!event.posterBlobPath) continue;
    const cleared = await prisma.event.updateMany({
      where: { id: event.id, posterBlobPath: event.posterBlobPath },
      data: { posterBlobPath: null, posterUrl: null },
    });
    if (cleared.count !== 1) continue;
    result.eventPostersCleared += 1;
    result.processed += 1;
    handledPaths.add(event.posterBlobPath);
    try {
      await deleteManagedPoster(event.posterBlobPath);
    } catch (error) {
      result.failures += 1;
      safeCleanupLog("event asset deletion", event.posterBlobPath, error);
    }
  }

  const references = new Set((await prisma.event.findMany({
    where: { posterBlobPath: { not: null } },
    select: { posterBlobPath: true },
  })).flatMap((event) => event.posterBlobPath ? [event.posterBlobPath] : []));
  const orphanCutoff = new Date(now.getTime() - ORPHAN_GRACE_HOURS * 60 * 60 * 1000);
  for (const poster of await listManagedPosters()) {
    if (handledPaths.has(poster.pathname) || references.has(poster.pathname) || poster.uploadedAt > orphanCutoff) continue;
    try {
      await deleteManagedPoster(poster.pathname);
      result.orphanPostersDeleted += 1;
      result.processed += 1;
    } catch (error) {
      result.failures += 1;
      safeCleanupLog("orphan deletion", poster.pathname, error);
    }
  }
  return result;
}
