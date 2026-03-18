# Dynamic Reorder Engine (Layer 2) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a smart reorder engine that computes dynamic per-SKU reorder points and suggested order quantities using sales velocity, ABC classification, and supplier lead times — with a bulk "Create POs" workflow.

**Architecture:** New `reorder_suggestions` and `reorder_settings` tables store pre-computed suggestions. A refresh service consumes Layer 1's `stock_metrics` + `supplier_metrics`, computes ABC classes from 90-day revenue, calculates demand std dev with zero-day inclusion, and generates prioritized reorder suggestions. API endpoints serve paginated suggestions with filters. Frontend page at `/procurement/suggested-orders` with summary cards, inline qty editing, and bulk PO creation grouped by supplier.

**Tech Stack:** Drizzle ORM, Fastify, PostgreSQL raw SQL (CTEs), Next.js/React, TanStack Query

---

### Task 1: Schema — `reorder_suggestions` + `reorder_settings` tables + product columns

**Files:**
- Create: `packages/database/src/schema/reorder.ts`
- Modify: `packages/database/src/schema/index.ts` (line 28, add export)
- Modify: `packages/database/src/schema/products.ts` (add 2 columns)
- Modify: `packages/types/src/schemas.ts` (add to update schema)

**Step 1: Create schema file**

Create `packages/database/src/schema/reorder.ts`:

```typescript
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
```

**Step 2: Add export to index.ts**

In `packages/database/src/schema/index.ts`, add after the `stock-metrics` export:
```typescript
export * from "./reorder";
```

**Step 3: Add reorder columns to products**

In `packages/database/src/schema/products.ts`, add after `primarySupplierId` (line 75):
```typescript
    reorderEnabled: boolean("reorder_enabled").notNull().default(true),
    customReorderPoint: integer("custom_reorder_point"),
```

**Step 4: Add to Zod schemas**

In `packages/types/src/schemas.ts`, add to `updateProductSchema`:
```typescript
  reorderEnabled: z.boolean().optional(),
  customReorderPoint: z.number().int().min(0).nullable().optional(),
```

**Step 5: Generate migration and apply**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
pnpm db:generate
pnpm db:migrate
```

If migration fails, apply manually:
```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS reorder_enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS custom_reorder_point INTEGER;
```

**Step 6: Rebuild packages**

```bash
cd packages/database && pnpm build
cd ../types && pnpm build
```

**Step 7: Commit**

```bash
git add packages/database/src/schema/ packages/types/src/schemas.ts packages/database/drizzle/
git commit -m "feat(schema): add reorder_suggestions, reorder_settings tables and product reorder columns"
```

---

### Task 2: API — Reorder computation service

**Files:**
- Create: `apps/api/src/modules/reorder/service.ts`

**Step 1: Create the service**

This is the core computation. Key functions:

#### `refreshReorderSuggestions(orgId: string)`

```typescript
import { db } from "@apex/database";
import { reorderSuggestions, reorderSettings } from "@apex/database/schema";
import { eq, sql } from "drizzle-orm";
import { refreshStockMetrics, refreshSupplierMetrics } from "../stock-monitor/service";

// Z-scores for service levels
const Z_SCORES: Record<string, number> = {
  "0.90": 1.28, "0.95": 1.65, "0.98": 2.05, "0.99": 2.33,
};

interface ReorderConfig {
  defaultServiceLevel: number;
  orderCycleDays: number;
  defaultLeadTimeDays: number;
  abcServiceLevels: { A: number; B: number; C: number };
}

async function loadSettings(orgId: string): Promise<ReorderConfig> {
  const rows = await db
    .select({ key: reorderSettings.settingKey, value: reorderSettings.settingValue })
    .from(reorderSettings)
    .where(eq(reorderSettings.orgId, orgId));
  const map = new Map(rows.map(r => [r.key, r.value]));
  return {
    defaultServiceLevel: parseFloat(map.get("default_service_level") ?? "0.95"),
    orderCycleDays: parseInt(map.get("order_cycle_days") ?? "14"),
    defaultLeadTimeDays: parseInt(map.get("default_lead_time_days") ?? "7"),
    abcServiceLevels: JSON.parse(map.get("abc_service_levels") ?? '{"A":0.98,"B":0.95,"C":0.90}'),
  };
}

