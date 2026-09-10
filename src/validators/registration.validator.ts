import { z } from "zod";
import { normalizeMatricNumber, MATRIC_NUMBER_REGEX } from "../utils/matric.js";

/**
 * Zod schema for member registration.
 *
 * Password rules:
 * - Minimum 8 characters (sensible V1 baseline for security and usability).
 */
export const registerMemberSchema = z
  .object({
    fullName: z
      .string({ required_error: "Full name is required" })
      .trim()
      .min(2, "Full name must be at least 2 characters")
      .max(150, "Full name must not exceed 150 characters"),
    matricNumber: z
      .string({ required_error: "Matric number is required" })
      .transform((val) => normalizeMatricNumber(val))
      .refine(
        (val) => MATRIC_NUMBER_REGEX.test(val),
        "Matric number must follow the format PREFIX/PROGRAMME/YY/SERIAL (e.g. F/ND/24/3210051)"
      ),
    email: z
      .string({ required_error: "Email is required" })
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address"),
    departmentId: z
      .string({ required_error: "Department is required" })
      .uuid("Invalid department identifier"),
    levelId: z
      .string({ required_error: "Level is required" })
      .uuid("Invalid level identifier"),
    password: z
      .string({ required_error: "Password is required" })
      .min(8, "Password must be at least 8 characters long"),
    passwordConfirmation: z
      .string({ required_error: "Password confirmation is required" }),
  })
  .refine((data) => data.password === data.passwordConfirmation, {
    message: "Passwords do not match",
    path: ["passwordConfirmation"],
  });

export type RegisterMemberInput = z.infer<typeof registerMemberSchema>;
