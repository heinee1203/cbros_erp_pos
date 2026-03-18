import {
  pgTable, pgEnum, uuid, integer, numeric, varchar, text,
  timestamp, uniqueIndex, index, boolean,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { suppliers } from "./suppliers";

export const reorderPriorityEnum = pgEnum("reorder_priority", [
  "CRITICAL", "URGENT", "NORMAL",
]);

export const reorderStatusEnum = pgEnum("reorder_status", [
  "PENDING", "ORDERED", "DISMISSED",
]);

export const reorderSuggestions = pgTable(
  "reorder_suggestions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sku: varchar("sku", { length: 50 }).notNull(),
    productName: varchar("product_name", { length: 500 }).notNull(),
    supplierId: uuid("supplier_id").references(() => suppliers.id, { onDelete: "set null" }),
    supplierName: varchar("supplier_name", { length: 255 }),
    currentStock: integer("current_stock").notNull().default(0),
    pendingInbound: integer("pending_inbound").notNull().default(0),
    avgDailyDemand: numeric("avg_daily_demand", { precision: 12, scale: 4 }).notNull().default("0"),
    demandStdDev: numeric("demand_std_dev", { precision: 12, scale: 4 }).notNull().default("0"),
    avgLeadTime: numeric("avg_lead_time", { precision: 8, scale: 1 }).notNull().default("7"),
    serviceLevelZ: numeric("service_level_z", { precision: 4, scale: 2 }).notNull().default("1.65"),
    safetyStock: numeric("safety_stock", { precision: 10, scale: 1 }).notNull().default("0"),
    reorderPoint: numeric("reorder_point", { precision: 10, scale: 1 }).notNull().default("0"),
    suggestedQty: integer("suggested_qty").notNull().default(0),
    targetStock: integer("target_stock").notNull().default(0),
    abcClass: varchar("abc_class", { length: 1 }).notNull().default("C"),
    priority: reorderPriorityEnum("priority").notNull(),
    status: reorderStatusEnum("status").notNull().default("PENDING"),
    notes: text("notes"),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
    actionedAt: timestamp("actioned_at", { withTimezone: true }),
    actionedBy: uuid("actioned_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_reorder_org_product").on(table.orgId, table.productId),
    index("idx_reorder_org_priority").on(table.orgId, table.priority),
    index("idx_reorder_org_status").on(table.orgId, table.status),
    index("idx_reorder_org_supplier").on(table.orgId, table.supplierId),
  ],
);

export const reorderSettings = pgTable(
  "reorder_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    settingKey: varchar("setting_key", { length: 100 }).notNull(),
    settingValue: text("setting_value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("idx_reorder_settings_org_key").on(table.orgId, table.settingKey),
  ],
);
