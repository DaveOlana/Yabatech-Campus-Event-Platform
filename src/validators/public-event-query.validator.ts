import { LevelCode } from "@prisma/client";
import { z } from "zod";

export const publicDateFilters = ["upcoming", "today", "week", "month"] as const;
export type PublicDateFilter = (typeof publicDateFilters)[number];

const codeSchema = z.string().trim().regex(/^[A-Z][A-Z0-9_-]{0,39}$/);
const optionalCodeSchema = z.preprocess((value) => value === "" ? undefined : value, codeSchema.optional());
const querySchema = z.object({
  q: z.string().transform((value) => value.trim().replace(/\s+/g, " ")).pipe(z.string().max(100)).optional(),
  category: optionalCodeSchema,
  department: optionalCodeSchema,
  level: z.preprocess((value) => value === "" ? undefined : value, z.nativeEnum(LevelCode).optional()),
  date: z.enum(publicDateFilters).default("upcoming"),
});

export interface PublicEventQueryState {
  q: string; category: string; department: string; level: string; date: PublicDateFilter;
}

export interface ParsedPublicEventQuery {
  filters: { q?: string; category?: string; department?: string; level?: LevelCode; date: PublicDateFilter };
  state: PublicEventQueryState;
  invalid: boolean;
}

export function parsePublicEventQuery(query: Record<string, unknown>): ParsedPublicEventQuery {
  const repeated = ["q", "category", "department", "level", "date"].some((key) => Array.isArray(query[key]));
  const scalar = (value: unknown) => typeof value === "string" ? value : undefined;
  const raw = { q: scalar(query.q), category: scalar(query.category), department: scalar(query.department), level: scalar(query.level), date: scalar(query.date) || "upcoming" };
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success || repeated) {
    return {
      filters: { q: undefined, category: undefined, department: undefined, level: undefined, date: "upcoming" },
      state: { q: raw.q?.trim().replace(/\s+/g, " ") || "", category: raw.category || "", department: raw.department || "", level: raw.level || "", date: publicDateFilters.includes(raw.date as PublicDateFilter) ? raw.date as PublicDateFilter : "upcoming" as PublicDateFilter },
      invalid: true,
    };
  }
  const q = parsed.data.q || undefined;
  return {
    filters: { ...parsed.data, q },
    state: { q: q || "", category: parsed.data.category || "", department: parsed.data.department || "", level: parsed.data.level || "", date: parsed.data.date },
    invalid: false,
  };
}