export async function refreshReorderSuggestions(orgId: string): Promise<number> {
  // 1. Check if Layer 1 is stale (> 1 hour)
  const [staleCheck] = await db.execute(
    sql`SELECT computed_at FROM stock_metrics WHERE org_id = ${orgId} ORDER BY computed_at DESC LIMIT 1`
  );
  const computedAt = (staleCheck as any)?.computed_at;
  if (!computedAt || Date.now() - new Date(computedAt).getTime() > 3600000) {
    await refreshStockMetrics(orgId);
    await refreshSupplierMetrics(orgId);
  }

  const config = await loadSettings(orgId);

  const result = await db.transaction(async (tx) => {
    // Delete old PENDING suggestions (preserve ORDERED/DISMISSED)
    await tx.execute(
      sql`DELETE FROM reorder_suggestions WHERE org_id = ${orgId} AND status = 'PENDING'`
    );

    // Main computation: ABC + demand std dev + pending inbound + ROP + SOQ
    const inserted = await tx.execute(sql`
      WITH date_series AS (
        SELECT d::date AS sale_date
        FROM generate_series(NOW() - INTERVAL '30 days', NOW(), '1 day') AS d
      ),
      -- ABC classification from 90-day revenue
      revenue AS (
        SELECT
          sl.product_id,
          SUM(sl.line_total)::numeric AS total_rev
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY sl.product_id
      ),
      ranked_rev AS (
        SELECT
          product_id,
          total_rev,
          SUM(total_rev) OVER (ORDER BY total_rev DESC) AS cumulative_rev,
          SUM(total_rev) OVER () AS grand_total
        FROM revenue
      ),
      abc AS (
        SELECT
          product_id,
          CASE
            WHEN grand_total > 0 AND cumulative_rev <= grand_total * 0.20 THEN 'A'
            WHEN grand_total > 0 AND cumulative_rev <= grand_total * 0.50 THEN 'B'
            ELSE 'C'
          END AS abc_class
        FROM ranked_rev
      ),
      -- Demand std dev: cross join products x dates, left join actual daily sales
      daily_sales AS (
        SELECT
          sl.product_id,
          s.created_at::date AS sale_date,
          SUM(sl.quantity) AS daily_qty
        FROM sale_lines sl
        JOIN sales s ON sl.sale_id = s.id
        WHERE s.org_id = ${orgId}
          AND s.status = 'COMPLETED'
          AND s.created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sl.product_id, s.created_at::date
      ),
      product_dates AS (
        SELECT p.id AS product_id, ds.sale_date
        FROM products p
        CROSS JOIN date_series ds
        WHERE p.org_id = ${orgId} AND p.is_active = true AND p.reorder_enabled = true
      ),
      filled_daily AS (
        SELECT
          pd.product_id,
          pd.sale_date,
          COALESCE(d.daily_qty, 0) AS qty
        FROM product_dates pd
        LEFT JOIN daily_sales d ON pd.product_id = d.product_id AND pd.sale_date = d.sale_date
      ),
      demand_stats AS (
        SELECT
          product_id,
          COALESCE(STDDEV_POP(qty), 0) AS std_dev
        FROM filled_daily
        GROUP BY product_id
      ),
      -- Pending inbound from open POs
      pending AS (
        SELECT
          pl.product_id,
          SUM(pl.ordered_qty - COALESCE(pl.received_accepted_qty, 0))::integer AS pending_qty
        FROM po_lines pl
        JOIN purchase_orders po ON pl.purchase_order_id = po.id
        WHERE po.org_id = ${orgId}
          AND po.status IN ('SUBMITTED', 'PARTIALLY_RECEIVED')
        GROUP BY pl.product_id
      ),
      -- Combine everything
      computed AS (
        SELECT
          p.id AS product_id,
          p.sku,
          p.name AS product_name,
          COALESCE(p.primary_supplier_id, sm.last_po_supplier_name_id) AS supplier_id,
          sm.last_po_supplier_name AS supplier_name,
          sm.total_stock AS current_stock,
          COALESCE(pnd.pending_qty, 0) AS pending_inbound,
          COALESCE(sm.avg_daily_sales_30d::numeric, 0) AS avg_daily_demand,
          COALESCE(ds.std_dev, 0) AS demand_std_dev,
          COALESCE(supm.avg_lead_time_days::numeric, ${config.defaultLeadTimeDays}) AS avg_lead_time,
          COALESCE(abc.abc_class, 'C') AS abc_class,
          p.custom_reorder_point
        FROM products p
        JOIN stock_metrics sm ON p.id = sm.product_id AND sm.org_id = ${orgId}
        LEFT JOIN demand_stats ds ON p.id = ds.product_id
        LEFT JOIN pending pnd ON p.id = pnd.product_id
        LEFT JOIN abc ON p.id = abc.product_id
        LEFT JOIN supplier_metrics supm ON (
          p.primary_supplier_id IS NOT NULL
          AND supm.supplier_id = p.primary_supplier_id
          AND supm.org_id = ${orgId}
        )
        WHERE p.org_id = ${orgId}
          AND p.is_active = true
          AND p.reorder_enabled = true
      ),
      with_rop AS (
        SELECT
          c.*,
          -- Service level Z-score by ABC class
          CASE c.abc_class
            WHEN 'A' THEN ${Z_SCORES[String(config.abcServiceLevels.A)] ?? 1.65}
            WHEN 'B' THEN ${Z_SCORES[String(config.abcServiceLevels.B)] ?? 1.65}
            ELSE ${Z_SCORES[String(config.abcServiceLevels.C)] ?? 1.28}
          END AS z_score,
          -- Safety stock = Z * sigma * sqrt(lead_time)
          CASE c.abc_class
            WHEN 'A' THEN ${Z_SCORES[String(config.abcServiceLevels.A)] ?? 1.65}
            WHEN 'B' THEN ${Z_SCORES[String(config.abcServiceLevels.B)] ?? 1.65}
            ELSE ${Z_SCORES[String(config.abcServiceLevels.C)] ?? 1.28}
          END * c.demand_std_dev * SQRT(c.avg_lead_time) AS safety_stock,
          -- ROP = (demand * lead_time) + safety_stock
          CASE
            WHEN c.custom_reorder_point IS NOT NULL THEN c.custom_reorder_point::numeric
            ELSE (c.avg_daily_demand * c.avg_lead_time) +
              (CASE c.abc_class
                WHEN 'A' THEN ${Z_SCORES[String(config.abcServiceLevels.A)] ?? 1.65}
                WHEN 'B' THEN ${Z_SCORES[String(config.abcServiceLevels.B)] ?? 1.65}
                ELSE ${Z_SCORES[String(config.abcServiceLevels.C)] ?? 1.28}
              END * c.demand_std_dev * SQRT(c.avg_lead_time))
          END AS rop,
          -- Target stock = ROP + (demand * order_cycle_days)
          CASE
            WHEN c.custom_reorder_point IS NOT NULL THEN c.custom_reorder_point + (c.avg_daily_demand * ${config.orderCycleDays})
            ELSE (c.avg_daily_demand * c.avg_lead_time) +
              (CASE c.abc_class
                WHEN 'A' THEN ${Z_SCORES[String(config.abcServiceLevels.A)] ?? 1.65}
                WHEN 'B' THEN ${Z_SCORES[String(config.abcServiceLevels.B)] ?? 1.65}
                ELSE ${Z_SCORES[String(config.abcServiceLevels.C)] ?? 1.28}
              END * c.demand_std_dev * SQRT(c.avg_lead_time))
              + (c.avg_daily_demand * ${config.orderCycleDays})
          END AS target_stock
        FROM computed c
      ),
      final AS (
        SELECT
          r.*,
          -- SOQ = target - current - pending_inbound (min 1)
          GREATEST(CEIL(r.target_stock - r.current_stock - r.pending_inbound), 1)::integer AS suggested_qty,
          -- Priority
          CASE
            WHEN r.current_stock = 0 AND r.avg_daily_demand > 0 THEN 'CRITICAL'
            WHEN r.current_stock <= r.rop AND r.avg_daily_demand > 0
              AND (r.current_stock::numeric / NULLIF(r.avg_daily_demand, 0)) <= 7 THEN 'URGENT'
            WHEN r.current_stock <= r.rop THEN 'NORMAL'
          END AS priority
        FROM with_rop r
        WHERE r.current_stock <= r.rop  -- only suggest reorder when below ROP
          AND r.avg_daily_demand > 0     -- skip zero-velocity items
      )
      INSERT INTO reorder_suggestions (
        org_id, product_id, sku, product_name, supplier_id, supplier_name,
        current_stock, pending_inbound, avg_daily_demand, demand_std_dev,
        avg_lead_time, service_level_z, safety_stock, reorder_point,
        suggested_qty, target_stock, abc_class, priority, status, computed_at
      )
      SELECT
        ${orgId}, f.product_id, f.sku, f.product_name, f.supplier_id, f.supplier_name,
        f.current_stock, f.pending_inbound, f.avg_daily_demand, f.demand_std_dev,
        f.avg_lead_time, f.z_score, ROUND(f.safety_stock, 1), ROUND(f.rop, 1),
        f.suggested_qty, CEIL(f.target_stock)::integer, f.abc_class,
        f.priority::reorder_priority, 'PENDING', NOW()
      FROM final f
      WHERE f.priority IS NOT NULL
    `);

    const [countRow] = await tx.execute(
      sql`SELECT COUNT(*)::integer AS cnt FROM reorder_suggestions WHERE org_id = ${orgId} AND status = 'PENDING'`
    );
    return (countRow as any).cnt as number;
  });

  return result;
}
```

NOTE: The `sm.last_po_supplier_name_id` doesn't exist — the supplier_id resolution needs to be handled differently. In the `computed` CTE, for supplier resolution:
- If `p.primary_supplier_id` is set, use it and join `suppliers` for name
- Otherwise, find the supplier from the most recent PO for this product via a subquery on `po_lines JOIN purchase_orders`
- For lead time, join `supplier_metrics` on the resolved supplier_id

The agent implementing this should adjust the CTE to properly resolve supplier_id. The general structure is correct but the supplier join needs refinement.

Also add: `getReorderCounts(orgId)` for the sidebar badge:

```typescript
export async function getReorderCounts(orgId: string) {
  const rows = await db.execute(
    sql`SELECT priority, COUNT(*)::integer AS count
        FROM reorder_suggestions
        WHERE org_id = ${orgId} AND status = 'PENDING'
        GROUP BY priority`
  );
  let critical = 0, urgent = 0, normal = 0;
  for (const row of rows as any[]) {
    if (row.priority === "CRITICAL") critical = row.count;
    if (row.priority === "URGENT") urgent = row.count;
    if (row.priority === "NORMAL") normal = row.count;
  }
  return { critical, urgent, normal, total: critical + urgent + normal };
}
```

**Step 2: Verify types compile**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/api && npx tsc --noEmit 2>&1 | grep "error TS" | grep reorder
```

