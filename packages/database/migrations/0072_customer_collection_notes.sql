CREATE TABLE IF NOT EXISTS customer_collection_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  note_type VARCHAR(40) NOT NULL DEFAULT 'NOTE',
  note TEXT NOT NULL,
  promise_to_pay_date DATE,
  follow_up_at TIMESTAMPTZ,
  assigned_to_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_collection_notes_org_customer
  ON customer_collection_notes(org_id, customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_customer_collection_notes_org_followup
  ON customer_collection_notes(org_id, follow_up_at);

CREATE INDEX IF NOT EXISTS idx_customer_collection_notes_org_open
  ON customer_collection_notes(org_id, resolved_at);
