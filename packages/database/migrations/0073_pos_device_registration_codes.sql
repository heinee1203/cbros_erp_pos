DO $$
BEGIN
  CREATE TYPE device_registration_code_status AS ENUM ('ACTIVE', 'USED', 'EXPIRED', 'REVOKED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS pos_device_registration_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  code_hash varchar(128) NOT NULL,
  status device_registration_code_status NOT NULL DEFAULT 'ACTIVE',
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamp with time zone,
  used_by_device_id varchar(100),
  used_by_pos_device_id uuid REFERENCES pos_devices(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_device_reg_codes_org_hash
  ON pos_device_registration_codes(org_id, code_hash);

CREATE INDEX IF NOT EXISTS idx_pos_device_reg_codes_org_status
  ON pos_device_registration_codes(org_id, status);

CREATE INDEX IF NOT EXISTS idx_pos_device_reg_codes_org_location
  ON pos_device_registration_codes(org_id, location_id);
