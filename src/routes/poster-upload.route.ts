import { Router, type NextFunction, type Request, type Response } from "express";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { requireOrganizer } from "../middleware/auth.middleware.js";
import { MAX_POSTER_BYTES, POSTER_MIME_TYPES } from "../services/poster-storage.service.js";

export const posterUploadRouter = Router();
const POSTER_PATH = /^ycep\/posters\/[0-9a-f-]{36}\.(?:png|jpg|webp)$/i;

function requireOrganizerForToken(req: Request, res: Response, next: NextFunction) {
  if (req.body?.type === "blob.upload-completed") return next();
  return requireOrganizer(req, res, next);
}

posterUploadRouter.post(
  "/organizer/posters/upload",
  requireOrganizerForToken,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as HandleUploadPresignedBody;
      if (body.type !== "blob.generate-presigned-url" && body.type !== "blob.upload-completed") {
        return res.status(400).json({ success: false, message: "Invalid poster upload request." });
      }
      if (body.type === "blob.generate-presigned-url" && !req.organizerAuthorization) {
        return res.status(403).json({ success: false, message: "Organizer authorization is required." });
      }

      const result = await handleUploadPresigned({
        body,
        request: req,
        getSignedToken: async (pathname, _clientPayload, multipart) => {
          if (!req.organizerAuthorization) throw new Error("Organizer authorization is required.");
          if (multipart || !POSTER_PATH.test(pathname)) throw new Error("Invalid poster upload path.");
          const validUntil = Date.now() + 10 * 60 * 1000;
          return {
            token: await issueSignedToken({
              pathname,
              operations: ["put"],
              allowedContentTypes: [...POSTER_MIME_TYPES],
              maximumSizeInBytes: MAX_POSTER_BYTES,
              validUntil,
            }),
            urlOptions: {
              allowedContentTypes: [...POSTER_MIME_TYPES],
              maximumSizeInBytes: MAX_POSTER_BYTES,
              validUntil,
              addRandomSuffix: false,
              allowOverwrite: false,
              cacheControlMaxAge: 30 * 24 * 60 * 60,
              tokenPayload: JSON.stringify({ organizerAuthorizationId: req.organizerAuthorization.id }),
            },
          };
        },
        onUploadCompleted: async ({ blob }) => {
          if (!POSTER_PATH.test(blob.pathname)) throw new Error("Invalid completed poster path.");
        },
      });
      return res.status(200).json(result);
    } catch (error) {
      if (req.body?.type === "blob.generate-presigned-url") {
        return res.status(400).json({ success: false, message: "Poster upload authorization failed." });
      }
      next(error);
    }
  },
);
