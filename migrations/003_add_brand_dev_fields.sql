-- Add Brand.dev enrichment fields to brands table
ALTER TABLE brands ADD COLUMN IF NOT EXISTS subindustry TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS slogan TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE brands ADD COLUMN IF NOT EXISTS brand_dev_data JSONB;

-- Add Brand.dev enrichment fields to competitors table
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS subindustry TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE competitors ADD COLUMN IF NOT EXISTS brand_dev_data JSONB;

