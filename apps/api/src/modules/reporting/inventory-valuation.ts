import { db } from "@apex/database";
import { sql } from "drizzle-orm";

/* ── Types ── */
export interface ValuationGroup {
  groupName: string;
  skuCount: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  marginPct: number;
  pctOfTotal: number;
  topCategories?: string; // for "No Family" — top category breakdown
}

export interface ValuationTotals {
  skuCount: number;
  totalUnits: number;
  costValue: number;
  retailValue: number;
  potentialProfit: number;
  avgMarginPct: number;
  adjustedMarginPct: number; // excluding ₱0 sell items
  adjustedRetailValue: number;
  adjustedCostValue: number;
  zeroCostCount: number;
  zeroSellCount: number;
}

export interface ValuationDetailProduct {
  productId: string;
  productName: string;
  sku: string;
  stock: number;
  costPrice: number;
  sellPrice: number;
  costValue: number;
  retailValue: number;
  marginPct: number;
}

type GroupByOption = "category" | "brand" | "family" | "location";

interface ValuationFilters {
  locationId?: string;
  groupBy?: GroupByOption;
  categoryId?: string;
  brandId?: string;
  excludeZeroCost?: boolean;
  excludeZeroSell?: boolean;
}

/*
 * JOIN strategy:
 *   product → category (via COALESCE with parent's category)
 *   category → product_families (families live on categories, NOT products)
 *
 * The resolved category alias is "rc" (resolved category).
 * The family alias is "f" and joins on rc.family_id.
 */

/* ── Shared FROM + JOIN block (used by all queries) ── */
function baseJoins(orgId: string) {
  return sql`
    FROM products p
    JOIN inventory i ON i.product_id = p.id AND i.org_id = ${orgId}
    JOIN locations l ON i.location_id = l.id
    LEFT JOIN products pp ON p.parent_product_id = pp.id
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN categories pc ON pp.category_id = pc.id
    -- Resolved category: product's own or parent's
    LEFT JOIN categories rc ON rc.id = COALESCE(p.category_id, pp.category_id)
    -- Family through resolved category (NOT through products.family_id)
    LEFT JOIN product_families f ON f.id = rc.family_id
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN brands pb ON pp.brand_id = pb.id
  `;
}

/* ── Shared WHERE exclusions ── */
function baseWhere(orgId: string) {
  return sql`
    WHERE p.org_id = ${orgId}
      AND i.stock_level > 0
      AND p.track_inventory = true
      AND (f.slug IS NULL OR f.slug != 'non-items')
      AND (rc.name IS NULL OR rc.name NOT IN ('Count', 'Price Add', 'Payment', 'Labor'))
  `;
}

/* ── Build extra filter conditions ── */
function buildFilters(opts: ValuationFilters) {
  const locationFilter = opts.locationId
    ? sql`AND i.location_id = ${opts.locationId}`
    : sql``;
  const categoryFilter = opts.categoryId
    ? sql`AND rc.id = ${opts.categoryId}`
    : sql``;
  const brandFilter = opts.brandId
    ? sql`AND COALESCE(p.brand_id, pp.brand_id) = ${opts.brandId}`
    : sql``;
  const zeroCostFilter = opts.excludeZeroCost
    ? sql`AND CAST(p.cost_price AS DECIMAL) > 0`
    : sql``;
  const zeroSellFilter = opts.excludeZeroSell
    ? sql`AND CAST(p.unit_price AS DECIMAL) > 0`
    : sql``;

  return sql`${locationFilter} ${categoryFilter} ${brandFilter} ${zeroCostFilter} ${zeroSellFilter}`;
}

