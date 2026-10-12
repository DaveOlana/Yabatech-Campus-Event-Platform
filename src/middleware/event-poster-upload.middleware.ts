import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { MAX_POSTER_BYTES, PosterUploadError } from "../services/poster-storage.service.js";

const parser = multer({
  storage: multer.memoryStorage(),
  // A "Select all" audience can legitimately submit every canonical department
  // plus the normal event fields. Keep the request bounded, but leave enough
  // room for the complete catalogue and future Management-approved additions.
  limits: { fileSize: MAX_POSTER_BYTES, files: 1, fields: 200, parts: 202 },
}).single("poster");

const editableEventPath = /^\/organizer\/events(?:\/[0-9a-f-]{36})?$/i;

export function parseEventPosterUpload(req: Request, res: Response, next: NextFunction): void {
  if (req.method !== "POST" || !editableEventPath.test(req.path) || !req.is("multipart/form-data")) {
    next();
    return;
  }
  parser(req, res, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return next(new PosterUploadError("Poster files must be 4 MB or smaller."));
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_COUNT") {
      return next(new PosterUploadError("Only one poster image may be uploaded."));
    }
    if (error instanceof multer.MulterError && (error.code === "LIMIT_FIELD_COUNT" || error.code === "LIMIT_PART_COUNT")) {
      return next(new PosterUploadError("The event form contains too many selections. Clear any unintended choices and try again."));
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_UNEXPECTED_FILE") {
      return next(new PosterUploadError("The event form included an unexpected file. Upload one poster using the poster field."));
    }
    if (error instanceof multer.MulterError) return next(new PosterUploadError("The poster upload could not be processed."));
    next(error);
  });
}
