import { Router, Request, Response, NextFunction } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../db.js";
import { requireAdmin, isJsonRequest } from "../middleware/auth.middleware.js";
import {
  createAuditLog,
  getRecentAuditLogs,
  AUDIT_ACTIONS,
} from "../services/audit.service.js";

export const adminRouter = Router();

const GENERIC_ADMIN_AUTH_ERROR = "Invalid email or password.";

/**
 * GET /admin/login
 * Renders the dedicated YABATECH Management sign-in view.
 * If already authenticated as ADMIN, redirects to /admin.
 */
adminRouter.get("/admin/login", async (req: Request, res: Response) => {
  if (req.session && req.session.userId) {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
    });
    if (user && user.role === "ADMIN") {
      res.redirect("/admin");
      return;
    }
  }

  res.render("admin/login", {
    title: "Admin Sign In — YABATECH Management",
    errorMessage: null,
    values: { email: "" },
  });
});

/**
 * POST /admin/login
 * Authenticates the dedicated YABATECH Management ADMIN account.
 *
 * Rules:
 * - Authenticates using email + password.
 * - Normalized/lowercased email lookup.
 * - Rejects any account whose role is NOT ADMIN (MEMBER cannot authenticate here).
 * - Generic error message for unknown email, non-admin role, or bad password.
 * - Session regenerated upon success to prevent fixation.
 * - If audit log creation fails, the session is destroyed to avoid leaving
 *   the user with a privileged authenticated session.
 */
adminRouter.post("/admin/login", async (req: Request, res: Response, next: NextFunction) => {
  const { email, password } = req.body;
  const jsonExpected = isJsonRequest(req);

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    if (jsonExpected) {
      res.status(401).json({ success: false, message: GENERIC_ADMIN_AUTH_ERROR });
      return;
    }
    res.status(401).render("admin/login", {
      title: "Admin Sign In — YABATECH Management",
      errorMessage: GENERIC_ADMIN_AUTH_ERROR,
      values: { email: email || "" },
    });
    return;
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Rejection rule: user must exist and have role === 'ADMIN'
    if (!user || user.role !== "ADMIN") {
      if (jsonExpected) {
        res.status(401).json({ success: false, message: GENERIC_ADMIN_AUTH_ERROR });
        return;
      }
      res.status(401).render("admin/login", {
        title: "Admin Sign In — YABATECH Management",
        errorMessage: GENERIC_ADMIN_AUTH_ERROR,
        values: { email },
      });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      if (jsonExpected) {
        res.status(401).json({ success: false, message: GENERIC_ADMIN_AUTH_ERROR });
        return;
      }
      res.status(401).render("admin/login", {
        title: "Admin Sign In — YABATECH Management",
        errorMessage: GENERIC_ADMIN_AUTH_ERROR,
        values: { email },
      });
      return;
    }

    // Regenerate session to prevent fixation
    req.session.regenerate(async (err) => {
      if (err) return next(err);

      req.session.userId = user.id;

      // Session safety invariant:
      // If audit creation fails, destroy the session so the user is never left
      // with an unverified/broken privileged session.
      try {
        await createAuditLog({
          actorUserId: user.id,
          action: AUDIT_ACTIONS.ADMIN_LOGIN,
          metadata: {
            ip: req.ip || null,
          },
        });
      } catch (auditErr) {
        req.session.destroy(() => {});
        res.clearCookie("ycep.sid");
        return next(auditErr);
      }

      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);

        if (jsonExpected) {
          res.status(200).json({
            success: true,
            message: "Admin authentication successful",
            user: {
              id: user.id,
              fullName: user.fullName,
              email: user.email,
              role: user.role,
            },
          });
          return;
        }

        res.redirect("/admin");
      });
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /admin/logout
 * Destroys the admin session and clears the cookie.
 *
 * Rules:
 * - Protected by requireAdmin (MEMBER users cannot invoke this or generate admin audit records).
 * - Creates an ADMIN_LOGOUT audit record.
 * - Session destruction must still occur even if audit log creation fails.
 */
adminRouter.post("/admin/logout", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  const jsonExpected = isJsonRequest(req);

  // Attempt audit logging; session destruction still occurs even if audit logging fails
  try {
    await createAuditLog({
      actorUserId: user.id,
      action: AUDIT_ACTIONS.ADMIN_LOGOUT,
    });
  } catch (auditErr) {
    console.error("Failed to write ADMIN_LOGOUT audit log:", auditErr);
  }

  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie("ycep.sid");

    if (jsonExpected) {
      res.status(200).json({ success: true, message: "Admin logged out successfully" });
      return;
    }

    res.redirect("/admin/login");
  });
});

/**
 * GET /admin
 * Minimal foundation dashboard for YABATECH Management.
 * Protected by requireAdmin.
 */
adminRouter.get("/admin", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  const jsonExpected = isJsonRequest(req);

  try {
    const currentCycle = await prisma.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    const recentAuditLogs = await getRecentAuditLogs(10);

    const systemStatus = {
      database: "CONNECTED",
      activeCycle: currentCycle ? currentCycle.name : "None configured",
    };

    if (jsonExpected) {
      res.status(200).json({
        success: true,
        user,
        systemStatus,
        recentAuditLogs,
      });
      return;
    }

    res.render("admin/dashboard", {
      title: "Management Console — YABATECH Campus Events Platform",
      user,
      systemStatus,
      recentAuditLogs,
    });
  } catch (error) {
    next(error);
  }
});
