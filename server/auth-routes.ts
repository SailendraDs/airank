import { Router, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { storage } from "./storage";
import { signToken, requireAuth } from "./auth-middleware";
import { signupSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema, resetPasswordSchema } from "@shared/schema";
import { authLimiter } from "./middleware/rate-limit";
import { logger } from "./lib/logger";
import { sendVerifyEmail, sendResetPasswordEmail } from "./services/email";

const router = Router();

// Configure Google OAuth Strategy (lazy; supports runtime key updates)
let googleStrategyConfigured = false;

function configureGoogleStrategy(): boolean {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return false;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: clientId,
        clientSecret,
        callbackURL: process.env.GOOGLE_CALLBACK_URL || "http://localhost:5001/api/auth/google/callback",
        scope: ["profile", "email"],
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          return done(null, profile);
        } catch (error) {
          return done(error as Error, undefined);
        }
      }
    )
  );

  googleStrategyConfigured = true;
  return true;
}

async function isGoogleLoginEnabled(): Promise<boolean> {
  try {
    const v = await storage.getSystemSetting('google_login_enabled');
    return v !== 'false';
  } catch {
    return true;
  }
}

function isConsumerEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return domain === 'gmail.com';
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/",
};

function generateOTP(): string {
  return crypto.randomInt(100000, 999999).toString();
}

async function isMaintenanceModeEnabled(): Promise<boolean> {
  try {
    const value = await storage.getSystemSetting('maintenance_mode');
    return value === 'true';
  } catch {
    return false;
  }
}

