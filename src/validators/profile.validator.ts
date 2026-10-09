import { z } from "zod";

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(150, "Full name must not exceed 150 characters"),
  email: z.string().trim().toLowerCase().email("Please provide a valid email address").max(254, "Email address is too long"),
  departmentId: z.string().uuid("Please select a valid department"),
  levelId: z.string().uuid("Please select a valid level"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
