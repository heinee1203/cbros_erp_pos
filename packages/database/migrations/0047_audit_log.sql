CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  details JSONB,
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(org_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_action ON audit_logs(org_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_user ON audit_logs(org_id, user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_entity ON audit_logs(org_id, entity_type, entity_id);
