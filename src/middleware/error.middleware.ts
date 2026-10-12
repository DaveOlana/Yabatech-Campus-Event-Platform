import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { isJsonRequest } from "./auth.middleware.js";

export function notFoundHandler(req: Request, res: Response): void {
  if (isJsonRequest(req)) res.status(404).json({ success: false, message: "Not found." });
  else res.status(404).render("error", { title: "Not Found — YCEP", message: "The page you requested could not be found." });
}

export function applicationErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);
  const typed = error as { type?: string; status?: number; statusCode?: number; expose?: boolean; message?: string };
  const status = typed.type === "entity.too.large" ? 413 : typed.status === 400 ? 400 : typed.statusCode === 400 || typed.statusCode === 413 ? typed.statusCode : 500;
  const errorId = crypto.randomUUID();
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), errorId, method: req.method, path: req.path, status }));
  const message = typed.expose && (status === 400 || status === 413) && typed.message ? typed.message : status === 413 ? "The request is too large." : status === 400 ? "The request could not be understood." : `Something went wrong. Reference: ${errorId}`;
  const eventFormMatch = req.method === "POST" && req.path.match(/^\/organizer\/events(?:\/([0-9a-f-]{36}))?$/i);
  if (!isJsonRequest(req) && eventFormMatch) {
    const returnUrl = eventFormMatch[1] ? `/organizer/events/${eventFormMatch[1]}/edit` : "/organizer/events/new";
    res.status(status).render("error", {
      title: `${status === 500 ? "Unexpected Error" : "Invalid Request"} - YCEP`,
      message,
      returnUrl,
      returnLabel: "Return to event form",
    });
    return;
  }
  if (isJsonRequest(req)) res.status(status).json({ success: false, message });
  else res.status(status).render("error", { title: `${status === 500 ? "Unexpected Error" : "Invalid Request"} — YCEP`, message });
}
