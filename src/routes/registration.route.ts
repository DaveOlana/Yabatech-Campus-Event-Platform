import { Router, Request, Response } from "express";
import { prisma } from "../db.js";
import { registerMemberSchema } from "../validators/registration.validator.js";
import {
  registerMember,
  DuplicateConflictError,
  CycleConfigurationError,
  ValidationError,
} from "../services/registration.service.js";

export const registrationRouter = Router();

/**
 * Helper to check if the incoming request expects a JSON response.
 */
function isJsonRequest(req: Request): boolean {
  const acceptHeader = req.get("Accept") || "";
  const contentType = req.get("Content-Type") || "";
  return (
    acceptHeader.includes("application/json") ||
    contentType.includes("application/json")
  );
}

/**
 * GET /register
 * Displays the member registration form.
 */
registrationRouter.get("/register", async (_req: Request, res: Response) => {
  try {
    const [departments, levels] = await Promise.all([
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.level.findMany({ orderBy: { code: "asc" } }),
    ]);

    res.render("register", {
      title: "Register — YCEP",
      departments,
      levels,
      errors: {},
      values: {},
      errorMessage: null,
    });
  } catch (_error) {
    res.status(500).render("error", {
      title: "Error — YCEP",
      message: "Unable to load registration page at this time.",
    });
  }
});

/**
 * POST /register
 * Handles member registration submission.
 */
registrationRouter.post("/register", async (req: Request, res: Response) => {
  const jsonExpected = isJsonRequest(req);

  // 1. Zod validation
  const validationResult = registerMemberSchema.safeParse(req.body);

  if (!validationResult.success) {
    const fieldErrors = validationResult.error.flatten().fieldErrors;

    if (jsonExpected) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: fieldErrors,
      });
      return;
    }

    const [departments, levels] = await Promise.all([
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.level.findMany({ orderBy: { code: "asc" } }),
    ]);

    res.status(400).render("register", {
      title: "Register — YCEP",
      departments,
      levels,
      errors: fieldErrors,
      values: {
        fullName: req.body.fullName || "",
        matricNumber: req.body.matricNumber || "",
        email: req.body.email || "",
        departmentId: req.body.departmentId || "",
        levelId: req.body.levelId || "",
      },
      errorMessage: "Please correct the highlighted errors.",
    });
    return;
  }

  // 2. Perform atomic registration
  try {
    const result = await registerMember(validationResult.data);

    if (jsonExpected) {
      res.status(201).json({
        success: true,
        message: "Registration successful. Active verification granted.",
        user: result.user,
        verification: result.verification,
      });
      return;
    }

    res.status(201).render("register-success", {
      title: "Registration Successful — YCEP",
      user: result.user,
      verification: result.verification,
    });
  } catch (error) {
    let statusCode = 500;
    let errorMessage = "An unexpected error occurred during registration.";
    const errors: Record<string, string[]> = {};

    if (error instanceof DuplicateConflictError) {
      statusCode = 409;
      errorMessage = error.message;
      errors[error.field] = [error.message];
    } else if (error instanceof CycleConfigurationError) {
      statusCode = 503;
      errorMessage = error.message;
    } else if (error instanceof ValidationError) {
      statusCode = 400;
      errorMessage = error.message;
    }

    if (jsonExpected) {
      res.status(statusCode).json({
        success: false,
        message: errorMessage,
        errors: Object.keys(errors).length > 0 ? errors : undefined,
      });
      return;
    }

    const [departments, levels] = await Promise.all([
      prisma.department.findMany({ orderBy: { name: "asc" } }),
      prisma.level.findMany({ orderBy: { code: "asc" } }),
    ]);

    res.status(statusCode).render("register", {
      title: "Register — YCEP",
      departments,
      levels,
      errors,
      values: {
        fullName: req.body.fullName || "",
        matricNumber: req.body.matricNumber || "",
        email: req.body.email || "",
        departmentId: req.body.departmentId || "",
        levelId: req.body.levelId || "",
      },
      errorMessage,
    });
  }
});
