-- Phase 11: Categories — master data for catalog organization
-- Replaces the hard-coded product_category enum with a manageable table.
-- Products still reference the enum; the `code` column maps 1:1 to enum values.

-- ── Table ──

CREATE TABLE IF NOT EXISTS "categories" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id"      uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name"        varchar(255) NOT NULL,
  "slug"        varchar(255) NOT NULL,
  "code"        varchar(100),
  "description" varchar(500),
  "color"       varchar(7),
  "sort_order"  integer NOT NULL DEFAULT 0,
  "is_active"   boolean NOT NULL DEFAULT true,
  "parent_id"   uuid REFERENCES "categories"("id") ON DELETE SET NULL,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now()
);

-- ── Indexes ──

CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_org_slug"
  ON "categories" ("org_id", "slug");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_categories_org_code"
  ON "categories" ("org_id", "code");

CREATE INDEX IF NOT EXISTS "idx_categories_org_id"
  ON "categories" ("org_id");

CREATE INDEX IF NOT EXISTS "idx_categories_parent_id"
  ON "categories" ("parent_id");

-- ── Seed default categories for every existing org ──

INSERT INTO "categories" ("org_id", "name", "slug", "code", "description", "color", "sort_order")
SELECT
  o.id,
  v.name,
  v.slug,
  v.code,
  v.description,
  v.color,
  v.sort_order
FROM "organizations" o
CROSS JOIN (
  VALUES
    ('Tires',           'tires',           'TIRES',           'Tires, wheels, and related mounting hardware',     '#2563EB', 1),
    ('Lubricants',      'lubricants',      'LUBRICANTS',      'Engine oils, transmission fluids, greases',         '#D97706', 2),
    ('Hard Parts',      'hard-parts',      'HARD_PARTS',      'Brakes, filters, belts, bearings, engine components', '#DC2626', 3),
    ('Accessories',     'accessories',     'ACCESSORIES',     'Interior, exterior, and electrical accessories',    '#7C3AED', 4),
    ('Labor & Services','labor-services',  'LABOR_SERVICES',  'Workshop labor charges and service fees',           '#059669', 5)
) AS v(name, slug, code, description, color, sort_order)
ON CONFLICT DO NOTHING;
