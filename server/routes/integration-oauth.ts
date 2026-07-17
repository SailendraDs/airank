import type { Express } from "express";
import crypto from "crypto";
import { requireAuth } from "../auth-middleware";
import { storage } from "../storage";
import { db } from "../db";
import { integrationConnectionEvents, integrations, teamMembers } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { enforceFeatureAccess } from "../middleware/plan-enforcement";

const SCOPES: Record<string, string> = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
};

const PLATFORM_MAP: Record<string, string> = {
  gsc: "google_search_console",
  ga4: "google_analytics",
};

const SOCIAL_FEATURES: Record<string, string> = {
  x: "social_x",
  instagram: "social_instagram",
  youtube: "social_youtube",
};

const SOCIAL_PLATFORM_MAP: Record<string, string> = {
  x: "x",
  instagram: "instagram",
  youtube: "youtube",
};

const pendingStates = new Map<string, { brandId: string; service: string; userId: string; expiresAt: number }>();

async function getOAuthCredentials() {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    (await storage.getSystemSetting("google_oauth_client_id")) ||
    (await storage.getSystemSetting("google_client_id"));
  const clientSecret =
    process.env.GOOGLE_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    (await storage.getSystemSetting("google_oauth_client_secret")) ||
    (await storage.getSystemSetting("google_client_secret"));
  return { clientId, clientSecret };
}

async function fetchGoogleJson(accessToken: string, url: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function discoverGoogleOAuthResources(service: string, accessToken: string) {
  try {
    if (service === "gsc") {
      const data = await fetchGoogleJson(accessToken, "https://www.googleapis.com/webmasters/v3/sites");
      const resources = Array.isArray(data.siteEntry) ? data.siteEntry.map((site: any) => ({
        id: site.siteUrl,
        name: site.siteUrl,
        permissionLevel: site.permissionLevel || null,
      })) : [];
      return {
        status: "completed",
        resources,
        primaryResource: resources[0] || null,
      };
    }

    if (service === "ga4") {
      const data = await fetchGoogleJson(accessToken, "https://analyticsadmin.googleapis.com/v1alpha/accountSummaries");
      const resources = Array.isArray(data.accountSummaries) ? data.accountSummaries.flatMap((account: any) => {
        const properties = Array.isArray(account.propertySummaries) ? account.propertySummaries : [];
        return properties.map((property: any) => ({
          id: property.property,
          name: property.displayName || property.property,
          account: account.account,
          accountName: account.displayName || account.account,
          propertyType: property.propertyType || null,
        }));
      }) : [];
      return {
        status: "completed",
        resources,
        primaryResource: resources[0] || null,
      };
    }
  } catch (error: any) {
    return {
      status: "failed",
      resources: [],
      primaryResource: null,
      error: error?.message || "Resource discovery failed",
    };
  }

  return { status: "skipped", resources: [], primaryResource: null };
}

async function hasBrandAccess(brandId: string | undefined, userId: string | undefined) {
  if (!brandId || !userId) return false;

  const brand = await storage.getBrand(brandId);
  if (!brand) return false;
  if (brand.userId === userId) return true;

  const user = await storage.getUser(userId).catch(() => undefined);
  if (user?.isAdmin) return true;

  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(
      eq(teamMembers.brandId, brandId),
      eq(teamMembers.userId, userId),
      eq(teamMembers.status, "active"),
    ))
    .limit(1);

  return Boolean(member);
}

async function requireBrandIntegrationAccess(req: any, res: any, next: any) {
  const brandId = req.params.brandId || req.body?.brandId || req.query?.brandId;
  if (!brandId) return res.status(400).json({ message: "brandId is required." });
  if (!(await hasBrandAccess(String(brandId), req.userId))) {
    return res.status(404).json({ message: "Brand not found." });
  }
  req.params.brandId = String(brandId);
  next();
}

