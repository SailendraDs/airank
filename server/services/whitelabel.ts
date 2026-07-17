// White-Label Service - Handle agency branding and custom domains
// Enables agencies to resell AIRank under their own brand

import { storage } from '../storage';
import { db } from '../db';
import { agencies, agencyClients } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface WhiteLabelConfig {
  agencyName: string;
  agencyLogoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  websiteUrl?: string;
  contactEmail?: string;
  customDomain?: string;
  emailTemplate?: string;
  customCss?: string;
  isActive: boolean;
}

export interface WhiteLabelContext {
  brandId: string;
  agencyId: string;
  config: WhiteLabelConfig;
  isWhiteLabel: boolean;
}

export class WhiteLabelService {
  /**
   * Get agency configuration by agency ID (reads from agencies table, falls
   * back to system_settings for installations without per-agency rows).
   */
  async getAgencyConfig(agencyId: string): Promise<WhiteLabelConfig | null> {
    try {
      if (agencyId) {
        const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId)).limit(1);

        if (agency) {
          return {
            agencyName: agency.name,
            agencyLogoUrl: agency.logoUrl || undefined,
            primaryColor: agency.primaryColor || '#2563EB',
            secondaryColor: agency.secondaryColor || '#1E40AF',
            websiteUrl: agency.customDomain ? `https://${agency.customDomain}` : undefined,
            contactEmail: agency.supportEmail || undefined,
            customDomain: agency.customDomain || undefined,
            emailTemplate: agency.emailTemplate || undefined,
            customCss: agency.customCss || undefined,
            isActive: true,
          };
        }
      }

