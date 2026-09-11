import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

/**
 * Centralized audit action constants.
 * Prevents string typos across routes and services.
 */
export const AUDIT_ACTIONS = {
  ADMIN_LOGIN: "ADMIN_LOGIN",
  ADMIN_LOGOUT: "ADMIN_LOGOUT",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS] | string;

/**
 * Patterns for keys that must NEVER be persisted in audit log metadata.
 */
const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwordhash/i,
  /secret/i,
  /cookie/i,
  /session/i,
  /token/i,
  /authorization/i,
];

/**
 * Defensively removes sensitive authentication and security keys from audit metadata.
 */
export function sanitizeAuditMetadata(val: unknown): unknown {
  if (val === null || val === undefined) {
    return val;
  }
  if (typeof val !== "object") {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeAuditMetadata);
  }

  const sanitized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(k));
    if (!isSensitive) {
      sanitized[k] = sanitizeAuditMetadata(v);
    }
  }
  return sanitized;
}

export interface CreateAuditLogInput {
  actorUserId: string;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Creates an append-only audit log record.
 *
 * Rules:
 * - Application code must NOT expose update or delete operations on audit logs.
 * - Sensitive auth data (passwords, tokens, cookies, secrets) are defensively sanitized.
 * - When an admin performs a privileged database mutation, pass `tx` to commit the mutation
 *   and audit record in the same database transaction wherever practical.
 */
export async function createAuditLog(
  input: CreateAuditLogInput,
  tx?: Prisma.TransactionClient
): Promise<void> {
  const client = tx || prisma;
  const sanitized = input.metadata ? (sanitizeAuditMetadata(input.metadata) as Prisma.InputJsonValue) : undefined;

  await client.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      metadata: sanitized ?? undefined,
    },
  });
}

/**
 * Retrieves recent audit logs for the admin dashboard.
 * Read-only; ordered by newest first.
 */
export async function getRecentAuditLogs(limit = 10) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      actor: {
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
        },
      },
    },
  });
}
