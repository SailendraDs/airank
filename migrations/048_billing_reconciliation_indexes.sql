-- Speed up billing reconciliation and payment status/refund lookups.

CREATE INDEX IF NOT EXISTS invoices_brand_created_idx
  ON invoices(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS invoices_brand_razorpay_payment_idx
  ON invoices(brand_id, razorpay_payment_id);

CREATE INDEX IF NOT EXISTS payments_brand_created_idx
  ON payments(brand_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_invoice_created_idx
  ON payments(invoice_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payments_razorpay_payment_idx
  ON payments(razorpay_payment_id);
