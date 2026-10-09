import { z } from "zod";

export const memberLoginSchema = z.object({ matricNumber: z.string().min(1).max(50), password: z.string().min(1).max(200) });
export const adminLoginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(200) });
