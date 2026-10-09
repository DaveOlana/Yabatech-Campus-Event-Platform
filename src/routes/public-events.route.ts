import { Router } from "express";
import { getPublicEventById, getPublicUpcomingEvents } from "../services/public-event.service.js";
import { formatEventCardDate, formatEventLongDate, formatEventTimeRange } from "../utils/event-display.js";

export const publicEventsRouter = Router();

publicEventsRouter.get("/", async (_req, res, next) => {
  try {
    const events = await getPublicUpcomingEvents();
    res.render("index", {
      title: "Discover Campus Events — YCEP",
      events,
      formatEventCardDate,
      formatEventTimeRange,
    });
  } catch (error) {
    next(error);
  }
});

publicEventsRouter.get("/events/:eventId", async (req, res, next) => {
  try {
    const event = await getPublicEventById(req.params.eventId);
    if (!event) {
      res.status(404).render("error", {
        title: "Event Not Found — YCEP",
        message: "The event you requested is not available.",
      });
      return;
    }
    res.render("events/detail", {
      title: `${event.title} — YCEP`,
      event,
      formattedDate: formatEventLongDate(event.eventDate),
      formattedTime: formatEventTimeRange(event.startTime, event.endTime),
    });
  } catch (error) {
    next(error);
  }
});