router.post("/signup", authLimiter, async (req: Request, res: Response) => {
  try {
    if (await isMaintenanceModeEnabled()) {
      return res.status(503).json({ error: "Service is temporarily unavailable due to maintenance" });
    }

    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { firstName, lastName, email, phone, password } = parsed.data;

    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      if (existingUser.emailVerified) {
        return res.status(409).json({ error: "An account with this email already exists" });
      }
      const otp = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      const passwordHash = await bcrypt.hash(password, 12);

      await storage.updateUser(existingUser.id, {
        firstName,
        lastName,
        phone,
        passwordHash,
        verificationCode: otp,
        verificationExpiry: expiry,
      } as any);

      await sendVerifyEmail(email, firstName, otp);

      return res.json({ message: "Verification code sent to your email", email });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    const userId = crypto.randomUUID();

    await storage.createUser({
      id: userId,
      email,
      firstName,
      lastName,
      phone,
      passwordHash,
      verificationCode: otp,
      verificationExpiry: expiry,
    } as any);

    await sendVerifyEmail(email, firstName, otp);

    logger.info("New user signup", { userId, email });
    return res.json({ message: "Verification code sent to your email", email });
  } catch (error: any) {
    logger.error("Signup error", { error: error.message });
    return res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/verify-email", authLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email, code } = parsed.data;
    const user = await storage.getUserByEmail(email);

    if (!user) {
      return res.status(404).json({ error: "Account not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    if (!user.verificationCode || user.verificationCode !== code) {
      return res.status(400).json({ error: "Invalid verification code" });
    }

    if (user.verificationExpiry && new Date() > user.verificationExpiry) {
      return res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    }

    await storage.updateUser(user.id, {
      emailVerified: true,
      verificationCode: null,
      verificationExpiry: null,
    } as any);

    const token = signToken({ userId: user.id, email: user.email! });
    res.cookie("auth_token", token, COOKIE_OPTIONS);

    logger.info("Email verified", { userId: user.id, email });
    return res.json({
      message: "Email verified successfully",
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (error: any) {
    logger.error("Email verification error", { error: error.message });
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/resend-otp", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const user = await storage.getUserByEmail(email);
    if (!user) return res.status(404).json({ error: "Account not found" });

    if (user.emailVerified) {
      return res.status(400).json({ error: "Email already verified" });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await storage.updateUser(user.id, {
      verificationCode: otp,
      verificationExpiry: expiry,
    } as any);

    await sendVerifyEmail(email, user.firstName || "", otp);

    return res.json({ message: "New verification code sent" });
  } catch (error: any) {
    logger.error("Resend OTP error", { error: error.message });
    return res.status(500).json({ error: "Failed to resend code" });
  }
});

router.post("/login", authLimiter, async (req: Request, res: Response) => {
  try {
    const maintenanceEnabled = await isMaintenanceModeEnabled();

    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email, password } = parsed.data;
    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Check for active lockout first
    const user = await storage.getUserByEmail(email);
    if (user) {
      const lockout = await storage.getActiveLockout(user.id);
      if (lockout && new Date(lockout.lockedUntil) > new Date()) {
        await storage.createLoginAttempt({
          email,
          ipAddress,
          userAgent,
          success: false,
          failureReason: 'account_locked',
          attemptedAt: new Date(),
        });
        await storage.createSecurityEvent({
          userId: user.id,
          eventType: 'login_attempt_while_locked',
          severity: 'warning',
          ipAddress,
          userAgent,
          metadata: { email, lockedUntil: lockout.lockedUntil },
        });
        const minutesRemaining = Math.ceil((new Date(lockout.lockedUntil).getTime() - Date.now()) / 60000);
        return res.status(403).json({
          error: "Account temporarily locked",
          message: `Too many failed attempts. Try again in ${minutesRemaining} minute${minutesRemaining !== 1 ? 's' : ''}.`,
          lockedUntil: lockout.lockedUntil,
        });
      }
    }

    if (!user) {
      if (maintenanceEnabled) {
        return res.status(503).json({ error: "Only admin login is allowed during maintenance" });
      }
      await storage.createLoginAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'invalid_email',
        attemptedAt: new Date(),
      });
      return res.status(401).json({ error: "No account found with this email address" });
    }

    if (maintenanceEnabled && !user.isAdmin) {
      return res.status(503).json({ error: "Only admin login is allowed during maintenance" });
    }

    const passwordHash = user.passwordHash;
    const validPassword = typeof passwordHash === "string" && await bcrypt.compare(password, passwordHash);
    if (!validPassword) {
      // Record failed attempt
      await storage.createLoginAttempt({
        email,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'invalid_password',
        attemptedAt: new Date(),
      });

      // Check recent failed attempts (last 15 minutes)
      const recentAttempts = await storage.getRecentLoginAttempts(email, 15);
      const failedCount = recentAttempts.filter(a => !a.success).length;

      if (failedCount >= 3) {
        // Lock account for 30 minutes
        const lockDuration = 30 * 60 * 1000; // 30 minutes
        const lockedUntil = new Date(Date.now() + lockDuration);
        await storage.createAccountLockout({
          userId: user.id,
          email,
          lockedUntil,
          reason: 'too_many_failed_attempts',
          ipAddress,
          lockedAt: new Date(),
        });
        await storage.updateUser(user.id, {
          accountLocked: true,
          lockedUntil,
          failedLoginAttempts: failedCount,
          lastFailedLogin: new Date(),
        } as any);
        await storage.createSecurityEvent({
          userId: user.id,
          eventType: 'account_locked',
          severity: 'warning',
          ipAddress,
          userAgent,
          metadata: { failedAttempts: failedCount, lockDuration: '30 minutes' },
        });
        return res.status(403).json({
          error: "Account locked",
          message: "Too many failed login attempts. Account locked for 30 minutes.",
        });
      }

      await storage.createSecurityEvent({
        userId: user.id,
        eventType: 'failed_login',
        severity: 'info',
        ipAddress,
        userAgent,
        metadata: { failedAttempts: failedCount + 1 },
      });

      return res.status(401).json({
        error: "Incorrect password",
        attemptsRemaining: 3 - (failedCount + 1),
      });
    }

    if (!user.emailVerified) {
      const otp = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await storage.updateUser(user.id, {
        verificationCode: otp,
        verificationExpiry: expiry,
      } as any);
      await sendVerifyEmail(email, user.firstName || "", otp);
      return res.status(403).json({ error: "Email not verified", needsVerification: true, email });
    }

    // Check if admin 2FA is required
    if (user.isAdmin) {
      try {
        const twoFaSetting = await storage.getSystemSetting('require_admin_2fa');
        if (twoFaSetting === 'true') {
          const otp = generateOTP();
          const expiry = new Date(Date.now() + 10 * 60 * 1000);
          await storage.updateUser(user.id, {
            verificationCode: otp,
            verificationExpiry: expiry,
          } as any);
          await sendVerifyEmail(email, user.firstName || "", otp);
          logger.info("Admin 2FA OTP sent", { userId: user.id, email });
          return res.json({
            requires2FA: true,
            email,
            message: "A verification code has been sent to your email.",
          });
        }
      } catch (err) {
        // If setting doesn't exist, skip 2FA
      }
    }

    // Successful login - create session and clear lockout
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await storage.createSession({
      userId: user.id,
      sessionToken,
      ipAddress,
      userAgent,
      expiresAt,
      lastActivity: new Date(),
      isActive: true,
    });

    await storage.createLoginAttempt({
      email,
      ipAddress,
      userAgent,
      success: true,
      attemptedAt: new Date(),
    });

    await storage.updateUser(user.id, {
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      accountLocked: false,
      lockedUntil: null,
    } as any);

    await storage.createSecurityEvent({
      userId: user.id,
      eventType: 'login_success',
      severity: 'info',
      ipAddress,
      userAgent,
      metadata: { sessionToken: sessionToken.substring(0, 8) + '...' },
    });

    const token = signToken({ userId: user.id, email: user.email! });
    res.cookie("auth_token", token, COOKIE_OPTIONS);
    res.cookie("session_token", sessionToken, COOKIE_OPTIONS);

    logger.info("User login", { userId: user.id, email });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error: any) {
    logger.error("Login error", { error: error.message });
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/verify-admin-2fa", authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and verification code are required" });
    }

    const user = await storage.getUserByEmail(email);
    if (!user || !user.isAdmin) {
      return res.status(401).json({ error: "Invalid verification" });
    }

    const verificationCode = (user as any).verificationCode;
    const verificationExpiry = (user as any).verificationExpiry;

    if (!verificationCode || verificationCode !== code) {
      return res.status(401).json({ error: "Invalid verification code" });
    }

    if (verificationExpiry && new Date(verificationExpiry) < new Date()) {
      return res.status(401).json({ error: "Verification code has expired" });
    }

    const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').toString();
    const userAgent = req.headers['user-agent'] || 'unknown';

    await storage.updateUser(user.id, {
      verificationCode: null,
      verificationExpiry: null,
      failedLoginAttempts: 0,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress,
      accountLocked: false,
      lockedUntil: null,
    } as any);

    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await storage.createSession({
      userId: user.id,
      sessionToken,
      ipAddress,
      userAgent,
      expiresAt,
      lastActivity: new Date(),
      isActive: true,
    });

    await storage.createLoginAttempt({
      email,
      ipAddress,
      userAgent,
      success: true,
      attemptedAt: new Date(),
    });

    await storage.createSecurityEvent({
      userId: user.id,
      eventType: 'admin_2fa_verified',
      severity: 'info',
      ipAddress,
      userAgent,
      metadata: {},
    });

    const token = signToken({ userId: user.id, email: user.email! });
    res.cookie("auth_token", token, COOKIE_OPTIONS);
    res.cookie("session_token", sessionToken, COOKIE_OPTIONS);

    logger.info("Admin 2FA verified", { userId: user.id, email });
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        onboardingCompleted: user.onboardingCompleted,
      },
    });
  } catch (error: any) {
    logger.error("Admin 2FA verification error", { error: error.message });
    return res.status(500).json({ error: "Verification failed" });
  }
});

