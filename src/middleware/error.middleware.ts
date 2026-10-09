import crypto from "node:crypto";
import { NextFunction, Request, Response } from "express";
import { isJsonRequest } from "./auth.middleware.js";

export function notFoundHandler(req: Request, res: Response): void {
  if (isJsonRequest(req)) res.status(404).json({ success: false, message: "Not found." });
  else res.status(404).render("error", { title: "Not Found — YCEP", message: "The page you requested could not be found." });
}

export function applicationErrorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) return next(error);
  const typed = error as { type?: string; status?: number; statusCode?: number };
  const status = typed.type === "entity.too.large" ? 413 : typed instanceof SyntaxError && typed.status === 400 ? 400 : 500;
  const errorId = crypto.randomUUID();
  console.error(JSON.stringify({ timestamp: new Date().toISOString(), errorId, method: req.method, path: req.path, status }));
  const message = status === 413 ? "The request is too large." : status === 400 ? "The request could not be understood." : `Something went wrong. Reference: ${errorId}`;
  if (isJsonRequest(req)) res.status(status).json({ success: false, message });
  else res.status(status).render("error", { title: `${status === 500 ? "Unexpected Error" : "Invalid Request"} — YCEP`, message });
}
