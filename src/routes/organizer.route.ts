import { Router, Request, Response, NextFunction } from "express";
import {
  requireAuth,
  requireActiveVerification,
  requireOrganizer,
  isJsonRequest,
} from "../middleware/auth.middleware.js";
import {
  organizerApplicationSchema,
  OrganizerApplicationInput,
} from "../validators/organizer.validator.js";
import {
  submitOrganizerApplication,
  getMemberOrganizerStatus,
  OrganizerError,
} from "../services/organizer.service.js";

export const organizerRouter = Router();

/**
 * GET /organizer/apply
 * Renders the organizer application form for active members.
 * Guarded by requireAuth and requireActiveVerification.
 */
organizerRouter.get(
  "/organizer/apply",
  requireActiveVerification,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const jsonExpected = isJsonRequest(req);

    if (user.role === "ADMIN") {
      if (jsonExpected) {
        res.status(403).json({
          success: false,
          message: "Administrators cannot apply for organizer privileges.",
        });
        return;
      }
      res.redirect("/admin");
      return;
    }

    try {
      const statusData = await getMemberOrganizerStatus(user.id);

      // If already active or revoked in current cycle, or has pending application,
      // redirect to status page
      if (
        statusData.effectiveStatus === "ACTIVE" ||
        statusData.effectiveStatus === "REVOKED" ||
        statusData.effectiveStatus === "PENDING"
      ) {
        if (jsonExpected) {
          res.status(400).json({
            success: false,
            message: `Cannot apply: current status is ${statusData.effectiveStatus}.`,
            effectiveStatus: statusData.effectiveStatus,
          });
          return;
        }
        res.redirect("/organizer/status");
        return;
      }

      res.render("organizer/apply", {
        title: "Apply for Organizer Privileges — YCEP",
        user,
        currentCycle: statusData.currentCycle,
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
 * POST /organizer/apply
 * Submits an organizer application for the current academic cycle.
 * Guarded by requireActiveVerification.
 */
organizerRouter.post(
  "/organizer/apply",
  requireActiveVerification,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const jsonExpected = isJsonRequest(req);

    if (user.role === "ADMIN") {
      if (jsonExpected) {
        res.status(403).json({
          success: false,
          message: "Administrators cannot apply for organizer privileges.",
        });
        return;
      }
      res.redirect("/admin");
      return;
    }

    const parseResult = organizerApplicationSchema.safeParse(req.body);

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

      const statusData = await getMemberOrganizerStatus(user.id);

      res.status(400).render("organizer/apply", {
        title: "Apply for Organizer Privileges — YCEP",
        user,
        currentCycle: statusData.currentCycle,
        errors: fieldErrors,
        values: req.body,
        errorMessage: "Please resolve the errors below before submitting.",
      });
      return;
    }

    try {
      const application = await submitOrganizerApplication(user.id, parseResult.data);

      if (jsonExpected) {
        res.status(201).json({
          success: true,
          message: "Organizer application submitted successfully.",
          application,
        });
        return;
      }

      res.redirect("/organizer/status");
    } catch (error) {
      if (error instanceof OrganizerError) {
        if (jsonExpected) {
          res.status(error.statusCode).json({
            success: false,
            message: error.message,
          });
          return;
        }

        const statusData = await getMemberOrganizerStatus(user.id);

        res.status(error.statusCode).render("organizer/apply", {
          title: "Apply for Organizer Privileges — YCEP",
          user,
          currentCycle: statusData.currentCycle,
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
 * GET /organizer/status
 * Displays the member's current organizer capability status and application history.
 * Guarded by requireAuth.
 */
organizerRouter.get(
  "/organizer/status",
  requireAuth,
  async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const jsonExpected = isJsonRequest(req);

    if (user.role === "ADMIN") {
      if (jsonExpected) {
        res.status(200).json({
          success: true,
          message: "Administrator account.",
          role: "ADMIN",
        });
        return;
      }
      res.redirect("/admin");
      return;
    }

    try {
      const statusData = await getMemberOrganizerStatus(user.id);

      if (jsonExpected) {
        res.status(200).json({
          success: true,
          ...statusData,
        });
        return;
      }

      res.render("organizer/status", {
        title: "Organizer Status — YCEP",
        user,
        ...statusData,
      });
    } catch (error) {
      next(error);
    }
  }
);


