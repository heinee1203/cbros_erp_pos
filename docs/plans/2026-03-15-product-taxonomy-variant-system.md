# Product Taxonomy & Variant System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a 3-tier product taxonomy (Family → Category → Sub-category) and a per-product variant system where each variant combination is a separate SKU with its own inventory.

**Architecture:** The taxonomy extends existing schema — `product_families` (tier 1), `categories` with `family_id` FK (tier 2), new `product_subcategories` table (tier 3). The variant system adds `parent_product_id` and `is_parent` columns to products, plus 3 new tables for option types/values/links. Each variant is a full product row with its own SKU and inventory. Server-side API handles all CRUD; web UI provides hierarchy management and variant generation.

**Tech Stack:** Drizzle ORM (Postgres 16), Fastify 5, React (Next.js 15), TanStack Query, WatermelonDB (mobile), Zod validation

**Existing Context:**
- Categories already have `parent_id` (self-referencing) used for 2-tier hierarchy
- Products already have `category_id` FK → categories and `family_id` FK → product_families
- Next migration number: `0026`
- Schema barrel export: `packages/database/src/schema/index.ts`
- API registration: `apps/api/src/app.ts`
- Role guard pattern: `const MANAGE_ROLES = ["ADMIN", "MANAGER"]`
- Multi-tenant: every query filtered by `org_id`

---

## Phase 1: Taxonomy — Schema & Migration

### Task 1: Add `family_id` to categories schema

**Files:**
- Modify: `packages/database/src/schema/categories.ts`

**Step 1: Add the column and index**

Add import for `productFamilies` and the `family_id` column + index:

```typescript
// At top, add import:
import { productFamilies } from "./product-families";

// In the table columns, after parentId:
familyId: uuid("family_id").references(() => productFamilies.id, { onDelete: "set null" }),

// In the indexes array, add:
index("idx_categories_family_id").on(table.familyId),
```

**Step 2: Verify TypeScript compiles**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && npx tsc --noEmit -p packages/database/tsconfig.json`
Expected: No errors

---

### Task 2: Create `product_subcategories` schema

**Files:**
- Create: `packages/database/src/schema/product-subcategories.ts`
- Modify: `packages/database/src/schema/index.ts`

**Step 1: Create the schema file**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { categories } from "./categories";

export const productSubcategories = pgTable(
  "product_subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_subcategories_org_cat_slug").on(
      table.orgId,
      table.categoryId,
      table.slug,
    ),
    index("idx_subcategories_org_category").on(table.orgId, table.categoryId),
  ],
);
```

**Step 2: Add barrel export**

In `packages/database/src/schema/index.ts`, add before the last line:
```typescript
export * from "./product-subcategories";
```

**Step 3: Verify TypeScript compiles**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && npx tsc --noEmit -p packages/database/tsconfig.json`

---

### Task 3: Add `subcategory_id` to products schema

**Files:**
- Modify: `packages/database/src/schema/products.ts`

**Step 1: Add column and index**

```typescript
// Add import at top:
import { productSubcategories } from "./product-subcategories";

// Add column after categoryId:
subcategoryId: uuid("subcategory_id").references(() => productSubcategories.id, { onDelete: "set null" }),

// Add index in the indexes array:
index("idx_products_subcategory_id").on(table.subcategoryId),
```

**Step 2: Verify TypeScript compiles**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && npx tsc --noEmit -p packages/database/tsconfig.json`

---

### Task 4: Add variant columns to products schema

**Files:**
- Modify: `packages/database/src/schema/products.ts`

**Step 1: Add parent/variant columns and indexes**

```typescript
// Add columns after subcategoryId:
parentProductId: uuid("parent_product_id").references((): any => products.id, { onDelete: "cascade" }),
isParent: boolean("is_parent").notNull().default(false),

// Add indexes:
index("idx_products_parent_id").on(table.parentProductId),
```

Note: The self-reference `(): any => products.id` is needed because Drizzle can't resolve circular references without the `any` cast.

**Step 2: Verify TypeScript compiles**

---

### Task 5: Create product options schema

**Files:**
- Create: `packages/database/src/schema/product-options.ts`
- Modify: `packages/database/src/schema/index.ts`

**Step 1: Create the schema file**

```typescript
import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { productOptionValues } from "./product-options"; // self-ref below

export const productOptionTypes = pgTable(
  "product_option_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 100 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_option_types_product_name").on(
      table.orgId,
      table.productId,
      table.name,
    ),
    index("idx_option_types_product_id").on(table.productId),
  ],
);

export const productOptionValues = pgTable(
  "product_option_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    optionTypeId: uuid("option_type_id")
      .notNull()
      .references(() => productOptionTypes.id, { onDelete: "cascade" }),
    value: varchar("value", { length: 255 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_option_values_type_value").on(table.optionTypeId, table.value),
    index("idx_option_values_type_id").on(table.optionTypeId),
  ],
);

export const productVariantOptions = pgTable(
  "product_variant_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    optionValueId: uuid("option_value_id")
      .notNull()
      .references(() => productOptionValues.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_variant_options_product_value").on(
      table.productId,
      table.optionValueId,
    ),
    index("idx_variant_options_product_id").on(table.productId),
    index("idx_variant_options_value_id").on(table.optionValueId),
  ],
);
```

**Important:** Remove the self-referencing import. `productOptionValues` is defined in the same file — the `references(() => productOptionTypes.id)` just works because it's a lazy reference.

**Step 2: Add barrel export**

In `packages/database/src/schema/index.ts`:
```typescript
export * from "./product-options";
```

**Step 3: Verify TypeScript compiles**

---

### Task 6: Create migration 0026

**Files:**
- Create: `packages/database/migrations/0026_taxonomy_and_variants.sql`

**Step 1: Write the migration**

