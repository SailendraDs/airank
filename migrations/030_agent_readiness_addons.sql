-- Agent Readiness + Add-on Offers (Phase 1-3)

ALTER TABLE brands ADD COLUMN IF NOT EXISTS business_channel text DEFAULT 'website';

ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS agent_readiness_full_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE plan_capabilities ADD COLUMN IF NOT EXISTS agent_readiness_partial_enabled boolean NOT NULL DEFAULT false;

UPDATE plan_capabilities SET agent_readiness_partial_enabled = true WHERE id = 'starter';
UPDATE plan_capabilities SET agent_readiness_full_enabled = true WHERE id IN ('growth', 'enterprise');

CREATE TABLE IF NOT EXISTS agent_readiness_reports (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  domain text NOT NULL,
  scan_type text NOT NULL DEFAULT 'teaser',
  score integer NOT NULL DEFAULT 0,
  grade text,
  checks jsonb NOT NULL DEFAULT '[]',
  top_issues jsonb NOT NULL DEFAULT '[]',
  full_report jsonb,
  status text NOT NULL DEFAULT 'completed',
  credits_used integer NOT NULL DEFAULT 0,
  error_message text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_readiness_brand_idx ON agent_readiness_reports(brand_id);
CREATE INDEX IF NOT EXISTS agent_readiness_brand_scan_idx ON agent_readiness_reports(brand_id, scan_type);

CREATE TABLE IF NOT EXISTS addon_offers (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar NOT NULL UNIQUE,
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'implementation',
  price_inr integer NOT NULL DEFAULT 0,
  visibility text NOT NULL DEFAULT 'all',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS addon_offer_brands (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id varchar NOT NULL REFERENCES addon_offers(id) ON DELETE CASCADE,
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  price_override_inr integer,
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addon_offer_brands_offer_idx ON addon_offer_brands(offer_id);
CREATE INDEX IF NOT EXISTS addon_offer_brands_brand_idx ON addon_offer_brands(brand_id);

CREATE TABLE IF NOT EXISTS addon_purchases (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_id varchar NOT NULL REFERENCES addon_offers(id) ON DELETE RESTRICT,
  amount_inr integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  razorpay_order_id varchar,
  razorpay_payment_id varchar,
  metadata jsonb,
  paid_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS addon_purchases_brand_idx ON addon_purchases(brand_id);
CREATE INDEX IF NOT EXISTS addon_purchases_offer_idx ON addon_purchases(offer_id);

INSERT INTO addon_offers (slug, title, description, category, price_inr, visibility, sort_order)
VALUES
  ('agent-readiness-implementation', 'Agent Readiness Implementation', 'We implement llms.txt, JSON-LD, and agent discovery fixes on your site.', 'implementation', 15000, 'all', 1),
  ('product-schema-setup', 'Product Schema Setup', 'Product + Offer + Review schema for Shopify/D2C storefronts.', 'implementation', 12000, 'all', 2),
  ('llms-txt-audit', 'llms.txt + MCP Discovery Audit', 'Full audit and handoff document for your dev team.', 'audit', 5000, 'all', 3)
ON CONFLICT (slug) DO NOTHING;
