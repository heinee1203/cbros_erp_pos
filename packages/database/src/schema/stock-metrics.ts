import {
  pgTable,
  uuid,
  integer,
  numeric,
  varchar,
  timestamp,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { products } from "./products";
import { suppliers } from "./suppliers";

export const stockMonitorStatusEnum = pgEnum("stock_monitor_status", [
  "CRITICAL",
  "LOW",
  "HEALTHY",
  "OVERSTOCK",
  "DEAD_STOCK",
]);

export const stockMetrics = pgTable(
  "stock_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    totalStock: integer("total_stock").notNull().default(0),
    avgDailySales30d: numeric("avg_daily_sales_30d", { precision: 12, scale: 4 }).notNull().default("0"),
    avgDailySales60d: numeric("avg_daily_sales_60d", { precision: 12, scale: 4 }).notNull().default("0"),
    avgDailySales90d: numeric("avg_daily_sales_90d", { precision: 12, scale: 4 }).notNull().default("0"),
    daysOfStock: numeric("days_of_stock", { precision: 10, scale: 1 }),
    stockoutDays90d: integer("stockout_days_90d").notNull().default(0),
    lastPoDate: timestamp("last_po_date", { withTimezone: true }),
    lastPoSupplierName: varchar("last_po_supplier_name", { length: 255 }),
    lastLeadTimeDays: integer("last_lead_time_days"),
    lastSaleDate: timestamp("last_sale_date", { withTimezone: true }),
    status: stockMonitorStatusEnum("status").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_stock_metrics_org_product").on(table.orgId, table.productId),
    index("idx_stock_metrics_org_status").on(table.orgId, table.status),
  ],
);

export const supplierMetrics = pgTable(
  "supplier_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "cascade" }),
    poCount6m: integer("po_count_6m").notNull().default(0),
    avgLeadTimeDays: numeric("avg_lead_time_days", { precision: 8, scale: 1 }),
    minLeadTimeDays: integer("min_lead_time_days"),
    maxLeadTimeDays: integer("max_lead_time_days"),
    reliabilityPct: numeric("reliability_pct", { precision: 5, scale: 2 }),
    lastPoDate: timestamp("last_po_date", { withTimezone: true }),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_supplier_metrics_org_supplier").on(table.orgId, table.supplierId),
  ],
);
