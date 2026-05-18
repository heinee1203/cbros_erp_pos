-- Migration 0070: saved Import Center profiles.
--
-- Profiles let an organization reuse safe item-import settings without changing
-- the existing preview or execute contracts.

CREATE TABLE IF NOT EXISTS import_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name varchar(120) NOT NULL,
  import_type varchar(40) NOT NULL DEFAULT 'items',
  import_mode varchar(40) NOT NULL CHECK (import_mode IN ('smart_sync', 'create_only', 'update_only', 'inventory_sync')),
  location_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  category_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  include_creates boolean NOT NULL DEFAULT true,
  include_updates boolean NOT NULL DEFAULT true,
  include_no_change boolean NOT NULL DEFAULT false,
  create_new_categories boolean NOT NULL DEFAULT true,
  field_lock_policy_version varchar(80) NOT NULL DEFAULT 'item-import-field-scope-v1',
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_import_profiles_org_name
  ON import_profiles (org_id, name);

CREATE INDEX IF NOT EXISTS idx_import_profiles_org_type
  ON import_profiles (org_id, import_type);
