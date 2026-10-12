import { NextFunction, Request, Response, Router } from "express";
import { requireAdmin, isJsonRequest } from "../middleware/auth.middleware.js";
import { approveEvent, cancelPublishedEventAsManagement, EventError, getEventForManagementReview, getEventHistoryForManagement, getPendingEventsForManagement, rejectEvent, type ManagementEventHistoryStatus } from "../services/event.service.js";
import { rejectEventSchema } from "../validators/event-review.validator.js";
import { cancelEventSchema } from "../validators/event-cancellation.validator.js";
import { getEventTimeState } from "../utils/event-display.js";

export const adminEventsRouter = Router();
adminEventsRouter.use("/admin/events", requireAdmin);

function respondWithError(req: Request, res: Response, error: EventError): void {
  if (isJsonRequest(req)) {
    res.status(error.statusCode).json({ success: false, message: error.message });
    return;
  }
  res.status(error.statusCode).render("error", { title: "Event Review Error — YCEP", message: error.message });
}

adminEventsRouter.get("/admin/events", async (req, res, next) => {
  try {
    const events = await getPendingEventsForManagement();
    if (isJsonRequest(req)) return res.json({ success: true, events });
    res.render("admin/events/index", { title: "Event Approval Queue — YCEP", user: req.user, events });
  } catch (error) { next(error); }
});

adminEventsRouter.get("/admin/events/history", async (req, res, next) => {
  try {
    const allowed: ManagementEventHistoryStatus[] = ["all", "published", "rejected", "cancelled", "past"];
    const requested = typeof req.query.status === "string" ? req.query.status : "all";
    const status: ManagementEventHistoryStatus = allowed.includes(requested as ManagementEventHistoryStatus) ? requested as ManagementEventHistoryStatus : "all";
    const events = await getEventHistoryForManagement(status);
    if (isJsonRequest(req)) return res.json({ success: true, events, status });
    res.render("admin/events/history", { title: "Event History — YCEP", user: req.user, events, status, getEventTimeState });
  } catch (error) { next(error); }
});

adminEventsRouter.get("/admin/events/:eventId", async (req, res, next) => {
  try {
    const detail = await getEventForManagementReview(req.params.eventId);
    if (isJsonRequest(req)) return res.json({ success: true, ...detail });
    res.render("admin/events/detail", { title: `Review Event: ${detail.event.title} — YCEP`, user: req.user, ...detail, errorMessage: null });
  } catch (error) {
    if (error instanceof EventError) return respondWithError(req, res, error);
    next(error);
  }
});

adminEventsRouter.post("/admin/events/:eventId/approve", async (req, res, next) => {
  try {
    const event = await approveEvent(req.user!.id, req.params.eventId);
    if (isJsonRequest(req)) return res.json({ success: true, message: "Event approved and published.", event });
    res.redirect("/admin/events");
  } catch (error) {
    if (error instanceof EventError) return respondWithError(req, res, error);
    next(error);
  }
});

adminEventsRouter.post("/admin/events/:eventId/reject", async (req, res, next) => {
  const parsed = rejectEventSchema.safeParse(req.body);
  if (!parsed.success) {
    const error = new EventError(parsed.error.errors[0]?.message ?? "Valid rejection feedback is required.", 400);
    return respondWithError(req, res, error);
  }
  try {
    const event = await rejectEvent(req.user!.id, req.params.eventId, parsed.data.rejectionReason);
    if (isJsonRequest(req)) return res.json({ success: true, message: "Event rejected.", event });
    res.redirect("/admin/events");
  } catch (error) {
    if (error instanceof EventError) return respondWithError(req, res, error);
    next(error);
  }
});

adminEventsRouter.post("/admin/events/:eventId/cancel", async (req, res, next) => {
  const parsed = cancelEventSchema.safeParse(req.body);
  if (!parsed.success) return respondWithError(req, res, new EventError(parsed.error.errors[0]?.message ?? "A valid withdrawal reason is required.", 400));
  try {
    const event = await cancelPublishedEventAsManagement(req.user!.id, req.params.eventId, parsed.data.cancellationReason);
    if (isJsonRequest(req)) return res.json({ success: true, message: "Event withdrawn from publication.", event });
    res.redirect(`/admin/events/${event.id}`);
  } catch (error) {
    if (error instanceof EventError) return respondWithError(req, res, error);
    next(error);
  }
});
