-- Migration 0069: register drawer events for POS shift accountability.
--
-- Paid-in, paid-out, and no-sale actions now live as first-class shift audit
-- records instead of only being appended into closeout notes.

CREATE TABLE IF NOT EXISTS shift_drawer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  cashier_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name varchar(160) NOT NULL,
  action varchar(20) NOT NULL CHECK (action IN ('NO_SALE', 'PAID_IN', 'PAID_OUT')),
  amount numeric(12, 2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
  reason varchar(500) NOT NULL DEFAULT '',
  authorization_method varchar(20) NOT NULL,
  drawer_opened boolean NOT NULL DEFAULT false,
  drawer_error varchar(500),
  client_event_id varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shift_drawer_events_org_shift_created
  ON shift_drawer_events (org_id, shift_id, created_at);

CREATE INDEX IF NOT EXISTS idx_shift_drawer_events_org_location_created
  ON shift_drawer_events (org_id, location_id, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shift_drawer_events_org_client_event
  ON shift_drawer_events (org_id, client_event_id);
