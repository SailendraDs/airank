-- Migration 025: Social citation tracking (Epic G)

CREATE TABLE IF NOT EXISTS social_citations (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id varchar NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform varchar NOT NULL,
  external_id varchar NOT NULL,
  title text,
  url text,
  author text,
  subreddit_or_channel text,
  snippet text,
  sentiment varchar,
  upvotes integer,
  comment_count integer,
  view_count integer,
  published_at timestamp,
  discovered_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_citations_brand_idx ON social_citations (brand_id);
CREATE INDEX IF NOT EXISTS social_citations_platform_idx ON social_citations (platform);
CREATE UNIQUE INDEX IF NOT EXISTS social_citations_dedupe_idx ON social_citations (brand_id, platform, external_id);
