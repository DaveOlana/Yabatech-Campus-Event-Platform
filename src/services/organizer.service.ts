import {
  OrganizerApplication,
  OrganizerAuthorization,
  OrganizerApplicationStatus,
  OrganizerAuthorizationStatus,
  UserRole,
} from "@prisma/client";
import { prisma } from "../db.js";
import { createAuditLog, AUDIT_ACTIONS } from "./audit.service.js";
import { OrganizerApplicationInput } from "../validators/organizer.validator.js";

// ─── Domain Error Classes ────────────────────────────────────────────────────

export class OrganizerError extends Error {
  constructor(message: string, public statusCode: number = 400) {
    super(message);
    this.name = "OrganizerError";
  }
}

export class OrganizerEligibilityError extends OrganizerError {
  constructor(message: string) {
    super(message, 403);
    this.name = "OrganizerEligibilityError";
  }
}

export class OrganizerConflictError extends OrganizerError {
  constructor(message: string) {
    super(message, 409);
    this.name = "OrganizerConflictError";
  }
}

export class OrganizerNotFoundError extends OrganizerError {
  constructor(message: string) {
    super(message, 404);
    this.name = "OrganizerNotFoundError";
  }
}

export class OrganizerInvalidStateError extends OrganizerError {
  constructor(message: string) {
    super(message, 400);
    this.name = "OrganizerInvalidStateError";
  }
}

// ─── Member Application Subsystem ────────────────────────────────────────────

/**
 * Submits a new OrganizerApplication for an active MEMBER in the current academic cycle.
 *
 * Eligibility rules:
 * - User must exist and have role === MEMBER (ADMIN cannot apply).
 * - Exactly one current AcademicYearCycle must be configured.
 * - Member must have ACTIVE MemberVerification for the current cycle.
 * - Any existing OrganizerAuthorization (ACTIVE, REVOKED, or EXPIRED) for that member
 *   in the current cycle blocks another application (revocation is final for that cycle).
 * - An existing PENDING application in the current cycle blocks another application.
 * - A REJECTED application in the current cycle permits a fresh application while preserving history.
 */
export async function submitOrganizerApplication(
  userId: string,
  input: OrganizerApplicationInput
): Promise<OrganizerApplication> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    throw new OrganizerNotFoundError("User account not found.");
  }

  if (user.role !== UserRole.MEMBER) {
    throw new OrganizerEligibilityError("Only accounts with role MEMBER may apply for organizer privileges.");
  }

  const currentCycle = await prisma.academicYearCycle.findFirst({
    where: { isCurrent: true },
  });

  if (!currentCycle) {
    throw new OrganizerError("No active academic cycle is configured.", 503);
  }

  // Check active verification for current cycle
  const verification = await prisma.memberVerification.findUnique({
    where: {
      userId_cycleId: {
        userId: user.id,
        cycleId: currentCycle.id,
      },
    },
  });

  if (!verification || verification.status !== "ACTIVE") {
    throw new OrganizerEligibilityError(
      "Active member verification for the current academic cycle is required to apply for organizer privileges."
    );
  }

  // Check existing authorization in current cycle (ACTIVE, REVOKED, or EXPIRED)
  const existingAuth = await prisma.organizerAuthorization.findUnique({
    where: {
      userId_cycleId: {
        userId: user.id,
        cycleId: currentCycle.id,
      },
    },
  });

  if (existingAuth) {
    if (existingAuth.status === OrganizerAuthorizationStatus.ACTIVE) {
      throw new OrganizerConflictError(
        "You already possess an active organizer authorization for this academic cycle."
      );
    }
    if (existingAuth.status === OrganizerAuthorizationStatus.REVOKED) {
      throw new OrganizerConflictError(
        "Your organizer authorization for this academic cycle has been revoked. Reapplication is prohibited for this cycle."
      );
    }
    throw new OrganizerConflictError(
      "An organizer authorization already exists for this member in the current academic cycle."
    );
  }

  // Check existing PENDING application in current cycle
  const existingPending = await prisma.organizerApplication.findFirst({
    where: {
      userId: user.id,
      cycleId: currentCycle.id,
      status: OrganizerApplicationStatus.PENDING,
    },
  });

  if (existingPending) {
    throw new OrganizerConflictError(
      "You already have a pending organizer application under review for this academic cycle."
    );
  }

  // Create new application (submission fields frozen)
  return prisma.organizerApplication.create({
    data: {
      userId: user.id,
      cycleId: currentCycle.id,
      requestedPublicName: input.requestedPublicName,
      phoneNumber: input.phoneNumber,
      organizationName: input.organizationName || null,
      positionTitle: input.positionTitle || null,
      reason: input.reason,
      evidenceUrlOrText: input.evidenceUrlOrText || null,
      status: OrganizerApplicationStatus.PENDING,
    },
  });
}

