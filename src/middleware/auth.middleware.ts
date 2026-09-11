import { Request, Response, NextFunction } from "express";
import { User, MemberVerification, Department, Level } from "@prisma/client";
import { prisma } from "../db.js";

export type SafeUser = Omit<User, "passwordHash"> & {
  department?: Department | null;
  level?: Level | null;
};

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
      verification?: MemberVerification;
    }
  }
}

/**
 * Checks whether an incoming request expects a JSON response.
 */
export function isJsonRequest(req: Request): boolean {
  const accept = req.get("Accept") || "";
  const contentType = req.get("Content-Type") || "";
  return accept.includes("application/json") || contentType.includes("application/json");
}

/**
 * Middleware: requireAuth
 * Requires a valid authenticated session.
 *
 * If unauthenticated:
 * - HTML requests redirect to /login
 * - JSON/API requests return 401 Unauthorized
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.session || !req.session.userId) {
    if (isJsonRequest(req)) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }
    res.redirect("/login");
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { department: true, level: true },
    });

    if (!user) {
      req.session.destroy(() => {});
      if (isJsonRequest(req)) {
        res.status(401).json({ success: false, message: "User account not found" });
        return;
      }
      res.redirect("/login");
      return;
    }

    const { passwordHash: _, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: requireAdmin
 * Requires an authenticated user with role === 'ADMIN'.
 *
 * Rules:
 * - Must query/load current User from database and confirm role === 'ADMIN'.
 * - Never trusts a role value supplied by the browser or cached in session.
 * - Unauthenticated request:
 *   - HTML: redirect to /admin/login
 *   - JSON: 401 Unauthorized
 * - Authenticated MEMBER attempting admin access:
 *   - HTML: 403 Forbidden error view
 *   - JSON: 403 Forbidden JSON
 * - ADMIN:
 *   - req.user attached, next()
 *   - exempt from annual MemberVerification
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const jsonExpected = isJsonRequest(req);

  if (!req.session || !req.session.userId) {
    if (jsonExpected) {
      res.status(401).json({ success: false, message: "Admin authentication required" });
      return;
    }
    res.redirect("/admin/login");
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.session.userId },
      include: { department: true, level: true },
    });

    if (!user) {
      req.session.destroy(() => {});
      if (jsonExpected) {
        res.status(401).json({ success: false, message: "User account not found" });
        return;
      }
      res.redirect("/admin/login");
      return;
    }

    if (user.role !== "ADMIN") {
      if (jsonExpected) {
        res.status(403).json({ success: false, message: "Forbidden: Admin access required" });
        return;
      }
      res.status(403).render("error", {
        title: "Access Forbidden — YCEP",
        message: "Forbidden: You do not have permission to access the administrative management console.",
      });
      return;
    }

    const { passwordHash: _, ...safeUser } = user;
    req.user = safeUser;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware: requireActiveVerification
 * Requires:
 * 1. Authenticated user (runs requireAuth if req.user is missing)
 * 2. For ADMIN accounts: exempt from yearly member-verification expiry.
 * 3. For normal MEMBER accounts: an ACTIVE MemberVerification belonging to the CURRENT AcademicYearCycle.
 *
 * Expired, revoked, or prior-cycle active verifications do NOT satisfy this guard.
 * If no current academic cycle is configured, fails safely with 503 rather than granting access.
 */
export async function requireActiveVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Ensure user is authenticated first
  if (!req.user) {
    await requireAuth(req, res, async () => {
      await evaluateActiveVerification(req, res, next);
    });
    return;
  }

  await evaluateActiveVerification(req, res, next);
}

async function evaluateActiveVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const user = req.user;
  if (!user) return; // requireAuth already responded

  // Rule: YABATECH Management ADMIN accounts are exempt from yearly member verification expiry
  if (user.role === "ADMIN") {
    return next();
  }

  try {
    // 1. Confirm exactly one current academic year cycle exists
    const currentCycle = await prisma.academicYearCycle.findFirst({
      where: { isCurrent: true },
    });

    if (!currentCycle) {
      if (isJsonRequest(req)) {
        res.status(503).json({
          success: false,
          message: "No active academic cycle is configured. Action unavailable.",
        });
        return;
      }
      res.status(503).render("error", {
        title: "Service Unavailable — YCEP",
        message: "No active academic cycle is currently configured. Action unavailable.",
      });
      return;
    }

    // 2. Query member verification for this user in the CURRENT cycle
    const verification = await prisma.memberVerification.findUnique({
      where: {
        userId_cycleId: {
          userId: user.id,
          cycleId: currentCycle.id,
        },
      },
    });

    if (!verification || verification.status !== "ACTIVE") {
      if (isJsonRequest(req)) {
        res.status(403).json({
          success: false,
          message: "Active verification for the current academic cycle is required.",
          verificationStatus: verification?.status || "NONE",
        });
        return;
      }
      res.status(403).render("error", {
        title: "Active Verification Required — YCEP",
        message:
          "Your verification for the current academic cycle is inactive or expired. Please renew your verification to perform this action.",
      });
      return;
    }

    req.verification = verification;
    next();
  } catch (error) {
    next(error);
  }
}