router.post("/forgot-password", authLimiter, async (req: Request, res: Response) => {
  try {
    if (await isMaintenanceModeEnabled()) {
      return res.status(503).json({ error: "Service is temporarily unavailable due to maintenance" });
    }

    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email } = parsed.data;
    const user = await storage.getUserByEmail(email);

    if (!user) {
      return res.json({ message: "If an account exists with this email, a reset code has been sent." });
    }

    const otp = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);

    await storage.updateUser(user.id, {
      resetCode: otp,
      resetExpiry: expiry,
    } as any);

    await sendResetPasswordEmail(email, user.firstName || "", otp);

    logger.info("Password reset requested", { email });
    return res.json({ message: "If an account exists with this email, a reset code has been sent." });
  } catch (error: any) {
    logger.error("Forgot password error", { error: error.message });
    return res.status(500).json({ error: "Failed to process request" });
  }
});

router.post("/reset-password", authLimiter, async (req: Request, res: Response) => {
  try {
    if (await isMaintenanceModeEnabled()) {
      return res.status(503).json({ error: "Service is temporarily unavailable due to maintenance" });
    }

    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.errors[0].message });
    }

    const { email, code, newPassword } = parsed.data;
    const user = await storage.getUserByEmail(email);

    if (!user) {
      return res.status(400).json({ error: "Invalid reset request" });
    }

    if (!user.resetCode || user.resetCode !== code) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    if (user.resetExpiry && new Date() > user.resetExpiry) {
      return res.status(400).json({ error: "Reset code has expired. Please request a new one." });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await storage.updateUser(user.id, {
      passwordHash,
      resetCode: null,
      resetExpiry: null,
    } as any);

    logger.info("Password reset successful", { userId: user.id, email });
    return res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error: any) {
    logger.error("Reset password error", { error: error.message });
    return res.status(500).json({ error: "Failed to reset password" });
  }
});

