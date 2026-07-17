-- Speed up admin invoice pagination ordered by newest invoice across all brands.
CREATE INDEX IF NOT EXISTS invoices_created_idx
  ON invoices(created_at DESC);
