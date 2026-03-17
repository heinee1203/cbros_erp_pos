# Add Brand as a Product Attribute — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Brand as a standalone lookup table with FK on products, full CRUD API, web management page, item list filter/column, and mobile sync.

**Architecture:** New `brands` table with org-scoped unique slugs. FK `brand_id` on products (nullable, ON DELETE SET NULL). New Fastify module for CRUD. Web page under Items/Catalog. Brand filter + column on item list.

**Tech Stack:** Drizzle ORM, Fastify 5, React/Next.js, TanStack Query, WatermelonDB (mobile)

---

### Task 1: Schema — brands table + products.brandId

**Files:**
- Create: `packages/database/src/schema/brands.ts`
- Modify: `packages/database/src/schema/products.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/migrations/0026_brands.sql`

**Step 1: Create brands.ts schema file**

```typescript
// packages/database/src/schema/brands.ts
import { pgTable, uuid, varchar, boolean, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const brands = pgTable(
  "brands",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_brands_org_slug").on(table.orgId, table.slug),
    index("idx_brands_org_id").on(table.orgId),
  ],
);
```

**Step 2: Add brandId to products.ts**

Import brands and add column + index:
```typescript
import { brands } from "./brands";

// Add after familyId (~line 61):
brandId: uuid("brand_id").references(() => brands.id, { onDelete: "set null" }),

// Add index in the table indexes array:
index("idx_products_brand_id").on(table.brandId),
```

**Step 3: Export brands from index.ts**

Add `export * from "./brands";` after the product-families line.

**Step 4: Create migration 0026_brands.sql**

```sql
CREATE TABLE IF NOT EXISTS brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_brands_org_slug ON brands (org_id, slug);
CREATE INDEX IF NOT EXISTS idx_brands_org_id ON brands (org_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_brand_id ON products (brand_id);

CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON brands FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();
```

**Step 5: Run migration**

```bash
pnpm db:migrate
```

---

### Task 2: Zod schemas for brands

**Files:**
- Modify: `packages/types/src/schemas.ts`

Add brand Zod schemas and update createProductSchema:

```typescript
export const createBrandSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/),
});

export const updateBrandSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  isActive: z.boolean().optional(),
});

export type CreateBrandInput = z.infer<typeof createBrandSchema>;
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;
```

Add `brandId` to `createProductSchema`:
```typescript
brandId: z.string().uuid().optional(),
```

---

### Task 3: API — Brand CRUD module

**Files:**
- Create: `apps/api/src/modules/brands/service.ts`
- Create: `apps/api/src/modules/brands/routes.ts`
- Modify: `apps/api/src/app.ts`

**service.ts** — Follow the pattern from `categories/service.ts`:
- `listBrands(orgId, search?)` — return `{ id, name, slug, isActive, productCount }` with product count subquery
- `createBrand(orgId, input)` — check slug uniqueness, insert
- `updateBrand(brandId, orgId, input)` — check slug uniqueness if changing
- `deleteBrand(brandId, orgId)` — only if product count = 0

**routes.ts** — Follow the pattern from `categories/routes.ts`:
- `GET /` — list brands
- `POST /` — create (ADMIN/MANAGER)
- `PATCH /:id` — update (ADMIN/MANAGER)
- `DELETE /:id` — delete (ADMIN/MANAGER)

**app.ts** — Register:
```typescript
import { brandRoutes } from "./modules/brands/routes";
await app.register(brandRoutes, { prefix: "/brands" });
```

---

### Task 4: Include brand in product APIs + sync

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts`
- Modify: `apps/api/src/modules/sync/service.ts`

**products/routes.ts:**
- Import `brands` from schema
- In flat GET /, add:
  - `leftJoin(brands, eq(products.brandId, brands.id))`
  - Select `brandId: products.brandId` and `brandName: brands.name`
  - Add `brandId` query param filter: `if (q.brandId) conditions.push(eq(products.brandId, q.brandId))`
- In grouped query (handleGroupedQuery):
  - Add `LEFT JOIN brands b ON p.brand_id = b.id` to both UNION parts
  - Add brand columns to select
  - Add `brandFilter` SQL fragment
  - Map brandId/brandName in response
- In POST / product creation: insert `brandId: parsed.data.brandId || null`
- In by-barcode: add brand join + select

**sync/service.ts:**
- Add `brandId: products.brandId` to getCatalogDelta select

---

### Task 5: Web — Brand management page + hook + sidebar

**Files:**
- Create: `apps/web/src/hooks/use-brands.ts`
- Create: `apps/web/src/app/inventory/brands/page.tsx`
- Modify: `apps/web/src/app/sidebar.tsx`

**use-brands.ts** — Follow pattern from `use-families.ts`:
- `useBrands(token, locationId)` — GET /brands
- `useCreateBrand(token, locationId)` — POST mutation
- `useUpdateBrand(token, locationId)` — PATCH mutation
- `useDeleteBrand(token, locationId)` — DELETE mutation

**brands/page.tsx** — Simple CRUD list page following the pattern of the categories page:
- Header: "Brands" + description + "Add Brand" button
- Stats bar: brand count, total items
- Search input
- Table: Brand name, item count, edit/delete actions
- Create/edit modal: name + auto-slug
- Delete: disabled if products > 0

**sidebar.tsx** — Add Brands entry after Families:
```typescript
{ label: "Brands", href: "/inventory/brands", match: /^\/inventory\/brands/ },
```

---

### Task 6: Web — Item list brand filter + column

**Files:**
- Modify: `apps/web/src/hooks/use-products.ts`
- Modify: `apps/web/src/app/inventory/page.tsx`

**use-products.ts:**
- Add `brandId` and `brandName` to ProductRow type
- Add `brandId` to filter params and queryKey

**inventory/page.tsx:**
- Add Brand column to table headers and rows
- Add brand filter dropdown
- In product detail drawer, show brand
- In handleGroupedQuery response mapping, include brand fields

---

### Task 7: Web — New item form brand dropdown

**Files:**
- Modify: `apps/web/src/app/inventory/new/page.tsx`

Add Brand dropdown after taxonomy fields (Family/Category/Sub-category):
- Fetch brands via `useBrands` hook
- Add `<select>` for brand with "No Brand" default option
- Include `brandId` in create product payload

---

### Task 8: Mobile — Sync brandId

**Files:**
- Modify: `apps/mobile/src/db/schema.ts` (bump version to 5)
- Modify: `apps/mobile/src/db/migrations.ts` (add migration to v5)
- Modify: `apps/mobile/src/db/models/Product.ts`
- Modify: `apps/mobile/src/sync/catalog-sync.ts`

**schema.ts:** Add `{ name: 'brand_id', type: 'string', isOptional: true }` to products, bump version to 5.

**migrations.ts:** Add v5 migration with addColumns for brand_id.

**Product.ts:** Add `@text('brand_id') brandId!: string | null;`

**catalog-sync.ts:** Add `brandId` to ServerProduct interface and sync mapping.

---

## Verification

1. Migration applies: brands table created, products.brand_id column added
2. API: POST /brands creates "NPR" → GET /brands returns it with product count 0
3. Web: Sidebar shows "Brands" under Items / Catalog
4. Web: Brands page lists all brands with CRUD
5. Web: Item list shows Brand column + filter dropdown
6. Web: New Item form has Brand dropdown
7. API: GET /sync/catalog includes brandId
8. Mobile: schema v5 with brand_id column
