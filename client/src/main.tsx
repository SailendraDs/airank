import { createRoot } from "react-dom/client";
import App from "./App";
import { initAmplitude } from "@/lib/amplitude";
import { fetchSiteBranding, withBrandingVersion } from "@/hooks/use-site-branding";
import "./index.css";

function enforceFavicon(href: string) {
  const ensure = (rel: string, nextHref: string) => {
    let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = rel;
      document.head.appendChild(link);
    }
    link.href = nextHref;
  };

  ensure("icon", href);
  ensure("apple-touch-icon", href);
}

void (async () => {
  const branding = await fetchSiteBranding();
  const faviconHref = withBrandingVersion(branding.faviconUrl, branding.assetVersion);
  enforceFavicon(faviconHref);
})();

void initAmplitude();

createRoot(document.getElementById("root")!).render(<App />);
