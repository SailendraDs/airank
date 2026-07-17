import type { Express } from 'express';
import { requireAuth, requireAdmin } from '../auth-middleware';
import { db } from '../db';
import { agencies, agencyClients, brands as brandsTable } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { getWhiteLabelService } from '../services/whitelabel';
import { z } from 'zod';

const createAgencyBody = z.object({
  ownerUserId: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().optional(),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  customDomain: z.string().optional(),
  supportEmail: z.string().email().optional(),
  emailFromName: z.string().optional(),
  emailTemplate: z.string().optional(),
  customCss: z.string().optional(),
  hidePoweredBy: z.boolean().optional(),
});

const patchAgencyBody = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().optional(),
  logoUrl: z.string().nullable().optional(),
  faviconUrl: z.string().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  secondaryColor: z.string().nullable().optional(),
  customDomain: z.string().nullable().optional(),
  supportEmail: z.string().email().nullable().optional(),
  emailFromName: z.string().nullable().optional(),
  emailTemplate: z.string().nullable().optional(),
  customCss: z.string().nullable().optional(),
  hidePoweredBy: z.boolean().optional(),
});

const linkClientBody = z.object({
  brandId: z.string().min(1),
  clientName: z.string().optional(),
  clientContactEmail: z.string().email().optional(),
});

export function registerAgencyRoutes(app: Express): void {
  const getUserId = (req: any): string => req.userId;

  // POST /api/agencies — create agency (admin only)
  app.post('/api/agencies', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const body = createAgencyBody.parse(req.body);

      if (body.customDomain) {
        const wl = getWhiteLabelService();
        const domainCheck = wl.validateDomain(body.customDomain);
        if (!domainCheck.valid) {
          return res.status(400).json({ message: domainCheck.error });
        }
      }

      const [agency] = await db.insert(agencies).values(body).returning();
      res.status(201).json(agency);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      console.error('[AgencyRoutes] Create agency failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/agencies/:id — get agency config
  app.get('/api/agencies/:id', requireAuth, async (req: any, res) => {
    try {
      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.id, req.params.id))
        .limit(1);

      if (!agency) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      res.json(agency);
    } catch (error: any) {
      console.error('[AgencyRoutes] Get agency failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PATCH /api/agencies/:id — update agency branding
  app.patch('/api/agencies/:id', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const body = patchAgencyBody.parse(req.body);

      if (body.customDomain) {
        const wl = getWhiteLabelService();
        const domainCheck = wl.validateDomain(body.customDomain);
        if (!domainCheck.valid) {
          return res.status(400).json({ message: domainCheck.error });
        }
      }

      const [updated] = await db
        .update(agencies)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(agencies.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      res.json(updated);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      console.error('[AgencyRoutes] Update agency failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // GET /api/agencies/:id/clients — list linked brands
  app.get('/api/agencies/:id/clients', requireAuth, async (req: any, res) => {
    try {
      const clients = await db
        .select({
          id: agencyClients.id,
          agencyId: agencyClients.agencyId,
          brandId: agencyClients.brandId,
          clientName: agencyClients.clientName,
          clientContactEmail: agencyClients.clientContactEmail,
          createdAt: agencyClients.createdAt,
          brandName: brandsTable.name,
        })
        .from(agencyClients)
        .leftJoin(brandsTable, eq(agencyClients.brandId, brandsTable.id))
        .where(eq(agencyClients.agencyId, req.params.id));

      res.json(clients);
    } catch (error: any) {
      console.error('[AgencyRoutes] List clients failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // POST /api/agencies/:id/clients — link a brand to agency
  app.post('/api/agencies/:id/clients', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      const body = linkClientBody.parse(req.body);

      // Verify agency exists
      const [agency] = await db
        .select({ id: agencies.id })
        .from(agencies)
        .where(eq(agencies.id, req.params.id))
        .limit(1);
      if (!agency) {
        return res.status(404).json({ message: 'Agency not found' });
      }

      const [link] = await db
        .insert(agencyClients)
        .values({
          agencyId: req.params.id,
          brandId: body.brandId,
          clientName: body.clientName,
          clientContactEmail: body.clientContactEmail,
        })
        .returning();

      res.status(201).json(link);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.errors });
      }
      console.error('[AgencyRoutes] Link client failed:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE /api/agencies/:id/clients/:brandId — unlink a brand
  app.delete('/api/agencies/:id/clients/:brandId', requireAuth, requireAdmin, async (req: any, res) => {
    try {
      await db
        .delete(agencyClients)
        .where(
          and(
            eq(agencyClients.agencyId, req.params.id),
            eq(agencyClients.brandId, req.params.brandId),
          ),
        );

      res.json({ message: 'Brand unlinked from agency' });
    } catch (error: any) {
      console.error('[AgencyRoutes] Unlink client failed:', error);
      res.status(500).json({ message: error.message });
    }
  });
}
