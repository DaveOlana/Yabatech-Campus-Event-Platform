import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { prunePosters } from "../services/poster-cleanup.service.js";

export const maintenanceRouter = Router();

function validCronAuthorization(header: string | undefined, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const supplied = Buffer.from(header);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

maintenanceRouter.get("/internal/maintenance/posters", async (req, res, next) => {
  if (!validCronAuthorization(req.get("Authorization"), process.env.CRON_SECRET)) {
    res.status(401).json({ status: "unauthorized" });
    return;
  }
  try {
    const result = await prunePosters();
    res.status(200).json({ status: "ok", processed: result.processed });
  } catch (error) {
    next(error);
  }
});
