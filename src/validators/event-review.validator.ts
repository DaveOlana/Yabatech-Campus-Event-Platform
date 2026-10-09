import { z } from "zod";

export const rejectEventSchema = z.object({
  rejectionReason: z.string().trim().min(5, "Rejection feedback must be at least 5 characters.").max(500, "Rejection feedback must not exceed 500 characters."),
});
