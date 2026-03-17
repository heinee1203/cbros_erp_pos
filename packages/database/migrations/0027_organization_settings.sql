CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) UNIQUE,
  legal_name TEXT,
  tin TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  logo_url TEXT,
  invoice_terms TEXT,
  invoice_footer TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_settings_org_id ON organization_settings (org_id);

CREATE TRIGGER trg_organization_settings_updated_at
  BEFORE UPDATE ON organization_settings FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();