```sql
-- ═══════════════════════════════════════════════
-- Phase 1: Taxonomy
-- ═══════════════════════════════════════════════

-- Add family_id to categories
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS family_id UUID REFERENCES product_families(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_categories_family_id ON categories (family_id);

-- Create subcategories table
CREATE TABLE IF NOT EXISTS product_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategories_org_cat_slug
  ON product_subcategories (org_id, category_id, slug);
CREATE INDEX IF NOT EXISTS idx_subcategories_org_category
  ON product_subcategories (org_id, category_id);

-- Add subcategory_id to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES product_subcategories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_subcategory_id ON products (subcategory_id);

-- ═══════════════════════════════════════════════
-- Phase 2: Variant Foundation
-- ═══════════════════════════════════════════════

-- Add parent/variant columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS parent_product_id UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_parent BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_products_parent_id ON products (parent_product_id);
CREATE INDEX IF NOT EXISTS idx_products_is_parent ON products (is_parent) WHERE is_parent = true;

-- Option types (per parent product)
CREATE TABLE IF NOT EXISTS product_option_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_option_types_product_name
  ON product_option_types (org_id, product_id, name);
CREATE INDEX IF NOT EXISTS idx_option_types_product_id
  ON product_option_types (product_id);

-- Option values
CREATE TABLE IF NOT EXISTS product_option_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_type_id UUID NOT NULL REFERENCES product_option_types(id) ON DELETE CASCADE,
  value VARCHAR(255) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_option_values_type_value
  ON product_option_values (option_type_id, value);
CREATE INDEX IF NOT EXISTS idx_option_values_type_id
  ON product_option_values (option_type_id);

-- Variant-to-value link
CREATE TABLE IF NOT EXISTS product_variant_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_value_id UUID NOT NULL REFERENCES product_option_values(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_options_product_value
  ON product_variant_options (product_id, option_value_id);
CREATE INDEX IF NOT EXISTS idx_variant_options_product_id
  ON product_variant_options (product_id);
CREATE INDEX IF NOT EXISTS idx_variant_options_value_id
  ON product_variant_options (option_value_id);

-- Apply updated_at trigger to new tables
CREATE TRIGGER trg_product_subcategories_updated_at
  BEFORE UPDATE ON product_subcategories
  FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();
```

**Step 2: Run migration**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm db:migrate`
Expected: Migration applies cleanly, no errors.

**Step 3: Verify tables exist**

Run: `docker exec apex-postgres psql -U apex -d apex_dev -c "\dt product_*"`
Expected: Tables `product_subcategories`, `product_option_types`, `product_option_values`, `product_variant_options` listed.

Run: `docker exec apex-postgres psql -U apex -d apex_dev -c "\d products" | grep -E "parent_product_id|is_parent|subcategory_id"`
Expected: All three columns visible.

**Step 4: Commit**

```bash
git add packages/database/src/schema/ packages/database/migrations/0026_taxonomy_and_variants.sql
git commit -m "feat(db): add taxonomy (subcategories) and variant system schema

- Add family_id to categories for Family→Category linking
- Create product_subcategories table (Category→Sub-category)
- Add subcategory_id to products
- Add parent_product_id and is_parent to products for variants
- Create product_option_types, product_option_values, product_variant_options tables
- Migration 0026 with all DDL and indexes"
```

---

## Phase 2: Variant Foundation — API

### Task 7: Add Zod schemas for subcategories, options, and variants

**Files:**
- Modify: `packages/types/src/schemas.ts`

**Step 1: Add schemas after the existing category schemas (~line 613)**

```typescript
// ══════════════════════════════════════════════
// Sub-categories
// ══════════════════════════════════════════════

export const createSubcategorySchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});
export type CreateSubcategoryInput = z.infer<typeof createSubcategorySchema>;

export const updateSubcategorySchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: z.string().min(1).max(255).regex(/^[a-z0-9-]+$/).optional(),
  categoryId: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateSubcategoryInput = z.infer<typeof updateSubcategorySchema>;

// ══════════════════════════════════════════════
// Product Option Types & Variants
// ══════════════════════════════════════════════

export const createOptionTypeSchema = z.object({
  name: z.string().min(1).max(100),
  values: z.array(z.string().min(1).max(255)).min(1, "At least one value required"),
});
export type CreateOptionTypeInput = z.infer<typeof createOptionTypeSchema>;

export const updateOptionTypeSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});
export type UpdateOptionTypeInput = z.infer<typeof updateOptionTypeSchema>;

export const createVariantSchema = z.object({
  sku: z.string().min(1).max(50),
  mnemonicSku: z.string().length(10).regex(/^[A-Z]{10}$/).optional(),
  unitPrice: z.string().default("0.00"),
  costPrice: z.string().default("0.00"),
  barcode: z.string().max(50).optional(),
  isVariablePrice: z.boolean().default(false),
  optionValueIds: z.array(z.string().uuid()).min(1, "At least one option value required"),
});
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const createVariantBatchSchema = z.object({
  variants: z.array(createVariantSchema).min(1).max(500),
});
export type CreateVariantBatchInput = z.infer<typeof createVariantBatchSchema>;
```

**Step 2: Verify compile**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && npx tsc --noEmit -p packages/types/tsconfig.json`

**Step 3: Commit**

```bash
git add packages/types/src/schemas.ts
git commit -m "feat(types): add Zod schemas for subcategories, option types, and variants"
```

---

### Task 8: Subcategory CRUD API

**Files:**
- Create: `apps/api/src/modules/subcategories/service.ts`
- Create: `apps/api/src/modules/subcategories/routes.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Create service**

File: `apps/api/src/modules/subcategories/service.ts`

```typescript
import { db } from "@apex/database";
import { productSubcategories, products } from "@apex/database/schema";
import { eq, and, sql, type SQL } from "drizzle-orm";
import type { CreateSubcategoryInput, UpdateSubcategoryInput } from "@apex/types";

