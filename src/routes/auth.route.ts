import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db.js";
import { normalizeMatricNumber } from "../utils/matric.js";
import {
  requireAuth,
  requireActiveVerification,
  isJsonRequest,
} from "../middleware/auth.middleware.js";
import { memberLoginLimiter } from "../middleware/rate-limit.middleware.js";
import { memberLoginSchema } from "../validators/auth.validator.js";
import { updateProfileSchema } from "../validators/profile.validator.js";
import { ProfileUpdateError, updateMemberProfile } from "../services/profile.service.js";

export const authRouter = Router();

const GENERIC_AUTH_ERROR = "Invalid matric number or password.";

/**
 * GET /login
 * Displays login page. If user already logged in, redirects to /account.
 */
authRouter.get("/login", (req: Request, res: Response) => {
  if (req.session && req.session.userId) {
    res.redirect("/account");
    return;
  }

  res.render("login", {
    title: "Login — YCEP",
    errorMessage: null,
    values: { matricNumber: "" },
  });
});

/**
 * POST /login
 * Authenticates user via matric number and password.
 *
 * Rules:
 * - Matric number normalized using existing utility before lookup.
 * - Authenticate using bcrypt.
 * - Generic error message for both invalid matric and password.
 * - Expired verification does NOT prevent login.
 * - Session regenerated to prevent fixation.
 * - Only user ID stored in session (no cached roles, verifications, passwords).
 */
authRouter.post("/login", memberLoginLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = memberLoginSchema.safeParse(req.body);
  const { matricNumber, password } = parsed.success ? parsed.data : { matricNumber: "", password: "" };
  const jsonExpected = isJsonRequest(req);

  if (!parsed.success) {
    if (jsonExpected) {
      res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
      return;
    }
    res.status(401).render("login", {
      title: "Login — YCEP",
      errorMessage: GENERIC_AUTH_ERROR,
      values: { matricNumber: matricNumber || "" },
    });
    return;
  }

  try {
    const normalizedMatric = normalizeMatricNumber(matricNumber);

    const user = await prisma.user.findUnique({
      where: { matricNumber: normalizedMatric },
    });

    if (!user) {
      if (jsonExpected) {
        res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
        return;
      }
      res.status(401).render("login", {
        title: "Login — YCEP",
        errorMessage: GENERIC_AUTH_ERROR,
        values: { matricNumber },
      });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      if (jsonExpected) {
        res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
        return;
      }
      res.status(401).render("login", {
        title: "Login — YCEP",
        errorMessage: GENERIC_AUTH_ERROR,
        values: { matricNumber },
      });
      return;
    }

    // Regenerate session to prevent fixation
    req.session.regenerate((err) => {
      if (err) return next(err);

      req.session.userId = user.id;

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);

        if (jsonExpected) {
          res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
              id: user.id,
              fullName: user.fullName,
              email: user.email,
              matricNumber: user.matricNumber,
              role: user.role,
            },
          });
          return;
        }

        res.redirect("/account");
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /logout
 * Destroys server-side session and clears the session cookie.
 */
authRouter.post("/logout", (req: Request, res: Response, next: NextFunction) => {
  const jsonExpected = isJsonRequest(req);

  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie("ycep.sid", { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production" });

    if (jsonExpected) {
      res.status(200).json({ success: true, message: "Logged out successfully" });
      return;
    }

    res.redirect("/login");
  });
});

/**
 * GET /account
 * Minimal authenticated account page.
 * Requires authentication but NOT active verification.
 * Expired members can still access this page.
 */
authRouter.get("/account", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;

  // Preserve /account as the MEMBER-facing authenticated area; redirect ADMIN to /admin
  if (user.role === "ADMIN") {
    res.redirect("/admin");
    return;
  }

  const jsonExpected = isJsonRequest(req);

  try {
    const currentCycle = await prisma.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    let currentVerification = null;
    if (currentCycle) {
      currentVerification = await prisma.memberVerification.findUnique({
        where: {
          userId_cycleId: {
            userId: user.id,
            cycleId: currentCycle.id,
          },
        },
        include: { cycle: true },
      });
    }

    if (jsonExpected) {
      res.status(200).json({
        success: true,
        user,
        currentVerification,
        currentCycle,
      });
      return;
    }

    res.render("account", {
      title: "My Account — YCEP",
      user,
      currentVerification,
      currentCycle,
    });
  } catch (error) {
    next(error);
  }
});

async function profileReferenceData() {
  const [departments, levels] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.level.findMany({ orderBy: { code: "asc" } }),
  ]);
  return { departments, levels };
}

authRouter.get("/account/edit", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  if (user.role === "ADMIN") return void res.redirect("/admin");
  try {
    res.render("account-edit", {
      title: "Edit Account — YCEP", user, ...await profileReferenceData(), errors: {}, values: user, errorMessage: null,
    });
  } catch (error) { next(error); }
});

authRouter.post("/account/edit", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  const jsonExpected = isJsonRequest(req);
  if (user.role === "ADMIN") {
    if (jsonExpected) return void res.status(403).json({ success: false, message: "Management profiles cannot be edited here." });
    return void res.status(403).render("error", { title: "Access Forbidden — YCEP", message: "Management profiles cannot be edited here." });
  }

  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    if (jsonExpected) return void res.status(400).json({ success: false, message: "Validation failed", errors });
    try {
      res.status(400).render("account-edit", {
        title: "Edit Account — YCEP", user, ...await profileReferenceData(), errors,
        values: req.body, errorMessage: "Please correct the highlighted details.",
      });
    } catch (error) { next(error); }
    return;
  }

  try {
    const updatedUser = await updateMemberProfile(user.id, parsed.data);
    if (jsonExpected) return void res.status(200).json({ success: true, message: "Account details updated.", user: updatedUser });
    res.redirect("/account");
  } catch (error) {
    if (!(error instanceof ProfileUpdateError)) return next(error);
    if (jsonExpected) return void res.status(error.statusCode).json({ success: false, message: error.message });
    try {
      res.status(error.statusCode).render("account-edit", {
        title: "Edit Account — YCEP", user, ...await profileReferenceData(), errors: {},
        values: req.body, errorMessage: error.message,
      });
    } catch (renderError) { next(renderError); }
  }
});

/**
 * GET /account/protected-action
 * Minimal route demonstrating and testing requireActiveVerification.
 * Requires authenticated session AND active current-cycle verification (or ADMIN).
 */
authRouter.get(
  "/account/protected-action",
  requireAuth,
  requireActiveVerification,
  (req: Request, res: Response) => {
    if (isJsonRequest(req)) {
      res.status(200).json({
        success: true,
        message: "Active verification confirmed for current cycle",
        userId: req.user!.id,
      });
      return;
    }

    res.render("protected-action", {
      title: "Protected Action — YCEP",
      user: req.user,
      verification: req.verification,
    });
  }
);
