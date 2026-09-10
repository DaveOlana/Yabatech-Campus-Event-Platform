import bcrypt from "bcrypt";
import { PrismaClient, User, MemberVerification } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";
import { RegisterMemberInput } from "../validators/registration.validator.js";

export class RegistrationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "RegistrationError";
    this.statusCode = statusCode;
  }
}

export class DuplicateConflictError extends RegistrationError {
  field: "email" | "matricNumber";
  constructor(field: "email" | "matricNumber", message: string) {
    super(message, 409);
    this.name = "DuplicateConflictError";
    this.field = field;
  }
}

export class ValidationError extends RegistrationError {
  constructor(message: string) {
    super(message, 400);
    this.name = "ValidationError";
  }
}

export class CycleConfigurationError extends RegistrationError {
  constructor(message: string) {
    super(message, 503);
    this.name = "CycleConfigurationError";
  }
}

export interface RegistrationResult {
  user: Omit<User, "passwordHash">;
  verification: MemberVerification;
}

export interface RegisterMemberServiceOptions {
  prismaClient?: PrismaClient;
  simulateVerificationFailure?: boolean;
}

/**
 * Registers a new normal member and automatically grants ACTIVE verification
 * for the current academic year cycle within a single atomic transaction.
 *
 * Rules:
 * - Exactly one current AcademicYearCycle must exist.
 * - Matric number must be unique.
 * - Email must be unique.
 * - Department and level must exist.
 * - Passwords hashed with bcrypt (never plaintext).
 * - Atomic: If verification creation fails, user creation rolls back.
 */
export async function registerMember(
  input: RegisterMemberInput,
  options: RegisterMemberServiceOptions = {}
): Promise<RegistrationResult> {
  const db = options.prismaClient || defaultPrisma;

  return await db.$transaction(async (tx) => {
    // 1. Confirm exactly one current academic year cycle exists
    const currentCycles = await tx.academicYearCycle.findMany({
      where: { isCurrent: true },
    });

    if (currentCycles.length === 0) {
      throw new CycleConfigurationError(
        "Registration is currently unavailable because no active academic cycle is configured."
      );
    }

    if (currentCycles.length > 1) {
      throw new CycleConfigurationError(
        "System configuration error: multiple active academic cycles detected."
      );
    }

    const currentCycle = currentCycles[0];

    // 2. Check for duplicate matric number
    const existingMatric = await tx.user.findUnique({
      where: { matricNumber: input.matricNumber },
    });

    if (existingMatric) {
      throw new DuplicateConflictError(
        "matricNumber",
        "A user with this matric number already exists."
      );
    }

    // 3. Check for duplicate email
    const existingEmail = await tx.user.findUnique({
      where: { email: input.email },
    });

    if (existingEmail) {
      throw new DuplicateConflictError(
        "email",
        "A user with this email address already exists."
      );
    }

    // 4. Validate that department exists
    const department = await tx.department.findUnique({
      where: { id: input.departmentId },
    });

    if (!department) {
      throw new ValidationError("Selected department does not exist.");
    }

    // 5. Validate that level exists
    const level = await tx.level.findUnique({
      where: { id: input.levelId },
    });

    if (!level) {
      throw new ValidationError("Selected level does not exist.");
    }

    // 6. Hash password with bcrypt (salt rounds: 10)
    const passwordHash = await bcrypt.hash(input.password, 10);

    // 7. Create User
    const createdUser = await tx.user.create({
      data: {
        fullName: input.fullName,
        email: input.email,
        matricNumber: input.matricNumber,
        passwordHash,
        role: "MEMBER",
        departmentId: input.departmentId,
        levelId: input.levelId,
      },
    });

    // Hook to test atomic rollback
    if (options.simulateVerificationFailure) {
      throw new Error("Simulated verification creation failure for transaction rollback test");
    }

    // 8. Create user's MemberVerification for current cycle with status ACTIVE
    const verification = await tx.memberVerification.create({
      data: {
        userId: createdUser.id,
        cycleId: currentCycle.id,
        status: "ACTIVE",
        verifiedAt: new Date(),
        expiresAt: currentCycle.endDate,
      },
    });

    const { passwordHash: _, ...safeUser } = createdUser;

    return {
      user: safeUser,
      verification,
    };
  });
}
