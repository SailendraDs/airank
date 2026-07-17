-- Support admin dashboard aggregate reads without loading every brand/API log row.
CREATE INDEX IF NOT EXISTS brands_tier_idx
  ON brands(tier);

CREATE INDEX IF NOT EXISTS brands_created_idx
  ON brands(created_at DESC);