export interface SubcategoryRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export async function listSubcategories(opts: {
  orgId: string;
  categoryId?: string;
}): Promise<SubcategoryRow[]> {
  const conditions: SQL[] = [eq(productSubcategories.orgId, opts.orgId)];
  if (opts.categoryId) {
    conditions.push(eq(productSubcategories.categoryId, opts.categoryId));
  }

  const rows = await db
    .select({
      id: productSubcategories.id,
      categoryId: productSubcategories.categoryId,
      name: productSubcategories.name,
      slug: productSubcategories.slug,
      sortOrder: productSubcategories.sortOrder,
      isActive: productSubcategories.isActive,
      createdAt: productSubcategories.createdAt,
      updatedAt: productSubcategories.updatedAt,
      productCount: sql<number>`COALESCE(
        (SELECT COUNT(*)::int FROM ${products}
         WHERE ${products.subcategoryId} = ${productSubcategories.id}),
        0
      )`,
    })
    .from(productSubcategories)
    .where(and(...conditions))
    .orderBy(productSubcategories.sortOrder, productSubcategories.name);

  return rows.map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

export async function createSubcategory(
  input: CreateSubcategoryInput,
  orgId: string,
): Promise<SubcategoryRow> {
  // Check slug uniqueness within org + category
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(
      and(
        eq(productSubcategories.orgId, orgId),
        eq(productSubcategories.categoryId, input.categoryId),
        eq(productSubcategories.slug, input.slug),
      ),
    );

  if (existing.length > 0) {
    throw new Error(`Subcategory with slug "${input.slug}" already exists in this category`);
  }

  const [row] = await db
    .insert(productSubcategories)
    .values({
      orgId,
      categoryId: input.categoryId,
      name: input.name,
      slug: input.slug,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
    })
    .returning();

  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    slug: row.slug,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: 0,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function updateSubcategory(
  id: string,
  input: UpdateSubcategoryInput,
  orgId: string,
): Promise<SubcategoryRow> {
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Subcategory not found");
  }

  if (input.slug) {
    const slugTaken = await db
      .select({ id: productSubcategories.id })
      .from(productSubcategories)
      .where(
        and(
          eq(productSubcategories.orgId, orgId),
          eq(productSubcategories.slug, input.slug),
          sql`${productSubcategories.id} != ${id}`,
        ),
      );
    if (slugTaken.length > 0) {
      throw new Error(`Subcategory with slug "${input.slug}" already exists`);
    }
  }

  const updateValues: Record<string, unknown> = {};
  if (input.name !== undefined) updateValues.name = input.name;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.categoryId !== undefined) updateValues.categoryId = input.categoryId;
  if (input.sortOrder !== undefined) updateValues.sortOrder = input.sortOrder;
  if (input.isActive !== undefined) updateValues.isActive = input.isActive;

  if (Object.keys(updateValues).length === 0) {
    throw new Error("No fields to update");
  }

  await db
    .update(productSubcategories)
    .set(updateValues)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  const rows = await listSubcategories({ orgId, categoryId: undefined });
  const updated = rows.find((r) => r.id === id);
  if (!updated) throw new Error("Subcategory not found after update");
  return updated;
}

export async function deleteSubcategory(id: string, orgId: string): Promise<void> {
  const existing = await db
    .select({ id: productSubcategories.id })
    .from(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Subcategory not found");
  }

  // Check for assigned products
  const productCount = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(products)
    .where(eq(products.subcategoryId, id));

  if (Number(productCount[0].count) > 0) {
    throw new Error(
      `Cannot delete subcategory with ${productCount[0].count} items assigned. Reassign items first.`,
    );
  }

  await db
    .delete(productSubcategories)
    .where(and(eq(productSubcategories.id, id), eq(productSubcategories.orgId, orgId)));
}
```

**Step 2: Create routes**

File: `apps/api/src/modules/subcategories/routes.ts`

```typescript
import type { FastifyPluginAsync } from "fastify";
import { createSubcategorySchema, updateSubcategorySchema } from "@apex/types";
import {
  listSubcategories,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const subcategoryRoutes: FastifyPluginAsync = async (app) => {
  // GET /subcategories?categoryId=XXX
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;
    const rows = await listSubcategories({ orgId, categoryId: q.categoryId });
    return reply.send({ data: rows });
  });

  // POST /subcategories
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create subcategories" });
    }

    const parsed = createSubcategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const row = await createSubcategory(parsed.data, orgId);
      return reply.status(201).send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /subcategories/:id
  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can update subcategories" });
    }

    const parsed = updateSubcategorySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const row = await updateSubcategory(request.params.id, parsed.data, orgId);
      return reply.send(row);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /subcategories/:id
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can delete subcategories" });
    }

    const { orgId } = request.storeContext!;
    try {
      await deleteSubcategory(request.params.id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
```

**Step 3: Register in app.ts**

In `apps/api/src/app.ts`:
- Add import: `import { subcategoryRoutes } from "./modules/subcategories/routes";`
- Add registration after categoryRoutes: `await app.register(subcategoryRoutes, { prefix: "/subcategories" });`

**Step 4: Verify API starts**

Run: `cd /c/Users/Admin/Downloads/CLAUDE/APEX_POS && pnpm dev`
Expected: Server starts without errors on port 3000.

**Step 5: Commit**

```bash
git add apps/api/src/modules/subcategories/ apps/api/src/app.ts
git commit -m "feat(api): subcategory CRUD endpoints

- GET /subcategories?categoryId=XXX — list with product counts
- POST /subcategories — create (ADMIN/MANAGER)
- PATCH /subcategories/:id — update
- DELETE /subcategories/:id — delete if no products assigned"
```

---

### Task 9: Product Options CRUD API

**Files:**
- Create: `apps/api/src/modules/product-options/service.ts`
- Create: `apps/api/src/modules/product-options/routes.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Create service**

File: `apps/api/src/modules/product-options/service.ts`

```typescript
import { db } from "@apex/database";
import {
  productOptionTypes,
  productOptionValues,
  productVariantOptions,
  products,
} from "@apex/database/schema";
import { eq, and, sql } from "drizzle-orm";

export interface OptionValueRow {
  id: string;
  value: string;
  sortOrder: number;
}

export interface OptionTypeRow {
  id: string;
  name: string;
  sortOrder: number;
  values: OptionValueRow[];
}

export async function listOptionTypes(
  productId: string,
  orgId: string,
): Promise<OptionTypeRow[]> {
  const types = await db
    .select({
      id: productOptionTypes.id,
      name: productOptionTypes.name,
      sortOrder: productOptionTypes.sortOrder,
    })
    .from(productOptionTypes)
    .where(
      and(
        eq(productOptionTypes.productId, productId),
        eq(productOptionTypes.orgId, orgId),
      ),
    )
    .orderBy(productOptionTypes.sortOrder);

  const result: OptionTypeRow[] = [];
  for (const type of types) {
    const values = await db
      .select({
        id: productOptionValues.id,
        value: productOptionValues.value,
        sortOrder: productOptionValues.sortOrder,
      })
      .from(productOptionValues)
      .where(eq(productOptionValues.optionTypeId, type.id))
      .orderBy(productOptionValues.sortOrder);

    result.push({ ...type, values });
  }

  return result;
}

export async function createOptionType(
  productId: string,
  orgId: string,
  name: string,
  values: string[],
): Promise<OptionTypeRow> {
  // Verify product exists and is_parent
  const [product] = await db
    .select({ id: products.id, isParent: products.isParent })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.orgId, orgId)));

  if (!product) throw new Error("Product not found");
  if (!product.isParent) {
    // Auto-promote to parent
    await db
      .update(products)
      .set({ isParent: true })
      .where(eq(products.id, productId));
  }

  // Get next sort order
  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${productOptionTypes.sortOrder}), -1)` })
    .from(productOptionTypes)
    .where(eq(productOptionTypes.productId, productId));

  const [type] = await db
    .insert(productOptionTypes)
    .values({
      orgId,
      productId,
      name,
      sortOrder: (maxSort?.max ?? -1) + 1,
    })
    .returning();

  // Insert values
  const valueRows: OptionValueRow[] = [];
  for (let i = 0; i < values.length; i++) {
    const [val] = await db
      .insert(productOptionValues)
      .values({
        optionTypeId: type.id,
        value: values[i],
        sortOrder: i,
      })
      .returning();
    valueRows.push({ id: val.id, value: val.value, sortOrder: val.sortOrder });
  }

  return { id: type.id, name: type.name, sortOrder: type.sortOrder, values: valueRows };
}

