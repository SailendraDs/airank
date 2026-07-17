import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { logger, logSecurityEvent } from "./lib/logger";
import { storage } from "./storage";

const JWT_SECRET = process.env.SESSION_SECRET || "airank-dev-secret-change-in-production";
const JWT_EXPIRY = "7d";

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace("Bearer ", "");
    const sessionToken = req.cookies?.session_token;

    if (!token) {
      logSecurityEvent('auth_missing_token', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: "Unauthorized - No token provided" });
    }

    const payload = verifyToken(token);
    if (!payload) {
      logSecurityEvent('auth_invalid_session', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: "Invalid or expired session" });
    }

    // Validate session in database if session token exists
    if (sessionToken) {
      const session = await storage.getSession(sessionToken);
      if (!session) {
        logSecurityEvent('auth_invalid_session_token', {
          userId: payload.userId,
          ip: req.ip,
          path: req.path
        });
        res.clearCookie("auth_token");
        res.clearCookie("session_token");
        return res.status(401).json({ error: "Invalid or expired session" });
      }

      // Update session activity (sliding expiration)
      await storage.updateSessionActivity(sessionToken);
    }

    (req as any).userId = payload.userId;
    next();
  } catch (error: any) {
    logger.error("Authentication error", { error: error.message, path: req.path, ip: req.ip });
    logSecurityEvent('auth_error', { error: error.message, ip: req.ip, path: req.path });
    return res.status(401).json({ error: "Unauthorized" });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      logSecurityEvent('admin_access_no_user', { ip: req.ip, path: req.path });
      return res.status(401).json({ error: "Unauthorized" });
    }

    const user = await storage.getUser(userId);
    if (!user?.isAdmin) {
      logSecurityEvent('admin_access_denied', { userId, ip: req.ip, path: req.path });
      return res.status(403).json({ error: "Forbidden - Admin access required" });
    }

    logger.info('Admin access granted', { userId, path: req.path });
    next();
  } catch (error: any) {
    logger.error("Admin authorization error", { error: error.message, userId: (req as any).userId, path: req.path });
    return res.status(403).json({ error: "Forbidden" });
  }
}