router.get("/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const user = await storage.getUser(userId);

    if (!user) {
      res.clearCookie("auth_token");
      return res.status(401).json({ error: "User not found" });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isAdmin: user.isAdmin,
        onboardingCompleted: user.onboardingCompleted,
        onboardingStep: user.onboardingStep || 1,
        profileImageUrl: user.profileImageUrl,
      },
    });
  } catch (error: any) {
    logger.error("Get me error", { error: error.message });
    return res.status(500).json({ error: "Failed to get user info" });
  }
});

router.post("/logout", async (req: Request, res: Response) => {
  try {
    const sessionToken = req.cookies?.session_token;
    const userId = (req as any).userId;

    if (sessionToken) {
      await storage.revokeSession(sessionToken, 'logout');
    }

    if (userId) {
      const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').toString();
      const userAgent = req.headers['user-agent'] || 'unknown';
      await storage.createSecurityEvent({
        userId,
        eventType: 'logout',
        severity: 'info',
        ipAddress,
        userAgent,
      });
    }

    res.clearCookie("auth_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    res.clearCookie("session_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    logger.info("User logged out", { userId });
    return res.json({ message: "Logged out successfully" });
  } catch (error: any) {
    logger.error("Logout error", { error: error.message });
    return res.status(500).json({ error: "Logout failed" });
  }
});

router.get("/config", async (_req: Request, res: Response) => {
  const googleConfigured = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const googleEnabled = await isGoogleLoginEnabled();
  return res.json({
    googleConfigured,
    googleEnabled,
    workspaceOnly: true,
  });
});

// ============================================
// Google OAuth Routes
// ============================================

// Initiate Google OAuth flow
router.get("/google", authLimiter, async (req: Request, res: Response, next) => {
  if (!(await isGoogleLoginEnabled())) {
    return res.status(503).json({
      error: "Google login is currently disabled by the administrator."
    });
  }

  if (!googleStrategyConfigured && !configureGoogleStrategy()) {
    return res.status(503).json({
      error: "Google OAuth is not configured. Please contact the administrator."
    });
  }

  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false
  })(req, res, next);
});