/* ── Grouped valuation ── */
export async function getInventoryValuation(
  orgId: string,
  options: ValuationFilters = {},
) {
  const groupBy = options.groupBy || "category";

  let groupExpr: ReturnType<typeof sql>;
  switch (groupBy) {
    case "brand":
      groupExpr = sql`COALESCE(COALESCE(b.name, pb.name), 'No Brand')`;
      break;
    case "family":
      groupExpr = sql`COALESCE(f.name, 'No Family')`;
      break;
    case "location":
      groupExpr = sql`l.name`;
      break;
    default:
      groupExpr = sql`COALESCE(c.name, pc.name, 'Uncategorized')`;
      break;
  }

  const extraFilters = buildFilters(options);

  const rows: any[] = await db.execute(sql`
    SELECT
      ${groupExpr} AS group_name,
      COUNT(DISTINCT p.id)::int AS sku_count,
      COALESCE(SUM(i.stock_level), 0)::int AS total_units,
      COALESCE(SUM(i.stock_level * CAST(p.cost_price AS DECIMAL(14,2))), 0)::numeric AS cost_value,
      COALESCE(SUM(i.stock_level * CAST(p.unit_price AS DECIMAL(14,2))), 0)::numeric AS retail_value
    ${baseJoins(orgId)}
    ${baseWhere(orgId)}
    ${extraFilters}
    GROUP BY group_name
    ORDER BY cost_value DESC
  `);

  // Compute totals
  const totalsRow: any[] = await db.execute(sql`
    SELECT
      COUNT(DISTINCT p.id)::int AS sku_count,
      COALESCE(SUM(i.stock_level), 0)::int AS total_units,
      COALESCE(SUM(i.stock_level * CAST(p.cost_price AS DECIMAL(14,2))), 0)::numeric AS cost_value,
      COALESCE(SUM(i.stock_level * CAST(p.unit_price AS DECIMAL(14,2))), 0)::numeric AS retail_value,
      COUNT(DISTINCT CASE WHEN CAST(p.cost_price AS DECIMAL) = 0 THEN p.id END)::int AS zero_cost_count,
      COUNT(DISTINCT CASE WHEN CAST(p.unit_price AS DECIMAL) = 0 THEN p.id END)::int AS zero_sell_count,
      COALESCE(SUM(CASE WHEN CAST(p.unit_price AS DECIMAL) > 0 THEN i.stock_level * CAST(p.cost_price AS DECIMAL(14,2)) ELSE 0 END), 0)::numeric AS adj_cost_value,
      COALESCE(SUM(CASE WHEN CAST(p.unit_price AS DECIMAL) > 0 THEN i.stock_level * CAST(p.unit_price AS DECIMAL(14,2)) ELSE 0 END), 0)::numeric AS adj_retail_value
    ${baseJoins(orgId)}
    ${baseWhere(orgId)}
    ${extraFilters}
  `);

  const t = totalsRow[0] ?? {};
  const totalCost = Number(t.cost_value) || 0;
  const totalRetail = Number(t.retail_value) || 0;
  const potentialProfit = totalRetail - totalCost;
  const avgMarginPct = totalRetail > 0 ? (potentialProfit / totalRetail) * 100 : 0;

  const adjCost = Number(t.adj_cost_value) || 0;
  const adjRetail = Number(t.adj_retail_value) || 0;
  const adjProfit = adjRetail - adjCost;
  const adjustedMarginPct = adjRetail > 0 ? (adjProfit / adjRetail) * 100 : 0;

  const totals: ValuationTotals = {
    skuCount: Number(t.sku_count) || 0,
    totalUnits: Number(t.total_units) || 0,
    costValue: totalCost,
    retailValue: totalRetail,
    potentialProfit,
    avgMarginPct: Math.round(avgMarginPct * 10) / 10,
    adjustedMarginPct: Math.round(adjustedMarginPct * 10) / 10,
    adjustedRetailValue: adjRetail,
    adjustedCostValue: adjCost,
    zeroCostCount: Number(t.zero_cost_count) || 0,
    zeroSellCount: Number(t.zero_sell_count) || 0,
  };

  // For family grouping, get top categories within "No Family"
  let familyTopCategories: string | undefined;
  if (groupBy === "family") {
    const noFamilyRow = rows.find((r: any) => r.group_name === "No Family");
    if (noFamilyRow) {
      const catRows: any[] = await db.execute(sql`
        SELECT COALESCE(c.name, pc.name, 'Uncategorized') AS cat_name,
          COALESCE(SUM(i.stock_level * CAST(p.cost_price AS DECIMAL(14,2))), 0)::numeric AS cv
        ${baseJoins(orgId)}
        ${baseWhere(orgId)}
          AND f.id IS NULL
        ${extraFilters}
        GROUP BY cat_name
        ORDER BY cv DESC
        LIMIT 5
      `);
      familyTopCategories = catRows.map((r: any) => r.cat_name).join(", ");
    }
  }

  const groups: ValuationGroup[] = rows.map((r: any) => {
    const cv = Number(r.cost_value) || 0;
    const rv = Number(r.retail_value) || 0;
    const margin = rv > 0 ? ((rv - cv) / rv) * 100 : 0;
    const group: ValuationGroup = {
      groupName: r.group_name ?? "Unknown",
      skuCount: Number(r.sku_count) || 0,
      totalUnits: Number(r.total_units) || 0,
      costValue: cv,
      retailValue: rv,
      marginPct: Math.round(margin * 10) / 10,
      pctOfTotal: totalCost > 0 ? Math.round((cv / totalCost) * 1000) / 10 : 0,
    };
    if (r.group_name === "No Family" && familyTopCategories) {
      group.topCategories = familyTopCategories;
    }
    return group;
  });

  return { totals, groups };
}