      // Fallback: global system_settings for legacy / single-tenant installs
      return this.getGlobalConfig();
    } catch (error) {
      console.error('[WhiteLabelService] Failed to get agency config:', error);
      return null;
    }
  }

  /**
   * Look up which agency owns a brand via the agency_clients join table.
   */
  async getAgencyForBrand(brandId: string): Promise<WhiteLabelConfig | null> {
    try {
      const [link] = await db
        .select({ agencyId: agencyClients.agencyId })
        .from(agencyClients)
        .where(eq(agencyClients.brandId, brandId))
        .limit(1);

      if (link) {
        return this.getAgencyConfig(link.agencyId);
      }

      // No agency linked — fall back to global config
      return this.getGlobalConfig();
    } catch (error) {
      console.error('[WhiteLabelService] Failed to get agency for brand:', error);
      return null;
    }
  }

  /**
   * Update branding fields on an existing agency row.
   */
  async applyBranding(
    agencyId: string,
    config: Partial<WhiteLabelConfig>,
  ): Promise<void> {
    await db
      .update(agencies)
      .set({
        ...(config.agencyName !== undefined && { name: config.agencyName }),
        ...(config.agencyLogoUrl !== undefined && { logoUrl: config.agencyLogoUrl }),
        ...(config.primaryColor !== undefined && { primaryColor: config.primaryColor }),
        ...(config.secondaryColor !== undefined && { secondaryColor: config.secondaryColor }),
        ...(config.customDomain !== undefined && { customDomain: config.customDomain }),
        ...(config.contactEmail !== undefined && { supportEmail: config.contactEmail }),
        ...(config.emailTemplate !== undefined && { emailTemplate: config.emailTemplate }),
        ...(config.customCss !== undefined && { customCss: config.customCss }),
        updatedAt: new Date(),
      })
      .where(eq(agencies.id, agencyId));
  }

  /**
   * Get agency configuration by custom domain.
   */
  async getAgencyByDomain(domain: string): Promise<WhiteLabelConfig | null> {
    try {
      const [agency] = await db
        .select()
        .from(agencies)
        .where(eq(agencies.customDomain, domain.toLowerCase()))
        .limit(1);

      if (agency) {
        return {
          agencyName: agency.name,
          agencyLogoUrl: agency.logoUrl || undefined,
          primaryColor: agency.primaryColor || '#2563EB',
          secondaryColor: agency.secondaryColor || '#1E40AF',
          websiteUrl: agency.customDomain ? `https://${agency.customDomain}` : undefined,
          contactEmail: agency.supportEmail || undefined,
          customDomain: agency.customDomain || undefined,
          emailTemplate: agency.emailTemplate || undefined,
          customCss: agency.customCss || undefined,
          isActive: true,
        };
      }

      // Fallback: check legacy system_settings domain
      const legacyDomain = await storage.getSystemSetting('agency_custom_domain');
      if (legacyDomain && legacyDomain.toLowerCase() === domain.toLowerCase()) {
        return this.getGlobalConfig();
      }

      return null;
    } catch (error) {
      console.error('[WhiteLabelService] Failed to get agency by domain:', error);
      return null;
    }
  }

  /**
   * Get white-label context for a request (resolves brand → agency).
   */
  async getWhiteLabelContext(brandId: string, userId?: string): Promise<WhiteLabelContext | null> {
    try {
      // Try brand → agency lookup first
      const [link] = await db
        .select({ agencyId: agencyClients.agencyId })
        .from(agencyClients)
        .where(eq(agencyClients.brandId, brandId))
        .limit(1);

      const agencyId = link?.agencyId || '';
      const agencyConfig = agencyId
        ? await this.getAgencyConfig(agencyId)
        : await this.getGlobalConfig();

      if (!agencyConfig || !agencyConfig.isActive) return null;

      return {
        brandId,
        agencyId: agencyId || 'default',
        config: agencyConfig,
        isWhiteLabel: true,
      };
    } catch (error) {
      console.error('[WhiteLabelService] Failed to get white-label context:', error);
      return null;
    }
  }

  /**
   * Check if white-label is enabled globally.
   */
  async isWhiteLabelEnabled(): Promise<boolean> {
    const enabled = await storage.getSystemSetting('whitelabel_enabled');
    return enabled === 'true';
  }

  /**
   * Toggle white-label mode.
   */
  async toggleWhiteLabel(enabled: boolean, updatedBy?: string): Promise<void> {
    await storage.setSystemSetting('whitelabel_enabled', enabled ? 'true' : 'false', updatedBy);
  }

  /**
   * Update legacy global white-label config used by the admin settings route.
   */
  async setAgencyConfig(config: Partial<WhiteLabelConfig>, updatedBy?: string): Promise<void> {
    const entries: Array<[string, string | undefined]> = [
      ['agency_name', config.agencyName],
      ['agency_logo_url', config.agencyLogoUrl],
      ['agency_primary_color', config.primaryColor],
      ['agency_secondary_color', config.secondaryColor],
      ['agency_website_url', config.websiteUrl],
      ['agency_contact_email', config.contactEmail],
      ['agency_custom_domain', config.customDomain],
      ['agency_email_template', config.emailTemplate],
      ['agency_custom_css', config.customCss],
    ];

    for (const [key, value] of entries) {
      if (value !== undefined) {
        await storage.setSystemSetting(key, value, updatedBy);
      }
    }
  }

  /**
   * Get theme colors for white-label.
   */
  getThemeColors(config: WhiteLabelConfig): { primary: string; secondary: string } {
    return {
      primary: config.primaryColor || '#2563EB',
      secondary: config.secondaryColor || '#1E40AF',
    };
  }

  /**
   * Validate custom domain format.
   */
  validateDomain(domain: string): { valid: boolean; error?: string } {
    const domainRegex = /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
      return { valid: false, error: 'Invalid domain format' };
    }

    const reserved = ['api', 'app', 'admin', 'www', 'mail', 'ftp', 'localhost'];
    const subdomain = domain.split('.')[0];
    if (reserved.includes(subdomain.toLowerCase())) {
      return { valid: false, error: `${subdomain} is a reserved subdomain` };
    }

    return { valid: true };
  }

  // ------------------------------------------------------------------
  // Private: legacy global config from system_settings
  // ------------------------------------------------------------------
  private async getGlobalConfig(): Promise<WhiteLabelConfig | null> {
    const agencyName = await storage.getSystemSetting('agency_name');
    if (!agencyName) return null;

    const agencyLogo = await storage.getSystemSetting('agency_logo_url');
    const primaryColor = await storage.getSystemSetting('agency_primary_color');
    const secondaryColor = await storage.getSystemSetting('agency_secondary_color');
    const websiteUrl = await storage.getSystemSetting('agency_website_url');
    const contactEmail = await storage.getSystemSetting('agency_contact_email');
    const customDomain = await storage.getSystemSetting('agency_custom_domain');

    return {
      agencyName,
      agencyLogoUrl: agencyLogo || undefined,
      primaryColor: primaryColor || '#2563EB',
      secondaryColor: secondaryColor || '#1E40AF',
      websiteUrl: websiteUrl || undefined,
      contactEmail: contactEmail || undefined,
      customDomain: customDomain || undefined,
      isActive: true,
    };
  }
}

// Singleton instance
let serviceInstance: WhiteLabelService | null = null;

export function getWhiteLabelService(): WhiteLabelService {
  if (!serviceInstance) {
    serviceInstance = new WhiteLabelService();
  }
  return serviceInstance;
}
