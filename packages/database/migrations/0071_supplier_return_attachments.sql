CREATE TABLE IF NOT EXISTS "supplier_return_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "supplier_return_id" uuid NOT NULL REFERENCES "supplier_returns"("id") ON DELETE cascade,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE cascade,
  "file_name" varchar(255) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "size_bytes" integer NOT NULL DEFAULT 0,
  "attachment_type" varchar(50) NOT NULL DEFAULT 'OTHER',
  "data_url" text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_sr_attachments_return"
  ON "supplier_return_attachments" ("supplier_return_id");

CREATE INDEX IF NOT EXISTS "idx_sr_attachments_org_created"
  ON "supplier_return_attachments" ("org_id", "created_at");