/**
 * Retrieves a member's organizer capability status and application history.
 */
export async function getMemberOrganizerStatus(userId: string) {
  const currentCycle = await prisma.academicYearCycle.findFirst({
    where: { isCurrent: true },
  });

  let currentAuthorization: OrganizerAuthorization | null = null;
  let currentPendingApplication: OrganizerApplication | null = null;
  let currentLatestApplication: OrganizerApplication | null = null;

  if (currentCycle) {
    currentAuthorization = await prisma.organizerAuthorization.findUnique({
      where: {
        userId_cycleId: {
          userId,
          cycleId: currentCycle.id,
        },
      },
      include: {
        application: true,
      },
    });

    currentPendingApplication = await prisma.organizerApplication.findFirst({
      where: {
        userId,
        cycleId: currentCycle.id,
        status: OrganizerApplicationStatus.PENDING,
      },
    });

    currentLatestApplication = await prisma.organizerApplication.findFirst({
      where: {
        userId,
        cycleId: currentCycle.id,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  // Determine effective status in current cycle
  let effectiveStatus: "ACTIVE" | "REVOKED" | "EXPIRED" | "PENDING" | "REJECTED" | "NONE" = "NONE";

  if (currentAuthorization) {
    effectiveStatus = currentAuthorization.status; // ACTIVE, REVOKED, or EXPIRED
  } else if (currentPendingApplication) {
    effectiveStatus = "PENDING";
  } else if (currentLatestApplication && currentLatestApplication.status === OrganizerApplicationStatus.REJECTED) {
    effectiveStatus = "REJECTED";
  }

  const applicationsHistory = await prisma.organizerApplication.findMany({
    where: { userId },
    include: {
      cycle: true,
      authorization: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    currentCycle,
    effectiveStatus,
    currentAuthorization,
    currentPendingApplication,
    currentLatestApplication,
    applicationsHistory,
  };
}

// ─── Admin Review Subsystem ──────────────────────────────────────────────────

/**
 * Retrieves the pending organizer applications queue for the CURRENT academic cycle.
 * Stale applications from prior cycles are excluded from this queue.
 */
export async function getAdminPendingOrganizerApplications() {
  const currentCycle = await prisma.academicYearCycle.findFirst({
    where: { isCurrent: true },
  });

  if (!currentCycle) {
    return [];
  }

  return prisma.organizerApplication.findMany({
    where: {
      cycleId: currentCycle.id,
      status: OrganizerApplicationStatus.PENDING,
    },
    include: {
      user: {
        include: {
          department: true,
          level: true,
          verifications: {
            where: { cycleId: currentCycle.id },
          },
        },
      },
      cycle: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Retrieves a detailed view of an organizer application for admin review.
 */
export async function getAdminOrganizerApplicationDetail(applicationId: string) {
  const application = await prisma.organizerApplication.findUnique({
    where: { id: applicationId },
    include: {
      user: {
        include: {
          department: true,
          level: true,
          verifications: true,
        },
      },
      cycle: true,
      reviewer: {
        select: { id: true, fullName: true, email: true },
      },
      authorization: true,
    },
  });

  if (!application) {
    throw new OrganizerNotFoundError("Organizer application not found.");
  }

  const currentCycle = await prisma.academicYearCycle.findFirst({
    where: { isCurrent: true },
  });

  const applicantCurrentVerification = application.user.verifications.find(
    (v) => v.cycleId === currentCycle?.id
  );

  return {
    application,
    currentCycle,
    isCurrentCycle: currentCycle ? application.cycleId === currentCycle.id : false,
    applicantCurrentVerification,
  };
}

/**
 * Approves a PENDING organizer application in a concurrency-safe PostgreSQL transaction.
 *
 * Invariants enforced inside the transaction:
 * 1. Concrete OrganizerApplication row is locked via `SELECT ... FOR UPDATE`.
 * 2. Application exists and status is PENDING.
 * 3. Application belongs to the current academic cycle.
 * 4. Applicant still exists and has role === MEMBER.
 * 5. Applicant still has ACTIVE MemberVerification for that exact cycle.
 * 6. No OrganizerAuthorization exists for that user and cycle.
 * 7. Atomically sets application status to APPROVED, creates OrganizerAuthorization with ACTIVE,
 *    and writes AuditLog record. Rollback everything on failure.
 */
export async function approveOrganizerApplication(
  adminUserId: string,
  applicationId: string
): Promise<{ application: OrganizerApplication; authorization: OrganizerAuthorization }> {
  return prisma.$transaction(async (tx) => {
    // 1. Lock the concrete OrganizerApplication row
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        cycle_id: string;
        requested_public_name: string;
        status: OrganizerApplicationStatus;
      }>
    >`
      SELECT id, user_id, cycle_id, requested_public_name, status
      FROM "OrganizerApplication"
      WHERE id = ${applicationId}
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new OrganizerNotFoundError("Organizer application not found.");
    }

    const appRow = lockedRows[0];

    // 2. Status must be PENDING
    if (appRow.status !== OrganizerApplicationStatus.PENDING) {
      throw new OrganizerInvalidStateError(
        `Application is not pending (current status: ${appRow.status}). Decision cannot be applied.`
      );
    }

    // 3. Cycle must be the CURRENT academic year cycle
    const currentCycle = await tx.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    if (!currentCycle || currentCycle.id !== appRow.cycle_id) {
      throw new OrganizerInvalidStateError(
        "Application belongs to an expired or non-current academic cycle and cannot be approved."
      );
    }

    // 4. Applicant must have role === MEMBER
    const applicant = await tx.user.findUnique({
      where: { id: appRow.user_id },
    });

    if (!applicant || applicant.role !== UserRole.MEMBER) {
      throw new OrganizerEligibilityError(
        "Applicant does not hold an active MEMBER account. Approval cannot proceed."
      );
    }

    // 5. Applicant must have ACTIVE MemberVerification for that exact cycle
    const verification = await tx.memberVerification.findUnique({
      where: {
        userId_cycleId: {
          userId: applicant.id,
          cycleId: appRow.cycle_id,
        },
      },
    });

    if (!verification || verification.status !== "ACTIVE") {
      throw new OrganizerEligibilityError(
        "Applicant's member verification is no longer active for this academic cycle. Approval rejected."
      );
    }

    // 6. Ensure no OrganizerAuthorization already exists for this user/cycle
    const existingAuth = await tx.organizerAuthorization.findUnique({
      where: {
        userId_cycleId: {
          userId: applicant.id,
          cycleId: appRow.cycle_id,
        },
      },
    });

    if (existingAuth) {
      throw new OrganizerConflictError(
        "An organizer authorization already exists for this user and academic cycle."
      );
    }

    const now = new Date();

    // 7. Atomically update application to APPROVED
    const updatedApplication = await tx.organizerApplication.update({
      where: { id: appRow.id },
      data: {
        status: OrganizerApplicationStatus.APPROVED,
        reviewerUserId: adminUserId,
        reviewedAt: now,
      },
    });

    // 8. Create OrganizerAuthorization
    const authorization = await tx.organizerAuthorization.create({
      data: {
        userId: applicant.id,
        cycleId: appRow.cycle_id,
        applicationId: appRow.id,
        approvedPublicName: appRow.requested_public_name,
        status: OrganizerAuthorizationStatus.ACTIVE,
        grantedAt: now,
      },
    });

    // 9. Write AuditLog inside the transaction
    await createAuditLog(
      {
        actorUserId: adminUserId,
        action: AUDIT_ACTIONS.ORGANIZER_APPLICATION_APPROVED,
        targetType: "OrganizerApplication",
        targetId: appRow.id,
        metadata: {
          applicantUserId: applicant.id,
          cycleId: appRow.cycle_id,
          authorizationId: authorization.id,
          approvedPublicName: authorization.approvedPublicName,
        },
      },
      tx
    );

    return { application: updatedApplication, authorization };
  });
}

/**
 * Rejects a PENDING organizer application in a concurrency-safe PostgreSQL transaction.
 *
 * Invariants enforced inside the transaction:
 * 1. Concrete OrganizerApplication row is locked via `SELECT ... FOR UPDATE`.
 * 2. Application exists and status is PENDING.
 * 3. Application belongs to the current academic cycle.
 * 4. Atomically sets status to REJECTED, records review notes and reviewer,
 *    and writes AuditLog record. Rollback everything on failure.
 */
export async function rejectOrganizerApplication(
  adminUserId: string,
  applicationId: string,
  reviewNotes: string
): Promise<OrganizerApplication> {
  const trimmedNotes = reviewNotes ? reviewNotes.trim() : "";
  if (!trimmedNotes || trimmedNotes.length < 5) {
    throw new OrganizerError("Rejection feedback notes of at least 5 characters are required.", 400);
  }

  return prisma.$transaction(async (tx) => {
    // 1. Lock the concrete OrganizerApplication row
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        cycle_id: string;
        status: OrganizerApplicationStatus;
      }>
    >`
      SELECT id, user_id, cycle_id, status
      FROM "OrganizerApplication"
      WHERE id = ${applicationId}
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new OrganizerNotFoundError("Organizer application not found.");
    }

    const appRow = lockedRows[0];

    // 2. Status must be PENDING
    if (appRow.status !== OrganizerApplicationStatus.PENDING) {
      throw new OrganizerInvalidStateError(
        `Application is not pending (current status: ${appRow.status}). Decision cannot be applied.`
      );
    }

    // 3. Cycle must be the CURRENT academic year cycle
    const currentCycle = await tx.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    if (!currentCycle || currentCycle.id !== appRow.cycle_id) {
      throw new OrganizerInvalidStateError(
        "Application belongs to an expired or non-current academic cycle and cannot be rejected."
      );
    }

    const now = new Date();

    // 4. Atomically update application to REJECTED
    const updatedApplication = await tx.organizerApplication.update({
      where: { id: appRow.id },
      data: {
        status: OrganizerApplicationStatus.REJECTED,
        adminReviewNotes: trimmedNotes,
        reviewerUserId: adminUserId,
        reviewedAt: now,
      },
    });

    // 5. Write AuditLog inside transaction
    await createAuditLog(
      {
        actorUserId: adminUserId,
        action: AUDIT_ACTIONS.ORGANIZER_APPLICATION_REJECTED,
        targetType: "OrganizerApplication",
        targetId: appRow.id,
        metadata: {
          applicantUserId: appRow.user_id,
          cycleId: appRow.cycle_id,
          reviewNotes: trimmedNotes,
        },
      },
      tx
    );

    return updatedApplication;
  });
}

/**
 * Revokes an existing ACTIVE organizer authorization for the current academic cycle.
 *
 * Invariants:
 * 1. Concrete OrganizerAuthorization row is locked via `SELECT ... FOR UPDATE`.
 * 2. Authorization exists and status is ACTIVE.
 * 3. Authorization belongs to current academic cycle.
 * 4. Reason is required.
 * 5. Atomically sets status to REVOKED, records revokedAt and revocationReason,
 *    and writes AuditLog record.
 * 6. Never mutates the original OrganizerApplication back from APPROVED.
 */
export async function revokeOrganizerAuthorization(
  adminUserId: string,
  authorizationId: string,
  reason: string
): Promise<OrganizerAuthorization> {
  return prisma.$transaction(async (tx) => {
    // 1. Lock the concrete OrganizerAuthorization row
    const lockedRows = await tx.$queryRaw<
      Array<{
        id: string;
        user_id: string;
        cycle_id: string;
        application_id: string;
        status: OrganizerAuthorizationStatus;
      }>
    >`
      SELECT id, user_id, cycle_id, application_id, status
      FROM "OrganizerAuthorization"
      WHERE id = ${authorizationId}
      FOR UPDATE
    `;

    if (!lockedRows || lockedRows.length === 0) {
      throw new OrganizerNotFoundError("Organizer authorization not found.");
    }

    const authRow = lockedRows[0];

    // 2. Status must be ACTIVE
    if (authRow.status !== OrganizerAuthorizationStatus.ACTIVE) {
      throw new OrganizerInvalidStateError(
        `Authorization is not active (current status: ${authRow.status}). It cannot be revoked.`
      );
    }

    // 3. Cycle must be current
    const currentCycle = await tx.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    if (!currentCycle || currentCycle.id !== authRow.cycle_id) {
      throw new OrganizerInvalidStateError(
        "Authorization belongs to a non-current academic cycle and cannot be revoked."
      );
    }

    const now = new Date();

    // 4. Atomically update status to REVOKED
    const updatedAuthorization = await tx.organizerAuthorization.update({
      where: { id: authRow.id },
      data: {
        status: OrganizerAuthorizationStatus.REVOKED,
        revokedAt: now,
        revocationReason: reason,
      },
    });

    // 5. Write AuditLog inside transaction
    await createAuditLog(
      {
        actorUserId: adminUserId,
        action: AUDIT_ACTIONS.ORGANIZER_AUTHORIZATION_REVOKED,
        targetType: "OrganizerAuthorization",
        targetId: authRow.id,
        metadata: {
          targetUserId: authRow.user_id,
          cycleId: authRow.cycle_id,
          applicationId: authRow.application_id,
          reason,
        },
      },
      tx
    );

    return updatedAuthorization;
  });
}