export async function updateOptionType(
  typeId: string,
  orgId: string,
  name: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!existing) throw new Error("Option type not found");

  await db
    .update(productOptionTypes)
    .set({ name })
    .where(eq(productOptionTypes.id, typeId));
}

export async function deleteOptionType(typeId: string, orgId: string): Promise<void> {
  const [existing] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!existing) throw new Error("Option type not found");

  // Cascade: deleting the type deletes values (FK cascade), which deletes variant links (FK cascade)
  await db.delete(productOptionTypes).where(eq(productOptionTypes.id, typeId));
}

export async function addOptionValue(
  typeId: string,
  orgId: string,
  value: string,
): Promise<OptionValueRow> {
  // Verify type belongs to org
  const [type] = await db
    .select({ id: productOptionTypes.id })
    .from(productOptionTypes)
    .where(and(eq(productOptionTypes.id, typeId), eq(productOptionTypes.orgId, orgId)));

  if (!type) throw new Error("Option type not found");

  const [maxSort] = await db
    .select({ max: sql<number>`COALESCE(MAX(${productOptionValues.sortOrder}), -1)` })
    .from(productOptionValues)
    .where(eq(productOptionValues.optionTypeId, typeId));

  const [val] = await db
    .insert(productOptionValues)
    .values({
      optionTypeId: typeId,
      value,
      sortOrder: (maxSort?.max ?? -1) + 1,
    })
    .returning();

  return { id: val.id, value: val.value, sortOrder: val.sortOrder };
}

export async function updateOptionValue(
  valueId: string,
  orgId: string,
  value: string,
): Promise<void> {
  // Verify value belongs to an option type owned by this org
  const rows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
    .where(and(eq(productOptionValues.id, valueId), eq(productOptionTypes.orgId, orgId)));

  if (rows.length === 0) throw new Error("Option value not found");

  await db
    .update(productOptionValues)
    .set({ value })
    .where(eq(productOptionValues.id, valueId));
}

