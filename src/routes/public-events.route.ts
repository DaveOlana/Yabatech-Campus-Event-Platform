import { Router } from "express";
import { getPublicDiscoveryOptions, getPublicEventById, getPublicUpcomingEvents } from "../services/public-event.service.js";
import { formatEventCardDate, formatEventLongDate, formatEventTimeRange, isEventRegistrationActionable } from "../utils/event-display.js";
import { parsePublicEventQuery } from "../validators/public-event-query.validator.js";

export const publicEventsRouter = Router();

publicEventsRouter.get("/about", (_req, res) => {
  res.render("about", { title: "About YCEP" });
});

publicEventsRouter.get("/", async (req, res, next) => {
  try {
    const parsed = parsePublicEventQuery(req.query as Record<string, unknown>);
    const filterOptions = await getPublicDiscoveryOptions();
    const unknownReference =
      (!!parsed.filters.category && !filterOptions.categories.some(({ code }) => code === parsed.filters.category)) ||
      (!!parsed.filters.department && !filterOptions.departments.some(({ code }) => code === parsed.filters.department)) ||
      (!!parsed.filters.level && !filterOptions.levels.some(({ code }) => code === parsed.filters.level));
    const invalidFilters = parsed.invalid || unknownReference;
    const discovery = await getPublicUpcomingEvents(parsed.filters, { valid: !invalidFilters });
    const hasActiveFilters = !!(parsed.state.q || parsed.state.category || parsed.state.department || parsed.state.level || parsed.state.date !== "upcoming" || invalidFilters);
    res.render("index", {
      title: "Discover Campus Events — YCEP",
      ...discovery,
      filters: parsed.state,
      filterOptions,
      invalidFilters,
      hasActiveFilters,
      formatEventCardDate,
      formatEventTimeRange,
    });
  } catch (error) { next(error); }
});

publicEventsRouter.get("/events/:eventId", async (req, res, next) => {
  try {
    const event = await getPublicEventById(req.params.eventId);
    if (!event) {
      res.status(404).render("error", { title: "Event Not Found — YCEP", message: "The event you requested is not available." });
      return;
    }
    res.render("events/detail", {
      title: `${event.title} — YCEP`, event,
      formattedDate: formatEventLongDate(event.eventDate),
      formattedTime: formatEventTimeRange(event.startTime, event.endTime),
      registrationActionable: isEventRegistrationActionable(event),
    });
  } catch (error) { next(error); }
});
