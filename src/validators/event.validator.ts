import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

function isValidCalendarDate(value: string): boolean {
  if (!dateRegex.test(value)) return true;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function idSelectionSchema(message: string) {
  return z
    .union([z.string(), z.array(z.string())])
    .optional()
    .default([])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(z.string().uuid(message)))
    .transform((ids) => Array.from(new Set(ids)));
}

/** Layer 1 event input. Ownership, organizer identity, cycle, and status are server-controlled. */
export const eventDraftSchema = z
  .object({
    title: z.string().trim().min(1, "Event title is required").min(3, "Event title must be at least 3 characters").max(200, "Event title cannot exceed 200 characters"),
    description: z.string().trim().min(1, "Event description is required").min(10, "Event description must be at least 10 characters").max(5000, "Event description cannot exceed 5000 characters"),
    categoryId: z.string().uuid("Please select a valid event category"),
    registrationUrl: z.string().trim().url("Registration link must be a valid URL").max(1000, "Registration link cannot exceed 1000 characters").refine(isHttpsUrl, "Registration link must use https").optional().or(z.literal("")).nullable().transform((value) => value && value.trim().length > 0 ? value.trim() : null),
    removePoster: z.union([z.literal("on"), z.literal("true")]).optional().transform(Boolean),
    eventDate: z.string().trim().regex(dateRegex, "Event date must be in YYYY-MM-DD format").refine(isValidCalendarDate, "Event date must be a valid calendar date"),
    startTime: z.string().trim().regex(timeRegex, "Start time must be in 24-hour format (HH:mm)"),
    endTime: z.string().trim().regex(timeRegex, "End time must be in 24-hour format (HH:mm)"),
    venue: z.string().trim().min(1, "Event venue is required").min(2, "Event venue must be at least 2 characters").max(200, "Event venue cannot exceed 200 characters"),
    targetDepartmentIds: idSelectionSchema("Invalid target department ID"),
    targetLevelIds: idSelectionSchema("Invalid target level ID"),
    suggestedDepartmentName: z.string().trim().max(120, "Suggested department name cannot exceed 120 characters").optional().default(""),
    suggestedDepartmentCode: z.string().trim().toUpperCase().max(12, "Suggested department code cannot exceed 12 characters").regex(/^[A-Z0-9-]*$/, "Suggested department code may contain only letters, numbers, and hyphens").optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.startTime && data.endTime && data.endTime <= data.startTime) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "End time must be after start time", path: ["endTime"] });
    }
    const hasSuggestedName = data.suggestedDepartmentName.length > 0;
    const hasSuggestedCode = data.suggestedDepartmentCode.length > 0;
    if (hasSuggestedName !== hasSuggestedCode) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter both the new department name and short code", path: [hasSuggestedName ? "suggestedDepartmentCode" : "suggestedDepartmentName"] });
    }
    if (hasSuggestedName && data.suggestedDepartmentName.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Suggested department name must be at least 2 characters", path: ["suggestedDepartmentName"] });
    }
    if (hasSuggestedCode && data.suggestedDepartmentCode.length < 2) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Suggested department code must be at least 2 characters", path: ["suggestedDepartmentCode"] });
    }
  });

export type EventDraftInput = z.infer<typeof eventDraftSchema>;
