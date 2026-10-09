import { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";
import { UpdateProfileInput } from "../validators/profile.validator.js";

export class ProfileUpdateError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "ProfileUpdateError";
  }
}

export async function updateMemberProfile(userId: string, input: UpdateProfileInput, db: PrismaClient = defaultPrisma) {
  return db.$transaction(async (tx) => {
    // Prisma's PostgreSQL interactive transaction uses one client; keep its
    // operations sequential to avoid overlapping client.query calls.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    const department = await tx.department.findUnique({ where: { id: input.departmentId }, select: { id: true } });
    const level = await tx.level.findUnique({ where: { id: input.levelId }, select: { id: true } });
    const emailOwner = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } });

    if (!user || user.role !== "MEMBER") throw new ProfileUpdateError("Member account not found.", 404);
    if (!department) throw new ProfileUpdateError("Selected department does not exist.");
    if (!level) throw new ProfileUpdateError("Selected level does not exist.");
    if (emailOwner && emailOwner.id !== userId) throw new ProfileUpdateError("That email address is already in use.", 409);

    return tx.user.update({
      where: { id: userId },
      data: { fullName: input.fullName, email: input.email, departmentId: input.departmentId, levelId: input.levelId },
      select: {
        id: true, fullName: true, email: true, matricNumber: true, role: true,
        department: true, level: true, createdAt: true, updatedAt: true,
      },
    });
  });
}
