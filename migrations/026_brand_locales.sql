-- Migration 026: Multi-language / region tracking (Epic F)

CREATE TABLE IF NOT EXISTS brand_locales (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  locale varchar NOT NULL,
  language varchar NOT NULL,
  region varchar,
  label text,
  is_primary boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS brand_locales_brand_idx ON brand_locales (brand_id);
CREATE UNIQUE INDEX IF NOT EXISTS brand_locales_unique_idx ON brand_locales (brand_id, locale);
