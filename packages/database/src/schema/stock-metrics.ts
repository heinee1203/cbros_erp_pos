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
  "SPECIAL_ORDER",
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
    avgDailySales180d: numeric("avg_daily_sales_180d", { precision: 12, scale: 4 }).notNull().default("0"),
    avgDailySales365d: numeric("avg_daily_sales_365d", { precision: 12, scale: 4 }).notNull().default("0"),
    avgDailySalesAll: numeric("avg_daily_sales_all", { precision: 12, scale: 4 }).notNull().default("0"),
    /** Trend: 'up', 'down', 'stable' — compares last 3mo vs prior 3mo */
    trend: varchar("trend", { length: 10 }).notNull().default("stable"),
    /** Recent 3mo velocity (for tooltip) */
    trendRecent: numeric("trend_recent", { precision: 12, scale: 4 }).notNull().default("0"),
    /** Prior 3mo velocity (for tooltip) */
    trendPrior: numeric("trend_prior", { precision: 12, scale: 4 }).notNull().default("0"),
    daysOfStock: numeric("days_of_stock", { precision: 10, scale: 1 }),
    stockoutDays90d: integer("stockout_days_90d").notNull().default(0),
    lastPoDate: timestamp("last_po_date", { withTimezone: true }),
    lastPoSupplierName: varchar("last_po_supplier_name", { length: 255 }),
    lastLeadTimeDays: integer("last_lead_time_days"),
    lastSaleDate: timestamp("last_sale_date", { withTimezone: true }),
    /** Count of distinct calendar dates with at least one sale in the lookback window */
    saleDaysCount: integer("sale_days_count").notNull().default(0),
    /** Total units sold in the lookback window */
    totalQtySold: integer("total_qty_sold").notNull().default(0),
    /** Days since last sale (NULL if never sold) */
    daysSinceLastSale: integer("days_since_last_sale"),
    /** Velocity classification: FAST_MOVER, STRATEGIC_STOCK, WATCH_LIST, DEAD_STOCK, NEW_ITEM */
    velocityClass: varchar("velocity_class", { length: 30 }).notNull().default("UNCATEGORIZED"),
    /** Multi-window sales totals */
    sold12m: integer("sold_12m").notNull().default(0),
    sold6m: integer("sold_6m").notNull().default(0),
    sold3m: integer("sold_3m").notNull().default(0),
    sold1m: integer("sold_1m").notNull().default(0),
    /** Monthly averages */
    avgMonth12m: numeric("avg_month_12m", { precision: 10, scale: 2 }).notNull().default("0"),
    avgMonth6m: numeric("avg_month_6m", { precision: 10, scale: 2 }).notNull().default("0"),
    avgMonth3m: numeric("avg_month_3m", { precision: 10, scale: 2 }).notNull().default("0"),
    avgMonth1m: numeric("avg_month_1m", { precision: 10, scale: 2 }).notNull().default("0"),
    /** Months of stock remaining at each rate */
    monthsLeft12m: numeric("months_left_12m", { precision: 10, scale: 2 }),
    monthsLeft6m: numeric("months_left_6m", { precision: 10, scale: 2 }),
    monthsLeft3m: numeric("months_left_3m", { precision: 10, scale: 2 }),
    monthsLeft1m: numeric("months_left_1m", { precision: 10, scale: 2 }),
    /** Velocity trend: ACCELERATING, STABLE, DECELERATING, STALLED */
    velocityTrend: varchar("velocity_trend", { length: 20 }),
    /** Average selling price per unit (total revenue / total units from 12m sales) */
    avgSellingPrice: numeric("avg_selling_price", { precision: 12, scale: 2 }),
    /** Months since first stock receipt (for age-adjusted pricing) */
    stockAgeMonths: integer("stock_age_months"),
    /** Suggested sell price based on velocity class + stock age + inflation */
    suggestedSellPrice: numeric("suggested_sell_price", { precision: 12, scale: 2 }),
    /** The markup % that was applied to compute suggested price */
    appliedMarkupPct: numeric("applied_markup_pct", { precision: 5, scale: 2 }),
    /** Cost price adjusted for inflation based on stock age */
    inflationAdjustedCost: numeric("inflation_adjusted_cost", { precision: 12, scale: 2 }),
    /** Product cost price snapshot for dead stock value calculation */
    costPrice: numeric("cost_price", { precision: 12, scale: 2 }),
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
