import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { locations } from "./locations";
import { users } from "./users";
import { products } from "./products";
import { inventory } from "./inventory";

// ── Enums ──

export const countStatusEnum = pgEnum("count_status", [
  "DRAFT",
  "IN_PROGRESS",
  "COMPLETED",
  "REVIEWED",
  "POSTED",
  "CANCELLED",
]);

export const countScopeEnum = pgEnum("count_scope", [
  "FULL_LOCATION",
  "CATEGORY",
  "FAMILY",
  "SELECTED_SKUS",
]);

// ── Count Sessions ──

export const inventoryCounts = pgTable(
  "inventory_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    reviewedByUserId: uuid("reviewed_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    postedByUserId: uuid("posted_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    label: varchar("label", { length: 255 }).notNull(),
    status: countStatusEnum("status").notNull().default("DRAFT"),
    scope: countScopeEnum("scope").notNull().default("FULL_LOCATION"),
    scopeFilter: varchar("scope_filter", { length: 255 }),
    notes: varchar("notes", { length: 1000 }),
    // Stats (denormalized for list-view performance)
    totalLines: integer("total_lines").notNull().default(0),
    countedLines: integer("counted_lines").notNull().default(0),
    varianceLines: integer("variance_lines").notNull().default(0),
    // Timestamps
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_counts_org_id").on(table.orgId),
    index("idx_counts_location_id").on(table.locationId),
    index("idx_counts_status").on(table.status),
    index("idx_counts_created_at").on(table.createdAt),
  ],
);

// ── Count Lines (one per product in a count session) ──

export const inventoryCountLines = pgTable(
  "inventory_count_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    inventoryId: uuid("inventory_id")
      .notNull()
      .references(() => inventory.id, { onDelete: "cascade" }),
    // System snapshot at count creation
    systemQty: integer("system_qty").notNull(),
    // Operator-entered count (null = not yet counted)
    countedQty: integer("counted_qty"),
    // Derived: countedQty - systemQty (null if not counted)
    variance: integer("variance"),
    countedByUserId: uuid("counted_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    notes: varchar("notes", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_count_lines_count_id").on(table.countId),
    index("idx_count_lines_product_id").on(table.productId),
  ],
);