**Step 3: Commit**

```bash
git add apps/api/src/modules/reorder/
git commit -m "feat(api): reorder computation service with ABC classification and dynamic ROP/SOQ"
```

---

### Task 3: API — Reorder query service + routes

**Files:**
- Modify: `apps/api/src/modules/reorder/service.ts` (add query functions)
- Create: `apps/api/src/modules/reorder/routes.ts`
- Modify: `apps/api/src/app.ts` (register routes)

**Step 1: Add query functions to service.ts**

Add `queryReorderSuggestions(params)` — paginated with keyset cursor, joins products for brand/category. Same pattern as `queryStockMonitor` in `apps/api/src/modules/stock-monitor/service.ts`.

Add `queryReorderSummary(orgId)` — returns `{ critical, urgent, normal, totalValue }`. The totalValue is `SUM(rs.suggested_qty * p.cost_price::numeric)` for all PENDING suggestions.

Add `exportReorderCSV(params)` — all matching rows, no pagination.

**Step 2: Create routes.ts**

```typescript
import type { FastifyPluginAsync } from "fastify";
import {
  refreshReorderSuggestions,
  queryReorderSuggestions,
  queryReorderSummary,
  getReorderCounts,
  exportReorderCSV,
} from "./service";
import { db } from "@apex/database";
import { reorderSuggestions, reorderSettings } from "@apex/database/schema";
import { eq, and, sql, inArray } from "drizzle-orm";

export const reorderRoutes: FastifyPluginAsync = async (app) => {
  // GET /counts — lightweight badge counts
  app.get("/counts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getReorderCounts(orgId));
  });

  // GET /export — CSV download
  app.get("/export", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const rows = await exportReorderCSV({ orgId, ...q });
    const headers = "Priority,ABC,Item,SKU,Supplier,Stock,Pending,Demand/day,Safety Stock,ROP,Suggested Qty,Target,Notes";
    const csv = rows.map(r => [
      r.priority, r.abcClass,
      `"${(r.productName || "").replace(/"/g,'""')}"`,
      r.sku, r.supplierName || "", r.currentStock, r.pendingInbound,
      r.avgDailyDemand, r.safetyStock, r.reorderPoint,
      r.suggestedQty, r.targetStock, r.notes || "",
    ].join(","));
    reply.header("Content-Type", "text/csv");
    reply.header("Content-Disposition", 'attachment; filename="reorder-suggestions.csv"');
    return reply.send(headers + "\n" + csv.join("\n"));
  });

  // GET /settings
  app.get("/settings", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.select().from(reorderSettings).where(eq(reorderSettings.orgId, orgId));
    const map: Record<string, string> = {};
    for (const r of rows) map[r.settingKey] = r.settingValue;
    return reply.send({ data: map });
  });

  // PATCH /settings
  app.patch("/settings", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN") return reply.status(403).send({ error: "Admin required" });
    const { orgId } = request.storeContext!;
    const body = request.body as Record<string, string>;
    for (const [key, value] of Object.entries(body)) {
      await db.execute(sql`
        INSERT INTO reorder_settings (id, org_id, setting_key, setting_value, updated_at)
        VALUES (gen_random_uuid(), ${orgId}, ${key}, ${value}, NOW())
        ON CONFLICT (org_id, setting_key) DO UPDATE SET setting_value = ${value}, updated_at = NOW()
      `);
    }
    return reply.send({ success: true });
  });

  // GET /suppliers — not needed here, already in stock-monitor

  // POST /refresh
  app.post("/refresh", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER")
      return reply.status(403).send({ error: "Admin or Manager required" });
    const { orgId } = request.storeContext!;
    const count = await refreshReorderSuggestions(orgId);
    return reply.send({ success: true, suggestionsCount: count, computedAt: new Date().toISOString() });
  });

  // PATCH /:id/dismiss
  app.patch("/:id/dismiss", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.userId;
    await db.update(reorderSuggestions).set({
      status: "DISMISSED",
      actionedAt: new Date(),
      actionedBy: userId,
    }).where(and(eq(reorderSuggestions.id, id), eq(reorderSuggestions.orgId, orgId)));
    return reply.send({ success: true });
  });

  // PATCH /:id/qty
  app.patch("/:id/qty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const { suggestedQty } = request.body as { suggestedQty: number };
    await db.update(reorderSuggestions).set({ suggestedQty })
      .where(and(eq(reorderSuggestions.id, id), eq(reorderSuggestions.orgId, orgId)));
    return reply.send({ success: true });
  });

  // POST /create-pos — Bulk: group by supplier, create draft POs
  app.post("/create-pos", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;
    const { suggestionIds } = request.body as { suggestionIds: string[] };

    // Fetch the selected suggestions
    const suggestions = await db.select()
      .from(reorderSuggestions)
      .where(and(
        eq(reorderSuggestions.orgId, orgId),
        eq(reorderSuggestions.status, "PENDING"),
        inArray(reorderSuggestions.id, suggestionIds),
      ));

    if (suggestions.length === 0) {
      return reply.status(400).send({ error: "No valid pending suggestions selected" });
    }

    // Group by supplier
    const bySupplier = new Map<string, typeof suggestions>();
    for (const s of suggestions) {
      const key = s.supplierId ?? "no-supplier";
      if (!bySupplier.has(key)) bySupplier.set(key, []);
      bySupplier.get(key)!.push(s);
    }

    const createdPOs: string[] = [];

    await db.transaction(async (tx) => {
      for (const [supplierId, items] of bySupplier) {
        if (supplierId === "no-supplier") continue; // skip items without supplier

        // Generate PO number
        const [seqRow] = await tx.execute(
          sql`SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM 4) AS INTEGER)), 0) + 1 AS next_num FROM purchase_orders WHERE org_id = ${orgId}`
        );
        const nextNum = (seqRow as any).next_num;
        const poNo = `PO-${String(nextNum).padStart(6, "0")}`;

        // Get a destination location (first active location)
        const [loc] = await tx.execute(
          sql`SELECT id FROM locations WHERE org_id = ${orgId} AND is_active = true LIMIT 1`
        );

        // Create PO
        const [po] = await tx.execute(sql`
          INSERT INTO purchase_orders (id, org_id, po_no, supplier_id, destination_location_id, status, created_by_user_id, idempotency_key, created_at, updated_at)
          VALUES (gen_random_uuid(), ${orgId}, ${poNo}, ${supplierId}, ${(loc as any).id}, 'DRAFT', ${userId}, gen_random_uuid(), NOW(), NOW())
          RETURNING id, po_no
        `);

        // Create PO lines with cost prices from products
        for (const item of items) {
          await tx.execute(sql`
            INSERT INTO po_lines (id, purchase_order_id, org_id, product_id, ordered_qty, unit_cost, created_at, updated_at)
            VALUES (
              gen_random_uuid(), ${(po as any).id}, ${orgId}, ${item.productId}, ${item.suggestedQty},
              COALESCE((SELECT cost_price FROM products WHERE id = ${item.productId}), '0.00'),
              NOW(), NOW()
            )
          `);
        }

        createdPOs.push((po as any).po_no);

        // Mark suggestions as ORDERED
        for (const item of items) {
          await tx.execute(sql`
            UPDATE reorder_suggestions SET status = 'ORDERED', actioned_at = NOW(), actioned_by = ${userId}
            WHERE id = ${item.id}
          `);
        }
      }
    });

    return reply.send({ success: true, createdPOs });
  });

  // GET / — Paginated suggestions list (register LAST)
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const data = await queryReorderSuggestions({
      orgId,
      search: q.search,
      priority: q.priority,
      supplierId: q.supplierId,
      brandId: q.brandId,
      categoryId: q.categoryId,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit) : undefined,
    });
    const summary = await queryReorderSummary(orgId);
    return reply.send({ ...data, summary });
  });
};
```

**Step 3: Register in app.ts**

Add import and register after stock-monitor:
```typescript
import { reorderRoutes } from "./modules/reorder/routes";
// ...
await app.register(reorderRoutes, { prefix: "/inventory/reorder" });
```

**Step 4: Verify and commit**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS/apps/api && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v procurement/routes | grep -v stock-levels
git add apps/api/src/modules/reorder/ apps/api/src/app.ts
git commit -m "feat(api): reorder query endpoints, settings, dismiss, inline qty, bulk create-POs"
```

