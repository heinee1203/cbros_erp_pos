-- Phase 8: Service Performance & Business Intelligence
-- Migration: job_card_state_log table for event-sourced state transition tracking

-- ── Job Card State Log ──
-- Immutable ledger of every status transition.
-- Powers cycle time analysis, technician efficiency, and workshop flow KPIs.

CREATE TABLE job_card_state_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  job_card_id     UUID NOT NULL REFERENCES job_cards(id) ON DELETE CASCADE,
  from_status     job_card_status,          -- NULL for initial creation (SCHEDULED)
  to_status       job_card_status NOT NULL,
  transitioned_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  notes           VARCHAR(500),
  transitioned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  -- No updated_at: immutable ledger
);

-- Indexes
CREATE INDEX idx_jcsl_job_card ON job_card_state_log (job_card_id);
CREATE INDEX idx_jcsl_org_status ON job_card_state_log (org_id, to_status);
CREATE INDEX idx_jcsl_transitioned_at ON job_card_state_log (transitioned_at);
CREATE INDEX idx_jcsl_user ON job_card_state_log (transitioned_by_user_id);
