-- Support brand setup, AXP, FAQ, schema, and job queue list reads.
CREATE INDEX IF NOT EXISTS jobs_brand_created_idx
  ON jobs(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS jobs_status_priority_created_idx
  ON jobs(status, priority DESC, created_at);

CREATE INDEX IF NOT EXISTS axp_pages_brand_created_idx
  ON axp_pages(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS axp_pages_brand_status_created_idx
  ON axp_pages(brand_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS faq_entries_brand_order_created_idx
  ON faq_entries(brand_id, display_order, created_at DESC);

CREATE INDEX IF NOT EXISTS faq_entries_page_order_idx
  ON faq_entries(axp_page_id, display_order);

CREATE INDEX IF NOT EXISTS schema_templates_brand_created_idx
  ON schema_templates(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS schema_templates_global_type_idx
  ON schema_templates(is_global, schema_type);