/* ── Detail drill-down ── */
export async function getInventoryValuationDetail(
  orgId: string,
  options: {
    groupBy: GroupByOption;
    groupName: string;
    locationId?: string;
    cursor?: string;
    limit?: number;
    categoryId?: string;
    brandId?: string;
    excludeZeroCost?: boolean;
    excludeZeroSell?: boolean;
  },
) {
  const limit = Math.min(options.limit ?? 50, 200);
  const groupBy = options.groupBy || "category";

  let groupCondition: ReturnType<typeof sql>;
  switch (groupBy) {
    case "brand":
      if (options.groupName === "No Brand") {
        groupCondition = sql`AND b.id IS NULL AND pb.id IS NULL`;
      } else {
        groupCondition = sql`AND (b.name = ${options.groupName} OR pb.name = ${options.groupName})`;
      }
      break;
    case "family":
      if (options.groupName === "No Family") {
        groupCondition = sql`AND f.id IS NULL`;
      } else {
        groupCondition = sql`AND f.name = ${options.groupName}`;
      }
      break;
    case "location":
      groupCondition = sql`AND l.name = ${options.groupName}`;
      break;
    default:
      if (options.groupName === "Uncategorized") {
        groupCondition = sql`AND c.id IS NULL AND pc.id IS NULL`;
      } else {
        groupCondition = sql`AND (c.name = ${options.groupName} OR pc.name = ${options.groupName})`;
      }
      break;
  }

  const extraFilters = buildFilters(options);
  const cursorFilter = options.cursor ? sql`AND p.id > ${options.cursor}` : sql``;

  const rows: any[] = await db.execute(sql`
    SELECT
      p.id AS product_id,
      CASE WHEN p.parent_product_id IS NOT NULL
        THEN CONCAT(pp.name, ' \u2014 ', p.name)
        ELSE COALESCE(p.name, '')
      END AS product_name,
      COALESCE(p.sku, '') AS sku,
      SUM(i.stock_level)::int AS stock,
      CAST(p.cost_price AS DECIMAL(14,2))::numeric AS cost_price,
      CAST(p.unit_price AS DECIMAL(14,2))::numeric AS sell_price,
      (SUM(i.stock_level) * CAST(p.cost_price AS DECIMAL(14,2)))::numeric AS cost_value,
      (SUM(i.stock_level) * CAST(p.unit_price AS DECIMAL(14,2)))::numeric AS retail_value
    ${baseJoins(orgId)}
    ${baseWhere(orgId)}
    ${extraFilters}
    ${groupCondition}
    ${cursorFilter}
    GROUP BY p.id, p.name, pp.name, p.parent_product_id, p.sku, p.cost_price, p.unit_price
    ORDER BY cost_value DESC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const sliced = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? sliced[sliced.length - 1].product_id : null;

  const products: ValuationDetailProduct[] = sliced.map((r: any) => {
    const cv = Number(r.cost_value) || 0;
    const rv = Number(r.retail_value) || 0;
    const margin = rv > 0 ? ((rv - cv) / rv) * 100 : 0;
    return {
      productId: r.product_id,
      productName: r.product_name,
      sku: r.sku,
      stock: Number(r.stock) || 0,
      costPrice: Number(r.cost_price) || 0,
      sellPrice: Number(r.sell_price) || 0,
      costValue: cv,
      retailValue: rv,
      marginPct: Math.round(margin * 10) / 10,
    };
  });

  return { products, nextCursor, hasMore };
}
