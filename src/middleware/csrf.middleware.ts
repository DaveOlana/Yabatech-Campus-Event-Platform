import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { isJsonRequest } from "./auth.middleware.js";

const TOKEN_BYTES = 32;
const TOKEN_LENGTH = 43;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

declare module "express-session" { interface SessionData { csrfToken?: string; } }

export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  const publicForm = req.method === "GET" && ["/login", "/register", "/admin/login"].includes(req.path);
  if ((publicForm || req.session.userId) && !req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  res.locals.csrfToken = req.session.csrfToken || "";
  if (req.session.csrfToken) res.setHeader("X-CSRF-Token", req.session.csrfToken);
  next();
}

function validToken(expected: unknown, supplied: unknown): boolean {
  if (typeof expected !== "string" || typeof supplied !== "string" || expected.length !== TOKEN_LENGTH || supplied.length !== TOKEN_LENGTH) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export function verifyCsrfToken(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) return next();
  const directPosterEndpoint = req.path === "/organizer/posters/upload";
  if (directPosterEndpoint && req.body?.type === "blob.upload-completed") return next();
  let directPosterToken: unknown;
  if (directPosterEndpoint && req.body?.type === "blob.generate-presigned-url") {
    try {
      directPosterToken = JSON.parse(req.body?.payload?.clientPayload || "{}").csrfToken;
    } catch {
      directPosterToken = undefined;
    }
  }
  const supplied = req.get("X-CSRF-Token") || req.body?._csrf || directPosterToken;
  if (validToken(req.session.csrfToken, supplied)) return next();
  if (isJsonRequest(req)) {
    res.status(403).json({ success: false, message: "Request could not be verified." });
    return;
  }
  const createEventRequest = req.path === "/organizer/events";
  const updateEventRequest = /^\/organizer\/events\/[0-9a-f-]{36}$/i.test(req.path);
  const returnUrl = createEventRequest ? "/organizer/events/new" : updateEventRequest ? `${req.path}/edit` : undefined;
  res.status(403).render("error", {
    title: "Request could not be verified — YCEP",
    message: "Request could not be verified. Return to the form and try again.",
    returnUrl,
    returnLabel: returnUrl ? "Return to event form" : undefined,
  });
}
