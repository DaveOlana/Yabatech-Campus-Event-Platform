import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import path from "path";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../src/db.js";
import { User } from "@prisma/client";
import { managementPasswordSchema, managementUsernameSchema, normalizeManagementUsername } from "../src/validators/auth.validator.js";

const adminBootstrapSchema = z.object({
  name: z.string().trim().min(1, "Management display name is required").max(120),
  username: managementUsernameSchema,
  password: managementPasswordSchema,
});

export interface BootstrapAdminOptions {
  name?: string;
  username?: string;
  password?: string;
  updateExistingCredentials?: boolean;
}

export type BootstrapAdminResult =
  | { created: true; updated?: false; user: User }
  | { created: false; updated: true; user: User }
  | { created: false; updated?: false; reason: "ADMIN_ALREADY_EXISTS"; user: User };

/**
 * Creates the single Management account, or explicitly updates that same row
 * when --update-existing is supplied. Credentials always come from arguments
 * or ignored environment configuration and are never printed.
 */
export async function bootstrapAdmin(options: BootstrapAdminOptions = {}): Promise<BootstrapAdminResult> {
  const validated = adminBootstrapSchema.parse({
    name: options.name ?? process.env.YCEP_ADMIN_NAME ?? "YABATECH Management",
    username: options.username ?? process.env.YCEP_ADMIN_USERNAME,
    password: options.password ?? process.env.YCEP_ADMIN_PASSWORD,
  });
  const normalizedUsername = normalizeManagementUsername(validated.username);
  const existingAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });

  if (existingAdmin) {
    if (options.updateExistingCredentials) {
      const passwordHash = await bcrypt.hash(validated.password, 10);
      const user = await prisma.user.update({
        where: { id: existingAdmin.id },
        data: {
          fullName: validated.name,
          managementUsername: validated.username,
          managementUsernameNormalized: normalizedUsername,
          passwordHash,
        },
      });
      return { created: false, updated: true, user };
    }
    if (existingAdmin.managementUsernameNormalized === normalizedUsername) {
      return { created: false, reason: "ADMIN_ALREADY_EXISTS", user: existingAdmin };
    }
    throw new Error("An ADMIN account already exists with a different Management username. Use the explicit --update-existing option to change it.");
  }

  const passwordHash = await bcrypt.hash(validated.password, 10);
  const user = await prisma.user.create({
    data: {
      fullName: validated.name,
      email: `management-${randomUUID()}@ycep.invalid`,
      managementUsername: validated.username,
      managementUsernameNormalized: normalizedUsername,
      passwordHash,
      role: "ADMIN",
      matricNumber: null,
      departmentId: null,
      levelId: null,
    },
  });
  return { created: true, user };
}

export async function resetAdminPassword(password = process.env.YCEP_ADMIN_PASSWORD): Promise<User> {
  const validatedPassword = managementPasswordSchema.parse(password);
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) throw new Error("No ADMIN account exists. Run admin:bootstrap first.");
  return prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(validatedPassword, 10) } });
}

const isDirectlyExecuted = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isDirectlyExecuted()) {
  const resetPasswordOnly = process.argv.includes("--reset-password");
  const updateExistingCredentials = process.argv.includes("--update-existing");
  const action = resetPasswordOnly
    ? resetAdminPassword().then(() => "Management password reset successfully.")
    : bootstrapAdmin({ updateExistingCredentials }).then((result) => result.created ? "Management account created successfully." : result.updated ? "Management credentials updated successfully." : "Management account already exists.");
  action.then((message) => { console.log(message); process.exit(0); }).catch((error: Error) => { console.error(`Management credential command failed: ${error.message}`); process.exit(1); });
}
