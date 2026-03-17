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
import { productFamilies } from "./product-families";

/**
 * Categories — master data for product catalog organization.
 *
 * Each row has a `code` column that maps 1:1 to the legacy `product_category`
 * PostgreSQL enum used on products.category.  Product counts are derived at
 * query-time via `COUNT(*) FROM products WHERE category::text = code`.
 *
 * `parent_id` is nullable (flat today); wiring it enables future hierarchy.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    /** Human-readable name shown in UI (e.g. "Tires & Wheels") */
    name: varchar("name", { length: 255 }).notNull(),

    /** URL-safe slug (e.g. "tires-and-wheels") */
    slug: varchar("slug", { length: 255 }).notNull(),

    /**
     * Maps to the `product_category` enum on the products table.
     * Must match exactly (e.g. "TIRES", "HARD_PARTS").
     * Categories created without a matching code will show 0 products
     * until products.category is migrated from enum to FK.
     */
    code: varchar("code", { length: 100 }),

    description: varchar("description", { length: 500 }),

    /** Hex color for UI badges (e.g. "#2563EB") */
    color: varchar("color", { length: 7 }),

    /** Display ordering (lower = earlier) */
    sortOrder: integer("sort_order").notNull().default(0),

    /** Soft-delete / visibility toggle */
    isActive: boolean("is_active").notNull().default(true),

    /** Self-referencing FK for future hierarchy support */
    parentId: uuid("parent_id"),

    /** FK to product family for taxonomy grouping */
    familyId: uuid("family_id").references(() => productFamilies.id, { onDelete: "set null" }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_categories_org_slug").on(table.orgId, table.slug),
    uniqueIndex("idx_categories_org_code").on(table.orgId, table.code),
    index("idx_categories_org_id").on(table.orgId),
    index("idx_categories_parent_id").on(table.parentId),
    index("idx_categories_family_id").on(table.familyId),
  ],
);
