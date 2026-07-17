// CMS publishing integrations (Epic D).
// Publishes agent-generated content to WordPress, Webflow, or Shopify using
// per-brand stored connection credentials. Each publisher returns a normalized
// PublishResult. Network/credential errors surface as { ok: false, error }.

export type CmsPlatform = 'wordpress' | 'webflow' | 'shopify';

export interface PublishInput {
  title: string;
  html: string;
  status?: 'draft' | 'publish';
  excerpt?: string;
}

export interface PublishResult {
  ok: boolean;
  url?: string;
  externalId?: string;
  error?: string;
}

// WordPress REST API: requires { baseUrl, username, appPassword }.
async function publishWordPress(config: any, input: PublishInput): Promise<PublishResult> {
  try {
    const baseUrl = String(config.baseUrl || '').replace(/\/$/, '');
    if (!baseUrl || !config.username || !config.appPassword) {
      return { ok: false, error: 'WordPress connection requires baseUrl, username, appPassword' };
    }
    const auth = Buffer.from(`${config.username}:${config.appPassword}`).toString('base64');
    const res = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        title: input.title,
        content: input.html,
        excerpt: input.excerpt,
        status: input.status === 'publish' ? 'publish' : 'draft',
      }),
    });
    if (!res.ok) return { ok: false, error: `WordPress error ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const data = await res.json();
    return { ok: true, url: data.link, externalId: String(data.id) };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Webflow CMS API v2: requires { token, collectionId }.
async function publishWebflow(config: any, input: PublishInput): Promise<PublishResult> {
  try {
    if (!config.token || !config.collectionId) {
      return { ok: false, error: 'Webflow connection requires token, collectionId' };
    }
    const res = await fetch(`https://api.webflow.com/v2/collections/${config.collectionId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({
        isArchived: false,
        isDraft: input.status !== 'publish',
        fieldData: {
          name: input.title,
          slug: input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80),
          'post-body': input.html,
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `Webflow error ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const data = await res.json();
    return { ok: true, externalId: data?.id };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// Shopify Admin API: requires { shop, accessToken } — publishes as a blog article or page.
async function publishShopify(config: any, input: PublishInput): Promise<PublishResult> {
  try {
    if (!config.shop || !config.accessToken) {
      return { ok: false, error: 'Shopify connection requires shop, accessToken' };
    }
    const shop = String(config.shop).replace(/^https?:\/\//, '').replace(/\/$/, '');
    const apiVersion = config.apiVersion || '2024-07';
    const res = await fetch(`https://${shop}/admin/api/${apiVersion}/pages.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': config.accessToken },
      body: JSON.stringify({ page: { title: input.title, body_html: input.html, published: input.status === 'publish' } }),
    });
    if (!res.ok) return { ok: false, error: `Shopify error ${res.status}: ${(await res.text()).slice(0, 300)}` };
    const data = await res.json();
    return { ok: true, externalId: String(data?.page?.id), url: data?.page?.handle ? `https://${shop}/pages/${data.page.handle}` : undefined };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

export async function publishToCms(platform: CmsPlatform, config: any, input: PublishInput): Promise<PublishResult> {
  switch (platform) {
    case 'wordpress': return publishWordPress(config, input);
    case 'webflow': return publishWebflow(config, input);
    case 'shopify': return publishShopify(config, input);
    default: return { ok: false, error: `Unsupported CMS platform: ${platform}` };
  }
}