export async function deleteOptionValue(valueId: string, orgId: string): Promise<void> {
  // Verify ownership
  const rows = await db
    .select({ id: productOptionValues.id })
    .from(productOptionValues)
    .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
    .where(and(eq(productOptionValues.id, valueId), eq(productOptionTypes.orgId, orgId)));

  if (rows.length === 0) throw new Error("Option value not found");

  // Check if any variants use this value
  const [usage] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(productVariantOptions)
    .where(eq(productVariantOptions.optionValueId, valueId));

  if (Number(usage.count) > 0) {
    throw new Error(`Cannot delete option value used by ${usage.count} variant(s)`);
  }

  await db.delete(productOptionValues).where(eq(productOptionValues.id, valueId));
}
```

**Step 2: Create routes**

File: `apps/api/src/modules/product-options/routes.ts`

```typescript
import type { FastifyPluginAsync } from "fastify";
import { createOptionTypeSchema, updateOptionTypeSchema } from "@apex/types";
import {
  listOptionTypes,
  createOptionType,
  updateOptionType,
  deleteOptionType,
  addOptionValue,
  updateOptionValue,
  deleteOptionValue,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const productOptionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /product-options/:productId
  app.get<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const types = await listOptionTypes(request.params.productId, orgId);
    return reply.send({ data: types });
  });

  // POST /product-options/:productId
  app.post<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
    }

    const parsed = createOptionTypeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const type = await createOptionType(
        request.params.productId,
        orgId,
        parsed.data.name,
        parsed.data.values,
      );
      return reply.status(201).send(type);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /product-options/:productId/types/:typeId
  app.patch<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const parsed = updateOptionTypeSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
      }

      const { orgId } = request.storeContext!;
      try {
        if (parsed.data.name) {
          await updateOptionType(request.params.typeId, orgId, parsed.data.name);
        }
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId
  app.delete<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionType(request.params.typeId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // POST /product-options/:productId/types/:typeId/values
  app.post<{ Params: { productId: string; typeId: string } }>(
    "/:productId/types/:typeId/values",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const body = request.body as { value?: string };
      if (!body.value || body.value.length === 0) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        const val = await addOptionValue(request.params.typeId, orgId, body.value);
        return reply.status(201).send(val);
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // PATCH /product-options/:productId/types/:typeId/values/:valueId
  app.patch<{ Params: { productId: string; typeId: string; valueId: string } }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const body = request.body as { value?: string };
      if (!body.value) {
        return reply.status(400).send({ error: "value is required" });
      }

      const { orgId } = request.storeContext!;
      try {
        await updateOptionValue(request.params.valueId, orgId, body.value);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );

  // DELETE /product-options/:productId/types/:typeId/values/:valueId
  app.delete<{ Params: { productId: string; typeId: string; valueId: string } }>(
    "/:productId/types/:typeId/values/:valueId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage options" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteOptionValue(request.params.valueId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );
};
```

**Step 3: Register in app.ts**

```typescript
import { productOptionsRoutes } from "./modules/product-options/routes";
// ... in route registration:
await app.register(productOptionsRoutes, { prefix: "/product-options" });
```

**Step 4: Verify API starts**

**Step 5: Commit**

```bash
git add apps/api/src/modules/product-options/ apps/api/src/app.ts
git commit -m "feat(api): product option types & values CRUD

- GET /product-options/:productId — list option types with values
- POST /product-options/:productId — create option type with initial values
- PATCH/DELETE option types and values
- Auto-promotes product to is_parent when first option type added"
```

---

### Task 10: Variant CRUD API

**Files:**
- Create: `apps/api/src/modules/variants/service.ts`
- Create: `apps/api/src/modules/variants/routes.ts`
- Modify: `apps/api/src/app.ts`

**Step 1: Create service**

File: `apps/api/src/modules/variants/service.ts`

```typescript
import { db } from "@apex/database";
import {
  products,
  inventory,
  productVariantOptions,
  productOptionValues,
  productOptionTypes,
} from "@apex/database/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { generateEan13 } from "@apex/types";

export interface VariantRow {
  id: string;
  sku: string;
  mnemonicSku: string;
  unitPrice: string;
  costPrice: string;
  barcode: string | null;
  isVariablePrice: boolean;
  isActive: boolean;
  options: Array<{ typeName: string; value: string }>;
  stockLevel: number;
}

export async function listVariants(
  parentId: string,
  orgId: string,
  locationId: string,
): Promise<VariantRow[]> {
  const variants = await db
    .select({
      id: products.id,
      sku: products.sku,
      mnemonicSku: products.mnemonicSku,
      unitPrice: products.unitPrice,
      costPrice: products.costPrice,
      barcode: products.barcode,
      isVariablePrice: products.isVariablePrice,
      isActive: products.isActive,
    })
    .from(products)
    .where(
      and(
        eq(products.parentProductId, parentId),
        eq(products.orgId, orgId),
      ),
    )
    .orderBy(asc(products.sku));

  const result: VariantRow[] = [];
  for (const v of variants) {
    // Get option values for this variant
    const options = await db
      .select({
        typeName: productOptionTypes.name,
        value: productOptionValues.value,
      })
      .from(productVariantOptions)
      .innerJoin(productOptionValues, eq(productVariantOptions.optionValueId, productOptionValues.id))
      .innerJoin(productOptionTypes, eq(productOptionValues.optionTypeId, productOptionTypes.id))
      .where(eq(productVariantOptions.productId, v.id))
      .orderBy(productOptionTypes.sortOrder);

    // Get stock at current location
    const [inv] = await db
      .select({ stockLevel: inventory.stockLevel })
      .from(inventory)
      .where(and(eq(inventory.productId, v.id), eq(inventory.locationId, locationId)));

    result.push({
      ...v,
      unitPrice: v.unitPrice,
      costPrice: v.costPrice,
      options,
      stockLevel: inv?.stockLevel ?? 0,
    });
  }

  return result;
}

function generateMnemonicSku(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export async function createVariant(
  parentId: string,
  orgId: string,
  input: {
    sku: string;
    mnemonicSku?: string;
    unitPrice?: string;
    costPrice?: string;
    barcode?: string;
    isVariablePrice?: boolean;
    optionValueIds: string[];
  },
): Promise<{ id: string; sku: string }> {
  // Verify parent exists and is_parent
  const [parent] = await db
    .select({
      id: products.id,
      isParent: products.isParent,
      category: products.category,
      categoryId: products.categoryId,
      subcategoryId: products.subcategoryId,
      familyId: products.familyId,
      name: products.name,
    })
    .from(products)
    .where(and(eq(products.id, parentId), eq(products.orgId, orgId)));

  if (!parent) throw new Error("Parent product not found");
  if (!parent.isParent) throw new Error("Product is not a parent product");

  // Check SKU uniqueness
  const [existingSku] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.orgId, orgId), eq(products.sku, input.sku)));

  if (existingSku) throw new Error(`SKU "${input.sku}" already exists`);

  // Generate mnemonic SKU if not provided
  let mnemonicSku = input.mnemonicSku;
  if (!mnemonicSku) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = generateMnemonicSku();
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.mnemonicSku, candidate)));
      if (!dup) {
        mnemonicSku = candidate;
        break;
      }
    }
    if (!mnemonicSku) throw new Error("Failed to generate unique mnemonic SKU");
  }

  // Generate barcode if not provided
  let barcode = input.barcode;
  if (!barcode) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateEan13();
      const [dup] = await db
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.orgId, orgId), eq(products.barcode, candidate)));
      if (!dup) {
        barcode = candidate;
        break;
      }
    }
  }

  return await db.transaction(async (tx) => {
    // Create variant product row
    const [variant] = await tx
      .insert(products)
      .values({
        orgId,
        name: parent.name, // inherit parent name
        sku: input.sku,
        mnemonicSku,
        category: parent.category,
        categoryId: parent.categoryId,
        subcategoryId: parent.subcategoryId,
        familyId: parent.familyId,
        unitPrice: input.unitPrice || "0.00",
        costPrice: input.costPrice || "0.00",
        barcode: barcode || null,
        isVariablePrice: input.isVariablePrice || false,
        parentProductId: parentId,
        isParent: false,
      })
      .returning();

    // Link variant to option values
    for (const valueId of input.optionValueIds) {
      await tx.insert(productVariantOptions).values({
        productId: variant.id,
        optionValueId: valueId,
      });
    }

    // Create inventory rows at all locations where parent has available_for_sale
    const parentLocations = await tx
      .select({ locationId: inventory.locationId })
      .from(inventory)
      .where(
        and(
          eq(inventory.productId, parentId),
          eq(inventory.availableForSale, true),
        ),
      );

    for (const loc of parentLocations) {
      await tx.insert(inventory).values({
        orgId,
        productId: variant.id,
        locationId: loc.locationId,
        stockLevel: 0,
        reorderPoint: 10,
        leadTimeDays: 7,
      });
    }

    return { id: variant.id, sku: variant.sku };
  });
}

export async function createVariantBatch(
  parentId: string,
  orgId: string,
  variants: Array<{
    sku: string;
    mnemonicSku?: string;
    unitPrice?: string;
    costPrice?: string;
    barcode?: string;
    isVariablePrice?: boolean;
    optionValueIds: string[];
  }>,
): Promise<Array<{ id: string; sku: string }>> {
  const results: Array<{ id: string; sku: string }> = [];
  for (const v of variants) {
    const result = await createVariant(parentId, orgId, v);
    results.push(result);
  }
  return results;
}