---

### Task 4: Frontend — Hook + types

**Files:**
- Create: `apps/web/src/hooks/use-reorder.ts`

Follow pattern of `apps/web/src/hooks/use-stock-monitor.ts`. Create:

- `useReorderSuggestions(token, locationId, filters, limit)` — useInfiniteQuery on GET /inventory/reorder
- `useReorderRefresh(token, locationId)` — useMutation on POST /inventory/reorder/refresh
- `useReorderCounts(token, locationId)` — useQuery on GET /inventory/reorder/counts (for sidebar badge)
- `useReorderDismiss(token, locationId)` — useMutation on PATCH /:id/dismiss
- `useReorderUpdateQty(token, locationId)` — useMutation on PATCH /:id/qty
- `useReorderCreatePOs(token, locationId)` — useMutation on POST /inventory/reorder/create-pos
- `useReorderSettings(token, locationId)` — useQuery on GET /inventory/reorder/settings
- `useUpdateReorderSettings(token, locationId)` — useMutation on PATCH /inventory/reorder/settings

Export all interfaces: `ReorderSuggestionRow`, `ReorderSummary`, `ReorderFilters`, `ReorderCounts`.

**Commit:**

```bash
git add apps/web/src/hooks/use-reorder.ts
git commit -m "feat(web): add reorder hooks and types"
```

