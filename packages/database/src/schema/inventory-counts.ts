import { pgTable, uuid, varchar, integer, numeric, timestamp, jsonb, uniqueIndex, index, pgEnum } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { locations } from "./locations";

export const countTypeEnum = pgEnum("count_type", ["FULL", "CYCLE"]);
export const countStatusEnum = pgEnum("count_status", ["DRAFT", "IN_PROGRESS", "REVIEW", "COMPLETED", "CANCELLED"]);
export const countItemStatusEnum = pgEnum("count_item_status", ["PENDING", "COUNTED", "VERIFIED", "SKIPPED"]);

export const inventoryCounts = pgTable(
  "inventory_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    locationId: uuid("location_id").notNull().references(() => locations.id, { onDelete: "cascade" }),
    countNumber: varchar("count_number", { length: 50 }).notNull(),
    countType: countTypeEnum("count_type").notNull(),
    status: countStatusEnum("status").notNull().default("DRAFT"),
    title: varchar("title", { length: 255 }),
    notes: varchar("notes", { length: 2000 }),
    filterCriteria: jsonb("filter_criteria"),
    totalItems: integer("total_items").notNull().default(0),
    countedItems: integer("counted_items").notNull().default(0),
    varianceCount: integer("variance_count").notNull().default(0),
    varianceValue: numeric("variance_value", { precision: 14, scale: 2 }).notNull().default("0"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    reviewStartedAt: timestamp("review_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedBy: uuid("completed_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by"),
    cancelReason: varchar("cancel_reason", { length: 1000 }),
    createdBy: uuid("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_counts_org_number").on(table.orgId, table.countNumber),
    index("idx_counts_org_loc_status").on(table.orgId, table.locationId, table.status),
    index("idx_counts_org_created").on(table.orgId, table.createdAt),
  ],
);

export const inventoryCountItems = pgTable(
  "inventory_count_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    countId: uuid("count_id").notNull().references(() => inventoryCounts.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    productName: varchar("product_name", { length: 255 }).notNull(),
    sku: varchar("sku", { length: 100 }).notNull(),
    brandName: varchar("brand_name", { length: 100 }),
    categoryName: varchar("category_name", { length: 100 }),
    systemQty: integer("system_qty").notNull(),
    countedQty: integer("counted_qty"),
    variance: integer("variance"),
    varianceCost: numeric("variance_cost", { precision: 12, scale: 2 }),
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }).notNull(),
    status: countItemStatusEnum("status").notNull().default("PENDING"),
    countedBy: uuid("counted_by"),
    countedAt: timestamp("counted_at", { withTimezone: true }),
    notes: varchar("notes", { length: 1000 }),
  },
  (table) => [
    uniqueIndex("idx_count_items_count_product").on(table.countId, table.productId),
    index("idx_count_items_count_status").on(table.countId, table.status),
  ],
);

export const countNumberSequence = pgTable("count_number_sequence", {
  orgId: uuid("org_id").primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  lastNumber: integer("last_number").notNull().default(0),
});