// Google OAuth callback
router.get("/google/callback", authLimiter, async (req: Request, res: Response, next) => {
  if (!(await isGoogleLoginEnabled())) {
    return res.redirect(`/auth/sign-in?error=google_disabled`);
  }

  if (!googleStrategyConfigured && !configureGoogleStrategy()) {
    return res.redirect(`/auth/sign-in?error=google_not_configured`);
  }

  passport.authenticate("google", { session: false }, async (err: any, profile: any) => {
    try {
      if (err) {
        logger.error("Google OAuth error", { error: err.message });
        return res.redirect(`/auth/sign-in?error=oauth_failed`);
      }

      if (!profile || !profile.emails || !profile.emails[0]) {
        logger.error("Google OAuth: No email in profile");
        return res.redirect(`/auth/sign-in?error=no_email`);
      }

      const email = profile.emails[0].value;
      if (isConsumerEmail(email)) {
        logger.warn("Google OAuth blocked for consumer email domain", { email });
        return res.redirect(`/auth/sign-in?error=workspace_email_required`);
      }

      const googleId = profile.id;
      const firstName = profile.name?.givenName || "";
      const lastName = profile.name?.familyName || "";
      const profilePicture = profile.photos?.[0]?.value || "";

      // Check if user exists by email or Google ID
      let user = await storage.getUserByEmail(email);

      if (!user) {
        user = await storage.getUserByGoogleId(googleId);
      }

      const ipAddress = (req.ip || req.socket.remoteAddress || 'unknown').toString();
      const userAgent = req.headers['user-agent'] || 'unknown';

      if (user) {
        // User exists - sign in with Google
        // Update Google ID if not set (linking existing email account to Google)
        if (!user.googleId) {
          await storage.updateUser(user.id, {
            googleId,
            authProvider: 'google',
            profilePicture,
          });
        }

        // Update last login info
        await storage.updateUser(user.id, {
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
        });

        // Create session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        await storage.createSession({
          userId: user.id,
          sessionToken,
          ipAddress,
          userAgent,
          deviceInfo: userAgent,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

        // Log security event
        await storage.createSecurityEvent({
          userId: user.id,
          eventType: 'login_success',
          severity: 'info',
          ipAddress,
          userAgent,
          metadata: { authProvider: 'google' },
        });

        // Generate JWT token
        const token = signToken({ userId: user.id, email: user.email });

        // Set cookies
        res.cookie("auth_token", token, COOKIE_OPTIONS);
        res.cookie("session_token", sessionToken, COOKIE_OPTIONS);

        logger.info("Google OAuth login successful", { userId: user.id, email });

        // Redirect based on role
        if (user.isAdmin) {
          return res.redirect("/admin/brands");
        } else if (user.onboardingCompleted) {
          return res.redirect("/app/dashboard");
        } else {
          return res.redirect("/onboarding");
        }
      } else {
        // New user - sign up with Google
        // Note: Terms acceptance should be handled on the frontend before initiating OAuth
        // For now, we'll assume terms are accepted when using Google OAuth
        const newUserId = crypto.randomUUID();

        const newUser = await storage.createUser({
          id: newUserId,
          email,
          firstName,
          lastName,
          googleId,
          authProvider: 'google',
          emailVerified: true, // Google emails are verified
          profilePicture,
          termsAccepted: true, // Assumed accepted when using Google OAuth
          termsAcceptedAt: new Date(),
          lastLoginAt: new Date(),
          lastLoginIp: ipAddress,
        });

        // Create session
        const sessionToken = crypto.randomBytes(32).toString('hex');
        await storage.createSession({
          userId: newUser.id,
          sessionToken,
          ipAddress,
          userAgent,
          deviceInfo: userAgent,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        });

        // Log security event
        await storage.createSecurityEvent({
          userId: newUser.id,
          eventType: 'login_success',
          severity: 'info',
          ipAddress,
          userAgent,
          metadata: { authProvider: 'google', newUser: true },
        });

        // Generate JWT token
        const token = signToken({ userId: newUser.id, email: newUser.email });

        // Set cookies
        res.cookie("auth_token", token, COOKIE_OPTIONS);
        res.cookie("session_token", sessionToken, COOKIE_OPTIONS);

        logger.info("Google OAuth signup successful", { userId: newUser.id, email });

        // Redirect to onboarding for new users
        return res.redirect("/onboarding");
      }
    } catch (error: any) {
      logger.error("Google OAuth callback error", { error: error.message });
      return res.redirect(`/auth/sign-in?error=oauth_error`);
    }
  })(req, res, next);
});

export default router;