---

### Task 5: Frontend — Suggested Orders main page

**Files:**
- Create: `apps/web/src/app/procurement/suggested-orders/page.tsx`

Layout (top to bottom):
1. **Header**: "Suggested Orders" + "Refresh Suggestions" button (mutation with spinner) + settings link + export CSV link
2. **Summary cards**: 4 cards — Critical (red), Urgent (orange), Normal (yellow), Total Value (gray/currency). Clicking Critical/Urgent/Normal sets priority filter.
3. **Filter bar**: Priority dropdown, Supplier dropdown (fetch from /suppliers), Brand (useBrands), Category (useCategories), search (debounced). Clear button.
4. **Table**: Priority badge | ABC class badge (small, colored) | Product (name+sku) | Supplier | Stock | Pending In | Demand/day | Safety Stock | ROP | Suggested Qty (EDITABLE inline input) | Est. Cost | Notes | Actions (Order/Dismiss).
5. **Bulk bar**: When checkboxes selected, show "X items selected — Create POs — Dismiss". Create POs calls POST /create-pos, shows toast with created PO numbers.
6. **Infinite scroll**: Same IntersectionObserver pattern.
7. **Row click**: Navigate to edit item page.

Priority badge colors: CRITICAL=`bg-red-100 text-red-700`, URGENT=`bg-orange-100 text-orange-700`, NORMAL=`bg-yellow-100 text-yellow-700`

