import { z } from "zod";

export const cancelEventSchema = z.object({
  cancellationReason: z.string().trim().min(10, "Cancellation reason must be at least 10 characters.").max(500, "Cancellation reason cannot exceed 500 characters."),
});

export type CancelEventInput = z.infer<typeof cancelEventSchema>;