export function registerIntegrationOAuthRoutes(app: Express) {
  // Initiate Google OAuth consent for GSC or GA4
  app.get("/api/integrations/google/connect", requireAuth, requireBrandIntegrationAccess, async (req: any, res, next) => {
    const service = req.query.service as string;
    const feature = service === "ga4" ? "ga4_oauth" : service === "gsc" ? "gsc_oauth" : null;
    if (!feature) return next();
    return enforceFeatureAccess(feature)(req, res, next);
  }, async (req: any, res) => {
    try {
      const service = req.query.service as string;
      const brandId = req.query.brandId as string;

      if (!service || !SCOPES[service]) {
        return res.status(400).json({ message: "Invalid service. Must be 'gsc' or 'ga4'." });
      }
      if (!brandId) {
        return res.status(400).json({ message: "brandId is required." });
      }

      const { clientId, clientSecret } = await getOAuthCredentials();
      if (!clientId || !clientSecret) {
        return res.status(500).json({ message: "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET or GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Google API keys enable API calls but cannot complete user OAuth consent." });
      }

      const state = crypto.randomBytes(24).toString("hex");
      pendingStates.set(state, {
        brandId,
        service,
        userId: req.userId,
        expiresAt: Date.now() + 10 * 60 * 1000, // 10 min TTL
      });

      await db.insert(integrationConnectionEvents).values({
        brandId,
        platform: PLATFORM_MAP[service],
        eventType: "oauth_started",
        status: "pending",
        actorUserId: req.userId,
        scopes: [SCOPES[service]],
        message: `${service.toUpperCase()} OAuth consent started`,
      }).catch(() => undefined);

      const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/google/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES[service],
        access_type: "offline",
        prompt: "consent",
        state,
      });

      res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // OAuth callback — exchange code for tokens and store integration
  app.get("/api/integrations/google/callback", async (req, res) => {
    try {
      const { code, state, error: oauthError } = req.query as Record<string, string>;

      if (oauthError) {
        return res.redirect(`/app/integrations?error=${encodeURIComponent(oauthError)}`);
      }
      if (!code || !state) {
        return res.redirect("/app/integrations?error=missing_params");
      }

      const pending = pendingStates.get(state);
      if (!pending || pending.expiresAt < Date.now()) {
        pendingStates.delete(state);
        return res.redirect("/app/integrations?error=invalid_state");
      }
      pendingStates.delete(state);

      const { brandId, service, userId } = pending;
      const { clientId, clientSecret } = await getOAuthCredentials();
      const redirectUri = `${req.protocol}://${req.get("host")}/api/integrations/google/callback`;

      // Exchange authorization code for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId!,
          client_secret: clientSecret!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        console.error("Google token exchange failed:", errBody);
        return res.redirect("/app/integrations?error=token_exchange_failed");
      }

      const tokenData = await tokenRes.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      const platform = PLATFORM_MAP[service];
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();
      const discovery = await discoverGoogleOAuthResources(service, tokenData.access_token);
      const primaryResource = discovery.primaryResource as any;
      const accountId = primaryResource?.id || userId;
      const accountName = primaryResource?.name || `OAuth (${service.toUpperCase()})`;

      // Upsert: delete existing integration for this brand+platform, then insert
      await db
        .delete(integrations)
        .where(and(eq(integrations.brandId, brandId), eq(integrations.platform, platform)));

      await db.insert(integrations).values({
        brandId,
        type: platform,
        name: `OAuth (${service.toUpperCase()})`,
        platform,
        status: "connected",
        syncStatus: "connected",
        accountId,
        accountName,
        config: {
          platform,
          status: "connected",
          service,
          completionStatus: discovery.status,
          discoveredResources: discovery.resources,
          primaryResource,
          resourceCount: discovery.resources.length,
          discoveryError: (discovery as any).error || null,
        },
        credentials: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || null,
          expiresAt,
          scope: tokenData.scope,
        },
      } as any);

      await db.insert(integrationConnectionEvents).values({
        brandId,
        platform,
        eventType: "oauth_connected",
        status: "connected",
        actorUserId: userId,
        scopes: tokenData.scope ? tokenData.scope.split(/\s+/) : [SCOPES[service]],
        message: `${service.toUpperCase()} OAuth tokens stored; ${discovery.resources.length} resource${discovery.resources.length === 1 ? "" : "s"} discovered`,
      }).catch(() => undefined);

      res.redirect(`/app/integrations?connected=${service}`);
    } catch (error: any) {
      console.error("Integration OAuth callback error:", error);
      res.redirect("/app/integrations?error=callback_failed");
    }
  });

  app.post("/api/integrations/social/:platform/connect", requireAuth, requireBrandIntegrationAccess, async (req: any, res, next) => {
    const platform = req.params.platform as string;
    const feature = SOCIAL_FEATURES[platform];
    if (!feature) return res.status(400).json({ message: "Unsupported social platform." });
    return enforceFeatureAccess(feature)(req, res, next);
  }, async (req: any, res) => {
    try {
      const rawPlatform = req.params.platform as string;
      const platform = SOCIAL_PLATFORM_MAP[rawPlatform];
      const brandId = req.body.brandId || req.query.brandId;
      const handle = String(req.body.handle || "").trim();

      if (!brandId) return res.status(400).json({ message: "brandId is required." });
      if (!handle) return res.status(400).json({ message: "handle or channel identifier is required." });

      await db.delete(integrations).where(and(eq(integrations.brandId, brandId), eq(integrations.platform, platform)));
      const [integration] = await db.insert(integrations).values({
        brandId,
        type: platform,
        name: `${rawPlatform} manual setup`,
        platform,
        status: "manual_pending",
        syncStatus: "manual_pending",
        accountId: handle,
        accountName: handle,
        config: {
          platform,
          status: "manual_pending",
          mode: "manual_connection_request",
          handle,
        },
        credentials: {
          mode: "manual_connection_request",
          requestedAt: new Date().toISOString(),
          instructions: `${rawPlatform} API OAuth requires app credentials and review. Admin setup desk should verify account ownership before enabling automated sync.`,
        },
      } as any).returning();

      await db.insert(integrationConnectionEvents).values({
        brandId,
        platform,
        eventType: "manual_connection_requested",
        status: "manual_pending",
        actorUserId: req.userId,
        scopes: [],
        message: `${rawPlatform} connection request recorded for ${handle}`,
      }).catch(() => undefined);

      res.json({
        integration,
        nextStep: "Admin setup desk should verify the account, collect API/app approval details, and mark evidence verified before automated sync claims.",
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Disconnect an integration
  app.delete("/api/integrations/google/:integrationId", requireAuth, async (req: any, res) => {
    try {
      const { integrationId } = req.params;
      const brandId = req.query.brandId as string | undefined;
      const platform = req.query.platform as string | undefined;

      // Support disconnect by platform+brandId or by direct integration ID
      if (platform && brandId) {
        const brand = await storage.getBrand(brandId);
        if (!brand || brand.userId !== req.userId) {
          return res.status(404).json({ message: "Integration not found." });
        }
        await db
          .delete(integrations)
          .where(and(eq(integrations.brandId, brandId), eq(integrations.platform, platform)));
        return res.json({ success: true });
      }

      const [row] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, integrationId))
        .limit(1);

      if (!row) {
        return res.status(404).json({ message: "Integration not found." });
      }
      const brand = await storage.getBrand(row.brandId);
      if (!brand || brand.userId !== req.userId) {
        return res.status(404).json({ message: "Integration not found." });
      }

      await db.delete(integrations).where(eq(integrations.id, integrationId));
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });
}
