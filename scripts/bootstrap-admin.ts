import { fileURLToPath } from "url";
import path from "path";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "../src/db.js";
import { User } from "@prisma/client";

export const FORBIDDEN_PLACEHOLDER_PASSWORDS = [
  "change-me-to-a-secure-admin-password",
  "changeme",
  "password",
  "adminpassword",
  "ycepadminpassword",
];

const adminBootstrapSchema = z.object({
  name: z.string().min(1, "Admin full name is required"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(12, "Admin password must be at least 12 characters long")
    .refine(
      (pwd) => !FORBIDDEN_PLACEHOLDER_PASSWORDS.includes(pwd.toLowerCase()),
      "Default or placeholder password cannot be used. Please provide a secure admin password."
    ),
});

export interface BootstrapAdminOptions {
  name?: string;
  email?: string;
  password?: string;
}

export type BootstrapAdminResult =
  | { created: true; user: User }
  | { created: false; reason: "ADMIN_ALREADY_EXISTS"; user: User };

/**
 * Bootstraps the dedicated YABATECH Management ADMIN account.
 *
 * Rules:
 * - Minimum 12-character password required.
 * - Placeholder passwords explicitly rejected.
 * - Idempotent: If an ADMIN already exists with the same email, exits safely.
 * - Conflict detection: If an ADMIN already exists with a different email, fails with a clear error.
 * - Never creates a second ADMIN or silently resets the password.
 */
export async function bootstrapAdmin(
  options?: BootstrapAdminOptions
): Promise<BootstrapAdminResult> {
  const rawName = options?.name ?? process.env.YCEP_ADMIN_NAME;
  const rawEmail = options?.email ?? process.env.YCEP_ADMIN_EMAIL;
  const rawPassword = options?.password ?? process.env.YCEP_ADMIN_PASSWORD;

  const validated = adminBootstrapSchema.parse({
    name: rawName,
    email: rawEmail,
    password: rawPassword,
  });

  const normalizedEmail = validated.email.trim().toLowerCase();

  // Check if an ADMIN already exists
  const existingAdmin = await prisma.user.findFirst({
    where: { role: "ADMIN" },
  });

  if (existingAdmin) {
    if (existingAdmin.email.toLowerCase() === normalizedEmail) {
      return {
        created: false,
        reason: "ADMIN_ALREADY_EXISTS",
        user: existingAdmin,
      };
    }

    throw new Error(
      `An ADMIN account is already configured with a different identity (${existingAdmin.email}). Conflict detected.`
    );
  }

  // Hash password with bcrypt
  const passwordHash = await bcrypt.hash(validated.password, 10);

  // Create single ADMIN user with null academic identity
  const newAdmin = await prisma.user.create({
    data: {
      fullName: validated.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: "ADMIN",
      matricNumber: null,
      departmentId: null,
      levelId: null,
    },
  });

  return {
    created: true,
    user: newAdmin,
  };
}

// Guard to ensure CLI execution only occurs when executed directly, not when imported in tests
const isDirectlyExecuted = (): boolean => {
  if (!process.argv[1]) return false;
  try {
    const currentScriptPath = fileURLToPath(import.meta.url);
    return path.resolve(process.argv[1]) === path.resolve(currentScriptPath);
  } catch {
    return false;
  }
};

if (isDirectlyExecuted()) {
  bootstrapAdmin()
    .then((result) => {
      if (result.created) {
        console.log(`Successfully bootstrapped ADMIN account: ${result.user.email}`);
      } else {
        console.log(`Admin account already exists: ${result.user.email}`);
      }
      process.exit(0);
    })
    .catch((err: Error) => {
      console.error(`Bootstrap failed: ${err.message}`);
      process.exit(1);
    });
}