ABC badge: A=`bg-emerald-100 text-emerald-700`, B=`bg-blue-100 text-blue-700`, C=`bg-gray-100 text-gray-600`

Inline qty editing: `<input type="number" min="1" value={row.suggestedQty}/>` — on blur, calls PATCH /:id/qty mutation.

**Reference:** `apps/web/src/app/procurement/stock-monitor/page.tsx` for the general layout pattern.

**Commit:**

```bash
git add apps/web/src/app/procurement/suggested-orders/
git commit -m "feat(web): suggested orders page with summary, filters, inline qty, and bulk PO creation"
```

---

### Task 6: Frontend — Settings page + sidebar + edit item reorder fields

**Files:**
- Create: `apps/web/src/app/procurement/suggested-orders/settings/page.tsx`
- Modify: `apps/web/src/app/sidebar.tsx` (add nav entry + badge)
- Modify: `apps/web/src/app/inventory/[productId]/edit/page.tsx` (add reorder fields)
- Modify: `apps/web/src/hooks/use-products.ts` (add reorderEnabled, customReorderPoint to types)

**Settings page**: Simple form with: Default Service Level dropdown (90/95/98/99%), Order Cycle Days input, Default Lead Time input, ABC Service Levels (A/B/C each with dropdown). Load from GET /settings, save with PATCH /settings.

