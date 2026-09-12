import { z } from "zod";

/**
 * Validator for member organizer applications.
 *
 * Requirements:
 * - requestedPublicName: required, 2-100 characters.
 * - phoneNumber: required, 7-20 characters, allows digits, +, spaces, -, (, and ).
 * - organizationName: optional, max 150 characters.
 * - positionTitle: optional, max 100 characters.
 * - reason: required, 10-1000 characters.
 * - evidenceUrlOrText: optional, max 1000 characters.
 */
export const organizerApplicationSchema = z.object({
  requestedPublicName: z
    .string({ required_error: "Public organizer name is required." })
    .trim()
    .min(2, "Public organizer name must be at least 2 characters.")
    .max(100, "Public organizer name cannot exceed 100 characters."),

  phoneNumber: z
    .string({ required_error: "Phone number is required." })
    .trim()
    .min(7, "Phone number must be at least 7 characters.")
    .max(20, "Phone number cannot exceed 20 characters.")
    .regex(/^[0-9+\s\-()]+$/, "Phone number contains invalid characters."),

  organizationName: z
    .string()
    .trim()
    .max(150, "Organization name cannot exceed 150 characters.")
    .optional()
    .or(z.literal("")),

  positionTitle: z
    .string()
    .trim()
    .max(100, "Position or title cannot exceed 100 characters.")
    .optional()
    .or(z.literal("")),

  reason: z
    .string({ required_error: "Reason for requesting organizer access is required." })
    .trim()
    .min(10, "Please provide a reason of at least 10 characters.")
    .max(1000, "Reason cannot exceed 1000 characters."),

  evidenceUrlOrText: z
    .string()
    .trim()
    .max(1000, "Supporting evidence cannot exceed 1000 characters.")
    .optional()
    .or(z.literal("")),
});

export type OrganizerApplicationInput = z.infer<typeof organizerApplicationSchema>;

/**
 * Validator for admin application rejection.
 * Rejection feedback is mandatory (min 5, max 500 characters).
 */
export const adminRejectApplicationSchema = z.object({
  adminReviewNotes: z
    .string({ required_error: "Rejection feedback notes are required." })
    .trim()
    .min(5, "Rejection feedback notes must be at least 5 characters.")
    .max(500, "Rejection feedback notes cannot exceed 500 characters."),
});

export type AdminRejectApplicationInput = z.infer<typeof adminRejectApplicationSchema>;

/**
 * Validator for admin organizer authorization revocation.
 */
export const adminRevokeAuthorizationSchema = z.object({
  revocationReason: z
    .string({ required_error: "Revocation reason is required." })
    .trim()
    .min(5, "Revocation reason must be at least 5 characters.")
    .max(500, "Revocation reason cannot exceed 500 characters."),
});

export type AdminRevokeAuthorizationInput = z.infer<typeof adminRevokeAuthorizationSchema>;
