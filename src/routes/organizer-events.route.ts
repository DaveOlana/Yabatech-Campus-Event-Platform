import { Router, Request, Response, NextFunction } from "express";
import { requireOrganizer, isJsonRequest } from "../middleware/auth.middleware.js";
import { eventDraftSchema } from "../validators/event.validator.js";
import {
  createEventDraft,
  getOrganizerEvents,
  getOrganizerEventById,
  getOrganizerEventDraftById,
  updateEventDraft,
  getEventFormData,
  EventNotFoundError,
  EventValidationError,
  EventInvalidStateError,
  EventError,
  submitEventForReview,
} from "../services/event.service.js";

export const organizerEventsRouter = Router();

// Apply requireOrganizer middleware specifically to all /organizer/events endpoints
organizerEventsRouter.use("/organizer/events", requireOrganizer);

/**
 * GET /organizer/events
 * Lists all draft events owned by the current organizer authorization.
 */
organizerEventsRouter.get(
  "/organizer/events",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const jsonExpected = isJsonRequest(req);

    try {
      const events = await getOrganizerEvents(auth.id);

      if (jsonExpected) {
        res.status(200).json({
          success: true,
          events,
        });
        return;
      }

      res.render("organizer/events/index", {
        title: "My Events — YCEP",
        user: req.user,
        authorization: auth,
        events,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /organizer/events/new
 * Renders the form to create a new event draft.
 */
organizerEventsRouter.get(
  "/organizer/events/new",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;

    try {
      const { categories, departments, levels } = await getEventFormData();

      res.render("organizer/events/new", {
        title: "Create Event Draft — YCEP",
        user: req.user,
        authorization: auth,
        categories,
        departments,
        levels,
        errors: {},
        values: {},
        errorMessage: null,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /organizer/events
 * Creates a new event draft bound to the current organizer authorization.
 */
organizerEventsRouter.post(
  "/organizer/events",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const jsonExpected = isJsonRequest(req);

    const parseResult = eventDraftSchema.safeParse(req.body);

    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      parseResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });

      if (jsonExpected) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: fieldErrors,
        });
        return;
      }

      try {
        const { categories, departments, levels } = await getEventFormData();
        res.status(400).render("organizer/events/new", {
          title: "Create Event Draft — YCEP",
          user: req.user,
          authorization: auth,
          categories,
          departments,
          levels,
          errors: fieldErrors,
          values: req.body,
          errorMessage: "Please resolve the errors below before saving your draft.",
        });
        return;
      } catch (err) {
        next(err);
        return;
      }
    }

    try {
      const event = await createEventDraft(auth, parseResult.data);

      if (jsonExpected) {
        res.status(201).json({
          success: true,
          message: "Event draft created successfully",
          event,
        });
        return;
      }

      res.redirect(`/organizer/events/${event.id}`);
    } catch (error) {
      if (error instanceof EventValidationError) {
        if (jsonExpected) {
          res.status(400).json({ success: false, message: error.message });
          return;
        }

        const { categories, departments, levels } = await getEventFormData();
        res.status(400).render("organizer/events/new", {
          title: "Create Event Draft — YCEP",
          user: req.user,
          authorization: auth,
          categories,
          departments,
          levels,
          errors: {},
          values: req.body,
          errorMessage: error.message,
        });
        return;
      }

      next(error);
    }
  }
);

/**
 * GET /organizer/events/:id
 * Displays the preview of a draft event owned by the current organizer authorization.
 */
organizerEventsRouter.get(
  "/organizer/events/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const eventId = req.params.id;
    const jsonExpected = isJsonRequest(req);

    try {
      const event = await getOrganizerEventById(eventId, auth.id);

      if (jsonExpected) {
        res.status(200).json({
          success: true,
          event,
        });
        return;
      }

      res.render("organizer/events/detail", {
        title: `${event.title} — YCEP`,
        user: req.user,
        authorization: auth,
        event,
      });
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        if (jsonExpected) {
          res.status(404).json({ success: false, message: "Event draft not found" });
          return;
        }
        res.status(404).render("error", {
          title: "Event Not Found — YCEP",
          message: "The requested event draft was not found or does not belong to your active organizer authorization.",
        });
        return;
      }
      next(error);
    }
  }
);

organizerEventsRouter.post(
  "/organizer/events/:id/submit",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const jsonExpected = isJsonRequest(req);
    try {
      const event = await submitEventForReview(req.params.id, auth.id);
      if (jsonExpected) {
        res.status(200).json({ success: true, message: "Event submitted for management approval.", event });
        return;
      }
      res.redirect(`/organizer/events/${event.id}`);
    } catch (error) {
      if (error instanceof EventError) {
        if (jsonExpected) {
          res.status(error.statusCode).json({ success: false, message: error.message });
          return;
        }
        res.status(error.statusCode).render("error", { title: "Cannot Submit Event — YCEP", message: error.message });
        return;
      }
      next(error);
    }
  }
);