export async function deleteVariant(
  variantId: string,
  orgId: string,
): Promise<void> {
  const [variant] = await db
    .select({ id: products.id, parentProductId: products.parentProductId })
    .from(products)
    .where(and(eq(products.id, variantId), eq(products.orgId, orgId)));

  if (!variant) throw new Error("Variant not found");
  if (!variant.parentProductId) throw new Error("Product is not a variant");

  // Delete variant (cascades to inventory, variant_options via FK)
  await db.delete(products).where(eq(products.id, variantId));
}
```

**Step 2: Create routes**

File: `apps/api/src/modules/variants/routes.ts`

```typescript
import type { FastifyPluginAsync } from "fastify";
import { createVariantSchema, createVariantBatchSchema } from "@apex/types";
import { listVariants, createVariant, createVariantBatch, deleteVariant } from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const variantRoutes: FastifyPluginAsync = async (app) => {
  // GET /variants/:productId
  app.get<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const variants = await listVariants(request.params.productId, orgId, locationId);
    return reply.send({ data: variants });
  });

  // POST /variants/:productId
  app.post<{ Params: { productId: string } }>("/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create variants" });
    }

    const parsed = createVariantSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await createVariant(request.params.productId, orgId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /variants/:productId/batch
  app.post<{ Params: { productId: string } }>("/:productId/batch", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can create variants" });
    }

    const parsed = createVariantBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;
    try {
      const results = await createVariantBatch(request.params.productId, orgId, parsed.data.variants);
      return reply.status(201).send({ data: results, count: results.length });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // DELETE /variants/:productId/:variantId
  app.delete<{ Params: { productId: string; variantId: string } }>(
    "/:productId/:variantId",
    async (request, reply) => {
      const userRole = (request.user as any)?.role;
      if (!MANAGE_ROLES.includes(userRole)) {
        return reply.status(403).send({ error: "Only ADMIN or MANAGER can delete variants" });
      }

      const { orgId } = request.storeContext!;
      try {
        await deleteVariant(request.params.variantId, orgId);
        return reply.send({ success: true });
      } catch (err: any) {
        return reply.status(400).send({ error: err.message });
      }
    },
  );
};
```

**Step 3: Register in app.ts**

```typescript
import { variantRoutes } from "./modules/variants/routes";
// ... in route registration:
await app.register(variantRoutes, { prefix: "/variants" });
```

**Step 4: Verify API starts**

**Step 5: Commit**

```bash
git add apps/api/src/modules/variants/ apps/api/src/app.ts
git commit -m "feat(api): variant CRUD — create, list, batch create, delete

- GET /variants/:productId — list variants with option values and stock
- POST /variants/:productId — create single variant
- POST /variants/:productId/batch — batch create up to 500 variants
- DELETE /variants/:productId/:variantId — delete variant
- Inherits parent's category, family, subcategory, name
- Auto-creates inventory rows at parent's available locations"
```

---

### Task 11: Modify products API for variant awareness

**Files:**
- Modify: `apps/api/src/modules/products/routes.ts`

**Step 1: Add `parentOnly` filter to GET /products**

In the standard flat mode conditions block (after the `includeInactive` check), add:

```typescript
// parentOnly mode: hide variant children, show only parent + standalone
const parentOnly = q.parentOnly === "true";
if (parentOnly) {
  conditions.push(sql`${products.parentProductId} IS NULL`);
}

// Filter by specific parent (show variants of a parent)
if (q.parentProductId) {
  conditions.push(eq(products.parentProductId, q.parentProductId));
}
```

**Step 2: Add variant data to product detail queries**

Add `parentProductId` and `isParent` to the select fields wherever products are queried:
```typescript
parentProductId: products.parentProductId,
isParent: products.isParent,
```

**Step 3: Verify API starts and responds correctly**

**Step 4: Commit**

```bash
git add apps/api/src/modules/products/routes.ts
git commit -m "feat(api): add parentOnly filter and variant fields to product queries

- GET /products?parentOnly=true excludes variant children
- GET /products?parentProductId=XXX lists variants of a parent
- Product detail includes parentProductId and isParent fields"
```

---

### Task 12: Add variant data to sync service

**Files:**
- Modify: `apps/api/src/modules/sync/service.ts`

**Step 1: Add fields to catalog delta select**

In `getCatalogDelta`, add to the select object:

```typescript
parentProductId: products.parentProductId,
isParent: products.isParent,
```

**Step 2: Verify compile**

**Step 3: Commit**

```bash
git add apps/api/src/modules/sync/service.ts
git commit -m "feat(sync): include parentProductId and isParent in catalog delta"
```

---

## Phase 3: Web Dashboard — Taxonomy UI

### Task 13: Create subcategory hooks

**Files:**
- Create: `apps/web/src/hooks/use-subcategories.ts`

**Step 1: Create the hook file**

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface SubcategoryRow {
  id: string;
  categoryId: string;
  name: string;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

export function useSubcategories(
  token: string,
  locationId: string,
  categoryId?: string,
) {
  return useQuery<{ data: SubcategoryRow[] }>({
    queryKey: ["subcategories", categoryId, locationId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (categoryId) params.set("categoryId", categoryId);
      return apiFetch(`/subcategories?${params.toString()}`, { token, locationId });
    },
    enabled: !!token && !!locationId,
    staleTime: 30_000,
  });
}

export function useCreateSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      categoryId: string;
      name: string;
      slug: string;
      sortOrder?: number;
      isActive?: boolean;
    }) =>
      apiFetch("/subcategories", {
        token,
        locationId,
        method: "POST",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}

export function useUpdateSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; slug?: string; sortOrder?: number; isActive?: boolean }) =>
      apiFetch(`/subcategories/${id}`, {
        token,
        locationId,
        method: "PATCH",
        body: input,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}

export function useDeleteSubcategory(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/subcategories/${id}`, { token, locationId, method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subcategories"] }),
  });
}
```

**Step 2: Commit**

```bash
git add apps/web/src/hooks/use-subcategories.ts
git commit -m "feat(web): add useSubcategories hook for CRUD operations"
```

---

### Task 14: Create product options and variants hooks

**Files:**
- Create: `apps/web/src/hooks/use-product-options.ts`
- Create: `apps/web/src/hooks/use-variants.ts`

**Step 1: Create options hook**

File: `apps/web/src/hooks/use-product-options.ts`

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface OptionValueRow {
  id: string;
  value: string;
  sortOrder: number;
}

export interface OptionTypeRow {
  id: string;
  name: string;
  sortOrder: number;
  values: OptionValueRow[];
}

export function useProductOptions(token: string, locationId: string, productId?: string) {
  return useQuery<{ data: OptionTypeRow[] }>({
    queryKey: ["product-options", productId],
    queryFn: () => apiFetch(`/product-options/${productId}`, { token, locationId }),
    enabled: !!token && !!locationId && !!productId,
    staleTime: 30_000,
  });
}

export function useCreateOptionType(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, name, values }: { productId: string; name: string; values: string[] }) =>
      apiFetch(`/product-options/${productId}`, {
        token,
        locationId,
        method: "POST",
        body: { name, values },
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}

export function useDeleteOptionType(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId }: { productId: string; typeId: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}

export function useAddOptionValue(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId, value }: { productId: string; typeId: string; value: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}/values`, {
        token,
        locationId,
        method: "POST",
        body: { value },
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}

