import { z } from "zod";

export const memberLoginSchema = z.object({ matricNumber: z.string().min(1).max(50), password: z.string().min(1).max(200) });

export function collapseUsernameWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeManagementUsername(value: string): string {
  return collapseUsernameWhitespace(value).toLocaleLowerCase("en-NG");
}

export const managementUsernameSchema = z.string()
  .transform(collapseUsernameWhitespace)
  .pipe(z.string().min(3, "Management username must be at least 3 characters").max(80, "Management username cannot exceed 80 characters"));

export const managementPasswordSchema = z.string().min(8, "Password must be at least 8 characters").max(200, "Password cannot exceed 200 characters");

export const adminLoginSchema = z.object({ username: z.string().trim().min(1).max(200), password: z.string().min(1).max(200) });

export const adminUsernameChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newUsername: managementUsernameSchema,
});

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: managementPasswordSchema,
  confirmPassword: z.string().min(1).max(200),
}).refine((data) => data.newPassword === data.confirmPassword, { message: "New password and confirmation must match", path: ["confirmPassword"] });
