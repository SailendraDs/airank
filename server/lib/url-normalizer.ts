/**
 * Normalize a URL for deduplication purposes.
 * Lowercases, strips trailing slash, removes query string and fragment.
 *
 * Examples:
 *   https://Example.com/page/?utm_source=foo#section  →  https://example.com/page
 *   https://site.com/article/                         →  https://site.com/article
 */
export function normalizeUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    // Lowercase only the hostname — path casing is significant on most servers
    url.hostname = url.hostname.toLowerCase();
    url.search = '';
    url.hash = '';
    let normalized = url.toString();
    // Remove trailing slash
    if (normalized.endsWith('/') && normalized !== `${url.protocol}//${url.host}/`) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null; // Malformed URL — skip dedup constraint
  }
}
