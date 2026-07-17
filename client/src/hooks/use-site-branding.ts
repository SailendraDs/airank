import { useQuery } from "@tanstack/react-query";

export type SiteBranding = {
  logoUrl: string;
  faviconUrl: string;
  assetVersion: string;
};

const DEFAULT_BRANDING: SiteBranding = {
  logoUrl: "/logo.png",
  faviconUrl: "/favicon.png",
  assetVersion: "20260322",
};

export function withBrandingVersion(url: string, assetVersion?: string): string {
  if (!url) return DEFAULT_BRANDING.logoUrl;
  if (!assetVersion) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(assetVersion)}`;
}

export async function fetchSiteBranding(): Promise<SiteBranding> {
  try {
    const res = await fetch("/api/site-branding", { credentials: "include" });
    if (!res.ok) return DEFAULT_BRANDING;
    const data = await res.json();
    return {
      logoUrl: String(data?.logoUrl || DEFAULT_BRANDING.logoUrl),
      faviconUrl: String(data?.faviconUrl || DEFAULT_BRANDING.faviconUrl),
      assetVersion: String(data?.assetVersion || DEFAULT_BRANDING.assetVersion),
    };
  } catch {
    return DEFAULT_BRANDING;
  }
}

export function useSiteBranding() {
  return useQuery<SiteBranding>({
    queryKey: ["/api/site-branding"],
    queryFn: fetchSiteBranding,
    staleTime: 60_000,
  });
}
