import { z } from "zod";

const expectedSubmittedAt = z.string().trim().datetime({ message: "Reload this event before making a Management decision." });

export const approveEventSchema = z.object({
  expectedSubmittedAt,
});

export const rejectEventSchema = z.object({
  expectedSubmittedAt,
  rejectionReason: z.string().trim().min(5, "Rejection feedback must be at least 5 characters.").max(500, "Rejection feedback must not exceed 500 characters."),
});