export function useDeleteOptionValue(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, typeId, valueId }: { productId: string; typeId: string; valueId: string }) =>
      apiFetch(`/product-options/${productId}/types/${typeId}/values/${valueId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["product-options", vars.productId] }),
  });
}
```

**Step 2: Create variants hook**

File: `apps/web/src/hooks/use-variants.ts`

```typescript
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";

export interface VariantRow {
  id: string;
  sku: string;
  mnemonicSku: string;
  unitPrice: string;
  costPrice: string;
  barcode: string | null;
  isVariablePrice: boolean;
  isActive: boolean;
  options: Array<{ typeName: string; value: string }>;
  stockLevel: number;
}

export function useVariants(token: string, locationId: string, parentId?: string) {
  return useQuery<{ data: VariantRow[] }>({
    queryKey: ["variants", parentId, locationId],
    queryFn: () => apiFetch(`/variants/${parentId}`, { token, locationId }),
    enabled: !!token && !!locationId && !!parentId,
    staleTime: 30_000,
  });
}

export function useCreateVariant(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      parentId,
      ...input
    }: {
      parentId: string;
      sku: string;
      mnemonicSku?: string;
      unitPrice?: string;
      costPrice?: string;
      barcode?: string;
      isVariablePrice?: boolean;
      optionValueIds: string[];
    }) =>
      apiFetch(`/variants/${parentId}`, {
        token,
        locationId,
        method: "POST",
        body: input,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useCreateVariantBatch(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      parentId,
      variants,
    }: {
      parentId: string;
      variants: Array<{
        sku: string;
        mnemonicSku?: string;
        unitPrice?: string;
        costPrice?: string;
        optionValueIds: string[];
      }>;
    }) =>
      apiFetch(`/variants/${parentId}/batch`, {
        token,
        locationId,
        method: "POST",
        body: { variants },
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

export function useDeleteVariant(token: string, locationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, variantId }: { parentId: string; variantId: string }) =>
      apiFetch(`/variants/${parentId}/${variantId}`, {
        token,
        locationId,
        method: "DELETE",
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ["variants", vars.parentId] });
      qc.invalidateQueries({ queryKey: ["products"] });
    },
  });
}
```

**Step 3: Commit**

```bash
git add apps/web/src/hooks/use-product-options.ts apps/web/src/hooks/use-variants.ts
git commit -m "feat(web): add useProductOptions and useVariants hooks"
```

---

### Task 15: Redesign categories page for 3-tier hierarchy

**Files:**
- Modify: `apps/web/src/app/inventory/categories/page.tsx`

This is a large UI task. The categories page currently shows a 2-tier tree (parent categories with children). It needs to be extended to 3 tiers:

**Level 1:** Families (from `product_families` via `useProductFamilies`)
**Level 2:** Categories (filtered by `family_id` match)
**Level 3:** Sub-categories (from `useSubcategories`)

Key changes:
1. Import `useProductFamilies` from `@/hooks/use-products`
2. Import `useSubcategories`, `useCreateSubcategory`, `useDeleteSubcategory` from `@/hooks/use-subcategories`
3. Fetch all families, all categories, and all subcategories on mount
4. Build tree: group categories by `familyId` (with an "Uncategorized" group for null)
5. Under each category, render subcategories as a third level
6. Add "Family" dropdown to the edit category modal (to assign/reassign `familyId`)
7. Add inline "+ Add Sub-category" button under each category
8. Add sub-category edit/delete actions
9. Update the category update API call to include `familyId` if the user changes the family assignment — this requires adding `familyId` to `updateCategorySchema` in `packages/types/src/schemas.ts` and to the `updateCategory` service function

**Implementation notes:**
- The existing `CategoryRow` from the categories hook already has `parentId` — we now also need to pass `familyId` from the API
- The API `categories/service.ts` `listCategories` and `getCategoryById` need to include `familyId` in the select
- Add `familyId` to the `CategoryRow` interface in `categories/service.ts`
- The tree structure: iterate families first, then categories where `family_id = family.id`, then subcategories where `category_id = category.id`

**Step 1:** Update `categories/service.ts` to include `familyId` in queries and `CategoryRow` interface

**Step 2:** Add `familyId` to `updateCategorySchema` in `packages/types/src/schemas.ts`:
```typescript
familyId: z.string().uuid().nullable().optional(),
```

**Step 3:** Update the categories service `updateCategory` to handle `familyId`

**Step 4:** Redesign the categories page component with 3-tier tree, family dropdowns, and subcategory CRUD

**Step 5:** Verify with screenshot — all 3 tiers visible and collapsible

**Step 6: Commit**

```bash
git add apps/web/src/app/inventory/categories/page.tsx apps/api/src/modules/categories/service.ts packages/types/src/schemas.ts
git commit -m "feat(web): 3-tier taxonomy on categories page (Family → Category → Sub-category)

- Categories grouped under Families
- Sub-categories shown under each category
- Family dropdown in category edit modal
- Inline sub-category create/edit/delete"
```

---

### Task 16: Update item list with taxonomy columns

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx`
- Modify: `apps/web/src/hooks/use-products.ts`
- Modify: `apps/api/src/modules/products/routes.ts`

**Step 1:** Ensure the API returns `familyName`, `subCategoryName` (and `subcategoryId`) in the product list query. Update the products query SELECT to join `productSubcategories` table.

**Step 2:** Update `ProductRow` in `use-products.ts` to include `subcategoryName` and `familyName`.

**Step 3:** In the inventory page, replace the single "Category" badge column with three taxonomy columns:
- Family (from `familyName`)
- Category (from `subCategoryName` or category enum label)
- Sub-category (from `subcategoryName`)

**Step 4:** Add cascading filter dropdowns: Family → Category → Sub-category

**Step 5:** Verify with screenshot

**Step 6: Commit**

```bash
git add apps/web/src/app/inventory/page.tsx apps/web/src/hooks/use-products.ts apps/api/src/modules/products/routes.ts
git commit -m "feat(web): show Family, Category, Sub-category columns in item list

- 3-tier taxonomy columns in inventory table
- Cascading filter dropdowns"
```

---

## Phase 4: Web Dashboard — Variant UI

### Task 17: Parent/variant display in item list

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx`

**Step 1:** Add expandable rows for parent products:
- If `isParent = true`, show a chevron icon that expands to reveal variant rows
- Parent row shows no price/stock (it's a container)
- Variant rows show SKU, option values (joined with " · "), price, stock
- Use `useVariants` hook to fetch variants when expanded

**Step 2:** Hide variant children from the main list by default — pass `parentOnly=true` to the API query

**Step 3:** Verify with screenshot

**Step 4: Commit**

```bash
git add apps/web/src/app/inventory/page.tsx
git commit -m "feat(web): expandable parent/variant rows in item list

- Parent products show expand chevron
- Variant rows show SKU, options, price, stock
- Main list uses parentOnly=true to hide variant children"
```

---

### Task 18: Variant management in item detail drawer

**Files:**
- Modify: `apps/web/src/app/inventory/page.tsx`

**Step 1:** When a parent product is selected, add two sections to the detail drawer:

**Option Types section:**
- List all option types with their values
- Each type has Edit/Delete buttons
- "+ Add Option" button opens inline form
- Uses `useProductOptions`, `useCreateOptionType`, `useDeleteOptionType` hooks

**Variants section:**
- List all variants with SKU, option values, price, stock
- "+ Add Variant" button opens a form to select one value per option type + enter SKU/price
- "Generate All Combinations" button:
  - Computes cartesian product of all option values
  - Shows confirmation: "This will create N variant SKUs. Continue?"
  - Warning if > 50 combinations
  - Auto-generates SKUs from parent SKU + abbreviations
  - Uses `useCreateVariantBatch` hook

**Step 2:** Verify with screenshot

**Step 3: Commit**

```bash
git add apps/web/src/app/inventory/page.tsx
git commit -m "feat(web): variant management in item detail drawer

- Option types section with CRUD
- Variants list with add/delete
- Generate All Combinations with cartesian product + safety warning"
```

---

### Task 19: Variant setup in Create Item flow

**Files:**
- Modify: `apps/web/src/app/inventory/new/page.tsx`

**Step 1:** Add "This item has variants" toggle after the basic info section

**Step 2:** When enabled, show additional steps:
- Step 2: Define option types and values (inline forms)
- Step 3: Generate or manually create variant SKUs
- Step 4: Set prices and confirm

**Step 3:** On save:
- Create parent product with `isParent: true`
- Create option types + values via API
- Create variants via batch API

**Step 4:** Verify with screenshot

**Step 5: Commit**

```bash
git add apps/web/src/app/inventory/new/page.tsx
git commit -m "feat(web): variant setup in Create Item flow

- 'This item has variants' toggle
- Multi-step: define options → generate variants → set prices
- Batch creates parent + option types + variants"
```

---

## Phase 5: Mobile POS — Variant Selection

### Task 20: Update mobile sync and schema

**Files:**
- Modify: `apps/mobile/src/db/schema.ts`
- Modify: `apps/mobile/src/db/migrations.ts`
- Modify: `apps/mobile/src/sync/inventory-sync.ts`

**Step 1:** Add `parent_product_id` and `is_parent` columns to mobile products schema:

```typescript
// In schema.ts, products table:
{ name: "parent_product_id", type: "string", isOptional: true },
{ name: "is_parent", type: "boolean" },
```

**Step 2:** Create migration to add columns (increment schema version)

**Step 3:** Update sync to populate new fields from API response

**Step 4: Commit**

```bash
git add apps/mobile/src/db/
git commit -m "feat(mobile): add variant columns to mobile schema and sync"
```

---

### Task 21: Mobile catalog variant picker

**Files:**
- Modify: `apps/mobile/src/hooks/use-catalog-search.ts`

**Step 1:** Filter search results to hide variant children:
- In the WHERE clause, add `AND (parent_product_id IS NULL OR parent_product_id = '')`
- Or filter in JS after query

**Step 2:** When a parent product is tapped (`isParent === true`), show a variant picker instead of adding to cart:
- Query local DB: `SELECT * FROM products WHERE parent_product_id = ?`
- Show modal with variant list
- Each variant shows option description + price + stock
- Tapping a variant adds it to the cart

**Step 3:** Cart lines for variants should show parent name + variant options in smaller font

**Step 4:** Verify on emulator (text-based validation preferred per CLAUDE.md rules)

**Step 5: Commit**

```bash
git add apps/mobile/src/hooks/use-catalog-search.ts
git commit -m "feat(mobile): variant picker for parent products in catalog

- Hide variant children from search results
- Variant picker modal when tapping parent product
- Cart shows variant options below product name"
```

---

## Verification Checklist

After all tasks complete, verify:

### Phase 1 — Taxonomy
- [ ] Migration 0026 applies cleanly
- [ ] `categories` table has `family_id` column
- [ ] `product_subcategories` table exists with correct schema
- [ ] `products` table has `subcategory_id`, `parent_product_id`, `is_parent` columns

### Phase 2 — Variant API
- [ ] `product_option_types`, `product_option_values`, `product_variant_options` tables exist
- [ ] `POST /subcategories` creates a sub-category under a category
- [ ] `POST /product-options/:id` creates an option type with values
- [ ] `POST /variants/:id` creates a variant SKU linked to parent
- [ ] `POST /variants/:id/batch` batch creates variants
- [ ] `GET /variants/:id` lists variants with option values

### Phase 3 — Taxonomy UI
- [ ] Categories page shows 3-tier hierarchy
- [ ] Sub-category CRUD works inline
- [ ] Category edit modal has Family dropdown
- [ ] Item list shows Family, Category, Sub-category columns

### Phase 4 — Variant UI
- [ ] Parent products show expandable variant rows
- [ ] Detail drawer shows option types CRUD
- [ ] Detail drawer shows variants with add/generate/delete
- [ ] "Generate All Combinations" computes correct cartesian product
- [ ] New Item flow supports variant setup

### Phase 5 — Mobile
- [ ] Sync includes parentProductId and isParent
- [ ] Search hides variant children
- [ ] Tapping parent opens variant picker
- [ ] Cart shows variant details
