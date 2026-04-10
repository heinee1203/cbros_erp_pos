-- Create price_field enum if it doesn't exist
DO $$ BEGIN
  CREATE TYPE price_field AS ENUM ('SELL_PRICE', 'COST_PRICE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Price change audit trail
CREATE TABLE IF NOT EXISTS price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  field price_field NOT NULL,
  old_value NUMERIC(12,2) NOT NULL,
  new_value NUMERIC(12,2) NOT NULL,
  change_reason VARCHAR(255),
  source VARCHAR(30) NOT NULL DEFAULT 'manual',
  batch_id UUID,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_changes_product_date ON price_changes(org_id, product_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_changes_date ON price_changes(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_changes_batch ON price_changes(org_id, batch_id) WHERE batch_id IS NOT NULL;
