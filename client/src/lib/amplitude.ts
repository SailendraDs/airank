const DEFAULT_AMPLITUDE_KEY = "ddbbe8c2912ada8183229f234f36f682";

function getAmplitudeKey(): string {
  const envKey = import.meta.env.VITE_AMPLITUDE_API_KEY as string | undefined;
  return (envKey && envKey.trim()) || DEFAULT_AMPLITUDE_KEY;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

function getAmplitude(): any {
  if (!isBrowser()) return null;
  return (window as any).amplitude || null;
}

function loadAmplitudeScript(apiKey: string): Promise<void> {
  if (!isBrowser()) return Promise.resolve();

  const existing = document.querySelector('script[data-amplitude-sdk="true"]') as HTMLScriptElement | null;
  if (existing) {
    if ((window as any).amplitude) return Promise.resolve();
    return new Promise((resolve) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => resolve(), { once: true });
    });
  }

  const script = document.createElement("script");
  script.src = `https://cdn.amplitude.com/script/${apiKey}.js`;
  script.async = true;
  script.defer = true;
  script.dataset.amplitudeSdk = "true";

  return new Promise((resolve) => {
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

let initialized = false;

export async function initAmplitude(): Promise<void> {
  if (initialized || !isBrowser()) return;

  const apiKey = getAmplitudeKey();
  await loadAmplitudeScript(apiKey);

  const amplitude = getAmplitude();
  if (!amplitude || typeof amplitude.init !== "function") return;

  try {
    if (amplitude.sessionReplay?.plugin) {
      amplitude.add(amplitude.sessionReplay.plugin({ sampleRate: 1 }));
    }

    amplitude.init(apiKey, {
      fetchRemoteConfig: true,
      autocapture: true,
    });

    initialized = true;
  } catch {
    // Keep analytics best-effort and never block app startup.
  }
}

export function amplitudeTrack(eventName: string, props?: Record<string, unknown>) {
  const amplitude = getAmplitude();
  if (!amplitude || typeof amplitude.track !== "function") return;

  try {
    if (props && Object.keys(props).length > 0) {
      amplitude.track(eventName, props);
      return;
    }
    amplitude.track(eventName);
  } catch {
    // noop
  }
}

export function amplitudeTrackPage(path: string) {
  amplitudeTrack("Page Viewed", { path });
}
