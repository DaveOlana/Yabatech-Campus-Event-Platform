import { Request, Response } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { isJsonRequest } from "./auth.middleware.js";

function handler(req: Request, res: Response): void {
  const message = "Too many attempts. Please wait and try again.";
  if (isJsonRequest(req)) res.status(429).json({ success: false, message });
  else res.status(429).render("error", { title: "Too many attempts — YCEP", message });
}

const testAwareKey = (req: Request) => process.env.NODE_ENV === "test" ? req.sessionID : ipKeyGenerator(req.ip!);
const base = { standardHeaders: "draft-7" as const, legacyHeaders: false, handler, keyGenerator: testAwareKey, skipSuccessfulRequests: true };
export const memberLoginLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 10 });
export const adminLoginLimiter = rateLimit({ ...base, windowMs: 15 * 60_000, limit: 5 });
export const registrationLimiter = rateLimit({ ...base, skipSuccessfulRequests: false, windowMs: 60 * 60_000, limit: 5 });