**Sidebar**: Add after "Stock Monitor":
```typescript
{ label: "Suggested Orders", href: "/procurement/suggested-orders", match: /^\/procurement\/suggested-orders/ },
```
Add a badge component that calls `useReorderCounts` and shows count of critical+urgent if > 0.

**Edit Item**: In the Inventory section, add after the Primary Supplier dropdown:
- "Reorder Enabled" toggle (boolean)
- "Custom Reorder Point" number input (blank = auto from engine)

Add `reorderEnabled` and `customReorderPoint` to `ProductRow`, `ProductDetail`, `UpdateProductPayload` in use-products.ts.

**Commit:**

```bash
git add apps/web/src/app/procurement/suggested-orders/ apps/web/src/app/sidebar.tsx \
  "apps/web/src/app/inventory/[productId]/edit/page.tsx" apps/web/src/hooks/use-products.ts
git commit -m "feat(web): reorder settings page, sidebar with badge, edit item reorder fields"
```

---

### Task 7: Build verification

**Step 1: Full builds**

```bash
cd C:/Users/Admin/Downloads/CLAUDE/APEX_POS
cd packages/database && pnpm build
cd ../types && pnpm build
cd ../../apps/api && npx tsc --noEmit 2>&1 | grep "error TS" | grep -v procurement/routes | grep -v stock-levels
cd ../web && npx next build 2>&1 | tail -10
```

**Step 2: Smoke test**

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@apex.com","password":"admin12345"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
LOCID=$(curl -s http://localhost:3000/locations -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data[0].id))")

# Refresh suggestions
curl -s -X POST http://localhost:3000/inventory/reorder/refresh -H "Authorization: Bearer $TOKEN" -H "X-Location-ID: $LOCID" -H "Content-Type: application/json" -d '{}'

# Get counts
curl -s http://localhost:3000/inventory/reorder/counts -H "Authorization: Bearer $TOKEN" -H "X-Location-ID: $LOCID"

# Get suggestions
curl -s "http://localhost:3000/inventory/reorder?limit=5" -H "Authorization: Bearer $TOKEN" -H "X-Location-ID: $LOCID" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('Suggestions:', r.data?.length, 'Summary:', JSON.stringify(r.summary))})"
```

**Step 3: Final commit if needed**

```bash
git add -A && git status
# Only commit if there are remaining changes
```

---

## Execution Order

1 → 2 → 3 → 4 → 5 → 6 → 7

Tasks 4+5 can be parallelized after Task 3 is complete. Task 6 depends on Task 5 (same directory).