/**
 * GET /organizer/events/:id/edit
 * Renders the edit form for a draft event.
 */
organizerEventsRouter.get(
  "/organizer/events/:id/edit",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const eventId = req.params.id;
    const jsonExpected = isJsonRequest(req);

    try {
      const event = await getOrganizerEventDraftById(eventId, auth.id);
      const { categories, departments, levels } = await getEventFormData();

      // Transform event into form values format
      const formattedDate = event.eventDate instanceof Date
        ? event.eventDate.toISOString().split("T")[0]
        : String(event.eventDate);

      const values = {
        title: event.title,
        description: event.description,
        categoryId: event.categoryId,
        posterUrl: event.posterUrl || "",
        eventDate: formattedDate,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue,
        targetDepartmentIds: event.targetDepartments.map((td) => td.departmentId),
        targetLevelIds: event.targetLevels.map((tl) => tl.levelId),
      };

      res.render("organizer/events/edit", {
        title: `Edit Draft: ${event.title} — YCEP`,
        user: req.user,
        authorization: auth,
        event,
        categories,
        departments,
        levels,
        errors: {},
        values,
        errorMessage: null,
      });
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        if (jsonExpected) {
          res.status(404).json({ success: false, message: "Event draft not found" });
          return;
        }
        res.status(404).render("error", {
          title: "Event Not Found — YCEP",
          message: "The requested event draft was not found or does not belong to your active organizer authorization.",
        });
        return;
      }
      next(error);
    }
  }
);

/**
 * POST /organizer/events/:id
 * Updates an event draft owned by the current organizer authorization.
 */
organizerEventsRouter.post(
  "/organizer/events/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    const auth = req.organizerAuthorization!;
    const eventId = req.params.id;
    const jsonExpected = isJsonRequest(req);

    const parseResult = eventDraftSchema.safeParse(req.body);

    if (!parseResult.success) {
      const fieldErrors: Record<string, string> = {};
      parseResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });

      if (jsonExpected) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: fieldErrors,
        });
        return;
      }

      try {
        const event = await getOrganizerEventDraftById(eventId, auth.id);
        const { categories, departments, levels } = await getEventFormData();

        res.status(400).render("organizer/events/edit", {
          title: `Edit Draft: ${event.title} — YCEP`,
          user: req.user,
          authorization: auth,
          event,
          categories,
          departments,
          levels,
          errors: fieldErrors,
          values: req.body,
          errorMessage: "Please resolve the errors below before updating the draft.",
        });
        return;
      } catch (err) {
        if (err instanceof EventNotFoundError) {
          res.status(404).render("error", {
            title: "Event Not Found — YCEP",
            message: "The requested event draft was not found or does not belong to your active organizer authorization.",
          });
          return;
        }
        next(err);
        return;
      }
    }

    try {
      const updatedEvent = await updateEventDraft(eventId, auth.id, parseResult.data);

      if (jsonExpected) {
        res.status(200).json({
          success: true,
          message: "Event draft updated successfully",
          event: updatedEvent,
        });
        return;
      }

      res.redirect(`/organizer/events/${updatedEvent.id}`);
    } catch (error) {
      if (error instanceof EventNotFoundError) {
        if (jsonExpected) {
          res.status(404).json({ success: false, message: "Event draft not found" });
          return;
        }
        res.status(404).render("error", {
          title: "Event Not Found — YCEP",
          message: "The requested event draft was not found or does not belong to your active organizer authorization.",
        });
        return;
      }

      if (error instanceof EventInvalidStateError) {
        if (jsonExpected) {
          res.status(error.statusCode).json({ success: false, message: error.message });
          return;
        }
        res.status(error.statusCode).render("error", {
          title: "Cannot Edit Event — YCEP",
          message: error.message,
        });
        return;
      }

      if (error instanceof EventValidationError) {
        if (jsonExpected) {
          res.status(400).json({ success: false, message: error.message });
          return;
        }

        const event = await getOrganizerEventDraftById(eventId, auth.id);
        const { categories, departments, levels } = await getEventFormData();

        res.status(400).render("organizer/events/edit", {
          title: `Edit Draft: ${event.title} — YCEP`,
          user: req.user,
          authorization: auth,
          event,
          categories,
          departments,
          levels,
          errors: {},
          values: req.body,
          errorMessage: error.message,
        });
        return;
      }

      next(error);
    }
  }
);
