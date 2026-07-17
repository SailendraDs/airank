import { useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useCurrentBrand } from "@/hooks/use-brand";

const SESSION_KEY = "analytics_session_id";

function getSessionId(): string {
  let sessionId = sessionStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

interface TrackEventOptions {
  eventType: string;
  pagePath?: string;
  pageTitle?: string;
  elementId?: string;
  elementType?: string;
  elementText?: string;
  metadata?: Record<string, unknown>;
  duration?: number;
}

function sendTrackEvent(event: TrackEventOptions, brandId?: string) {
  const sessionId = getSessionId();
  const payload = {
    ...event,
    brandId: brandId || null,
    sessionId,
    referrer: document.referrer || null,
  };

  if (navigator.sendBeacon) {
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    navigator.sendBeacon("/api/analytics/track", blob);
  } else {
    fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  }
}

export function useAnalyticsTracker() {
  const [location] = useLocation();
  const { isAuthenticated } = useAuth();
  const { brand } = useCurrentBrand();
  const pageEntryTime = useRef<number>(Date.now());
  const lastTrackedPath = useRef<string>("");

  const trackEvent = useCallback(
    (options: Omit<TrackEventOptions, "pagePath"> & { pagePath?: string }) => {
      if (!isAuthenticated || location.startsWith("/admin")) return;
      sendTrackEvent(
        {
          ...options,
          pagePath: options.pagePath || location,
        },
        brand?.id
      );
    },
    [isAuthenticated, location, brand?.id]
  );

  useEffect(() => {
    if (!isAuthenticated || !location || location.startsWith("/admin")) return;
    if (lastTrackedPath.current === location) return;

    if (lastTrackedPath.current) {
      const duration = Math.round((Date.now() - pageEntryTime.current) / 1000);
      if (duration > 0 && duration < 3600) {
        sendTrackEvent(
          {
            eventType: "page_view_duration",
            pagePath: lastTrackedPath.current,
            duration,
          },
          brand?.id
        );
      }
    }

    lastTrackedPath.current = location;
    pageEntryTime.current = Date.now();

    sendTrackEvent(
      {
        eventType: "page_view",
        pagePath: location,
        pageTitle: document.title,
      },
      brand?.id
    );
  }, [location, isAuthenticated, brand?.id]);

  useEffect(() => {
    if (!isAuthenticated || location.startsWith("/admin")) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const interactable = target.closest("button, a, [data-testid], input[type='submit']");
      if (!interactable) return;

      const testId = interactable.getAttribute("data-testid");
      const tagName = interactable.tagName.toLowerCase();
      const text = (interactable as HTMLElement).innerText?.substring(0, 100) || "";

      sendTrackEvent(
        {
          eventType: "click",
          pagePath: location,
          elementId: testId || interactable.id || undefined,
          elementType: tagName,
          elementText: text || undefined,
        },
        brand?.id
      );
    };

    const handleSubmit = (e: Event) => {
      const form = e.target as HTMLFormElement;
      sendTrackEvent(
        {
          eventType: "form_submit",
          pagePath: location,
          elementId: form.id || form.getAttribute("data-testid") || undefined,
          elementType: "form",
        },
        brand?.id
      );
    };

    const handleBeforeUnload = () => {
      const duration = Math.round((Date.now() - pageEntryTime.current) / 1000);
      if (duration > 0 && duration < 3600) {
        sendTrackEvent(
          {
            eventType: "page_view_duration",
            pagePath: location,
            duration,
          },
          brand?.id
        );
      }
    };

    document.addEventListener("click", handleClick, { capture: true });
    document.addEventListener("submit", handleSubmit, { capture: true });
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("click", handleClick, { capture: true });
      document.removeEventListener("submit", handleSubmit, { capture: true });
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isAuthenticated, location, brand?.id]);

  return { trackEvent };
}
