import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { isJsonRequest } from "./auth.middleware.js";

export const TOKEN_BYTES = 32;
export const TOKEN_LENGTH = 43;
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

declare module "express-session" {
  interface SessionData {
    csrfToken?: string;
  }
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(TOKEN_BYTES).toString("base64url");
}

export function preventFormCaching(res: Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("Pragma", "no-cache");
}

export function isPublicFormRoute(path: string): boolean {
  const normalizedPath = path.replace(/\/+$/, "") || "/";
  return ["/login", "/register", "/admin/login"].includes(normalizedPath);
}

export function ensureCsrfToken(req: Request, res: Response, next: NextFunction): void {
  const publicForm = isPublicFormRoute(req.path);
  if ((publicForm || req.session?.userId) && !req.session?.csrfToken) {
    if (req.session) {
      req.session.csrfToken = generateCsrfToken();
    }
  }

  res.locals.csrfToken = req.session?.csrfToken || "";
  if (req.session?.csrfToken) {
    res.setHeader("X-CSRF-Token", req.session.csrfToken);
  }

  // Prevent browser caching for auth views and authenticated form views so stale tokens aren't restored from disk cache
  if (publicForm || req.session?.userId) {
    preventFormCaching(res);
  }

  next();
}

export function validToken(expected: unknown, supplied: unknown): boolean {
  if (
    typeof expected !== "string" ||
    typeof supplied !== "string" ||
    expected.length !== TOKEN_LENGTH ||
    supplied.length !== TOKEN_LENGTH
  ) {
    return false;
  }
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
  if (validToken(req.session?.csrfToken, supplied)) return next();

  // Safe structured diagnostics (NO raw tokens, session IDs, credentials, or secrets)
  console.warn("[CSRF] Verification failed", {
    path: req.path,
    method: req.method,
    hasSession: Boolean(req.session),
    hasStoredToken: Boolean(req.session?.csrfToken),
    hasSuppliedToken: Boolean(supplied),
    hasSessionCookie: Boolean(req.headers.cookie?.includes("ycep.sid")),
  });

  if (isJsonRequest(req)) {
    res.status(403).json({ success: false, message: "Request could not be verified." });
    return;
  }

  const normalizedPath = req.path.replace(/\/+$/, "") || "/";
  let returnUrl: string | undefined;
  let returnLabel: string | undefined;
  let message = "Request could not be verified. Return to the form and try again.";

  if (normalizedPath === "/login") {
    returnUrl = "/login";
    returnLabel = "Return to sign in";
    message = "Your form expired. Reload and try again.";
  } else if (normalizedPath === "/admin/login") {
    returnUrl = "/admin/login";
    returnLabel = "Return to Management sign in";
    message = "Your form expired. Reload and try again.";
  } else if (normalizedPath === "/register") {
    returnUrl = "/register";
    returnLabel = "Return to registration";
    message = "Your form expired. Reload and try again.";
  } else if (normalizedPath === "/organizer/apply") {
    returnUrl = "/organizer/apply";
    returnLabel = "Return to organizer application";
    message = "Your form expired. Reload and try again.";
  } else if (normalizedPath === "/organizer/events") {
    returnUrl = "/organizer/events/new";
    returnLabel = "Return to event form";
  } else if (/^\/organizer\/events\/[0-9a-f-]{36}$/i.test(normalizedPath)) {
    returnUrl = `${normalizedPath}/edit`;
    returnLabel = "Return to event form";
  }

  res.status(403).render("error", {
    title: "Request could not be verified — YCEP",
    message,
    returnUrl,
    returnLabel,
  });
}
