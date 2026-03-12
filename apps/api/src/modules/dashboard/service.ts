import { db } from "@apex/database";
import {
  inventory,
  products,
  locations,
} from "@apex/database/schema";
import { eq, and, lte, sql, type SQL } from "drizzle-orm";

// ── Types ──

export interface DashboardScope {
  locationId: string;
  locationName: string;
  isAllLocations: boolean;
}

export interface InventorySummary {
  totalSkus: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  belowReorder: number;
  totalReserved: number;
}

export interface ProcurementSummary {
  openPOs: number;
  draftPOs: number;
  awaitingReceiving: number;
}

export interface TransferSummary {
  openTransfers: number;
  inTransit: number;
  awaitingApproval: number;
}

export interface JobCardSummary {
  activeJobs: number;
  waitingForParts: number;
  inProgress: number;
  workCompleted: number;
}

export interface FinancialKPI {
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  totalGrossProfit: string;
  avgGrossMarginPct: string;
}

export interface LowStockItem {
  productId: string;
  productName: string;
  sku: string;
  category: string;
  stockLevel: number;
  reservedLevel: number;
  available: number;
  reorderPoint: number;
  locationName: string;
}

export interface RecentActivityEntry {
  id: string;
  productName: string;
  sku: string;
  changeQuantity: number;
  direction: string;
  referenceType: string;
  referenceNo: string | null;
  balanceAfter: number;
  locationName: string;
  actorName: string | null;
  createdAt: string;
}

export interface DashboardSummary {
  scope: DashboardScope;
  inventory: InventorySummary;
  procurement: ProcurementSummary | null;
  transfers: TransferSummary | null;
  jobCards: JobCardSummary | null;
  kpi: FinancialKPI | null;
  lowStockItems: LowStockItem[];
  recentActivity: RecentActivityEntry[];
}

// ── Helpers ──

const OPERATIONAL_ROLES = ["ADMIN", "MANAGER", "WAREHOUSE_STAFF"];
const FINANCIAL_ROLES = ["ADMIN", "MANAGER"];

function canSeeOperational(role: string): boolean {
  return OPERATIONAL_ROLES.includes(role);
}

function canSeeFinancial(role: string): boolean {
  return FINANCIAL_ROLES.includes(role);
}

// ── Query Functions ──

async function getInventorySummary(
  orgId: string,
  locationConditions: SQL[],
): Promise<InventorySummary> {
  const conditions: SQL[] = [
    eq(products.orgId, orgId),
    ...locationConditions,
  ];

  const [row] = await db
    .select({
      totalSkus: sql<number>`count(*)::int`,
      inStock: sql<number>`count(*) filter (where ${inventory.stockLevel} > ${inventory.reorderPoint})::int`,
      lowStock: sql<number>`count(*) filter (where ${inventory.stockLevel} > 0 and ${inventory.stockLevel} <= ${inventory.reorderPoint})::int`,
      outOfStock: sql<number>`count(*) filter (where ${inventory.stockLevel} = 0)::int`,
      belowReorder: sql<number>`count(*) filter (where ${inventory.stockLevel} <= ${inventory.reorderPoint})::int`,
      totalReserved: sql<number>`coalesce(sum(${inventory.reservedLevel}), 0)::int`,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .where(and(...conditions));

  return row!;
}

async function getProcurementSummary(
  orgId: string,
  locationId?: string,
): Promise<ProcurementSummary | null> {
  try {
    const rows = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status IN ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED'))::int AS open_pos,
        count(*) FILTER (WHERE status = 'DRAFT')::int AS draft_pos,
        count(*) FILTER (WHERE status IN ('SUBMITTED', 'PARTIALLY_RECEIVED'))::int AS awaiting_receiving
      FROM purchase_orders
      WHERE org_id = ${orgId}
        ${locationId ? sql`AND destination_location_id = ${locationId}` : sql``}
    `);

    const r = (rows[0] as any) ?? {};
    return {
      openPOs: r.open_pos ?? 0,
      draftPOs: r.draft_pos ?? 0,
      awaitingReceiving: r.awaiting_receiving ?? 0,
    };
  } catch {
    // Table may not exist yet (not migrated)
    return null;
  }
}

async function getTransferSummary(
  orgId: string,
  locationId?: string,
): Promise<TransferSummary> {
  const rows = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status NOT IN ('RECEIVED', 'CANCELLED', 'CLOSED_WITH_VARIANCE'))::int AS open_transfers,
      count(*) FILTER (WHERE status = 'DISPATCHED')::int AS in_transit,
      count(*) FILTER (WHERE status = 'DRAFT')::int AS awaiting_approval
    FROM stock_transfers
    WHERE org_id = ${orgId}
      ${locationId ? sql`AND (source_location_id = ${locationId} OR destination_location_id = ${locationId})` : sql``}
  `);

  const r = (rows[0] as any) ?? {};
  return {
    openTransfers: r.open_transfers ?? 0,
    inTransit: r.in_transit ?? 0,
    awaitingApproval: r.awaiting_approval ?? 0,
  };
}

async function getJobCardSummary(
  orgId: string,
  locationId?: string,
): Promise<JobCardSummary | null> {
  try {
    const rows = await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status NOT IN ('CLOSED', 'CANCELLED'))::int AS active_jobs,
        count(*) FILTER (WHERE status = 'WAITING_FOR_PARTS')::int AS waiting_for_parts,
        count(*) FILTER (WHERE status IN ('READY_FOR_BAY', 'IN_PROGRESS'))::int AS in_progress,
        count(*) FILTER (WHERE status = 'WORK_COMPLETED')::int AS work_completed
      FROM job_cards
      WHERE org_id = ${orgId}
        ${locationId ? sql`AND location_id = ${locationId}` : sql``}
    `);

    const r = (rows[0] as any) ?? {};
    return {
      activeJobs: r.active_jobs ?? 0,
      waitingForParts: r.waiting_for_parts ?? 0,
      inProgress: r.in_progress ?? 0,
      workCompleted: r.work_completed ?? 0,
    };
  } catch {
    // Table may not exist yet (not migrated)
    return null;
  }
}

async function getFinancialKPI(
  orgId: string,
  locationId?: string,
): Promise<FinancialKPI | null> {
  try {
  // Lightweight version of the full KPI summary — just financial totals
  const rows = await db.execute(sql`
    SELECT
      COALESCE(SUM(labor.total), 0)::numeric(12,2) AS total_labor_revenue,
      COALESCE(SUM(parts.total), 0)::numeric(12,2) AS total_parts_revenue,
      COALESCE(SUM(
        COALESCE(labor.total, 0) + COALESCE(parts.total, 0) - COALESCE(cogs.total, 0)
      ), 0)::numeric(12,2) AS total_gross_profit,
      CASE
        WHEN SUM(COALESCE(labor.total, 0) + COALESCE(parts.total, 0)) > 0
        THEN ROUND(
          (SUM(COALESCE(labor.total, 0) + COALESCE(parts.total, 0) - COALESCE(cogs.total, 0))
           / SUM(COALESCE(labor.total, 0) + COALESCE(parts.total, 0))
          ) * 100, 1)::numeric(5,1)
        ELSE 0
      END AS avg_gross_margin_pct
    FROM job_cards jc
    LEFT JOIN LATERAL (
      SELECT SUM(jcl.line_total) AS total
      FROM job_card_labor jcl WHERE jcl.job_card_id = jc.id
    ) labor ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total
      FROM job_card_parts jcp
      WHERE jcp.job_card_id = jc.id AND (jcp.issued_qty - jcp.returned_qty) > 0
    ) parts ON TRUE
    LEFT JOIN LATERAL (
      SELECT SUM(-sj.change_quantity * COALESCE(sj.unit_cost_snapshot, 0)) AS total
      FROM stock_journal sj
      WHERE sj.reference_id = jc.id
        AND sj.reference_type IN ('JOB_CARD_ISSUE', 'JOB_CARD_RETURN')
    ) cogs ON TRUE
    WHERE jc.org_id = ${orgId}
      AND jc.status IN ('WORK_COMPLETED', 'INVOICED', 'CLOSED')
      ${locationId ? sql`AND jc.location_id = ${locationId}` : sql``}
  `);

  if (rows.length === 0) {
    return {
      totalLaborRevenue: "0.00",
      totalPartsRevenue: "0.00",
      totalGrossProfit: "0.00",
      avgGrossMarginPct: "0.0",
    };
  }

  const r = rows[0] as any;
  return {
    totalLaborRevenue: r.total_labor_revenue,
    totalPartsRevenue: r.total_parts_revenue,
    totalGrossProfit: r.total_gross_profit,
    avgGrossMarginPct: r.avg_gross_margin_pct,
  };
  } catch {
    // Tables may not exist yet (job_cards not migrated)
    return null;
  }
}

async function getLowStockItems(
  orgId: string,
  locationConditions: SQL[],
  limit = 10,
): Promise<LowStockItem[]> {
  const conditions: SQL[] = [
    eq(products.orgId, orgId),
    ...locationConditions,
    lte(inventory.stockLevel, inventory.reorderPoint),
  ];

  const rows = await db
    .select({
      productId: products.id,
      productName: products.name,
      sku: products.sku,
      category: products.category,
      stockLevel: inventory.stockLevel,
      reservedLevel: inventory.reservedLevel,
      available: sql<number>`(${inventory.stockLevel} - ${inventory.reservedLevel})`.as("available"),
      reorderPoint: inventory.reorderPoint,
      locationName: locations.name,
    })
    .from(inventory)
    .innerJoin(products, eq(inventory.productId, products.id))
    .innerJoin(locations, eq(inventory.locationId, locations.id))
    .where(and(...conditions))
    .orderBy(
      // Most urgent first: lowest available stock relative to reorder point
      sql`(${inventory.stockLevel} - ${inventory.reservedLevel}) ASC`,
      products.name,
    )
    .limit(limit);

  return rows;
}

async function getRecentActivity(
  orgId: string,
  locationId: string | undefined,
  limit = 15,
): Promise<RecentActivityEntry[]> {
  // Join to stock_transfers for reference numbers (exists in DB).
  // purchase_orders, job_cards, sales may not be migrated yet —
  // use conditional LEFT JOINs only for tables known to exist.
  const rows = await db.execute(sql`
    SELECT
      sj.id,
      p.name AS product_name,
      p.sku,
      sj.change_quantity,
      CASE WHEN sj.change_quantity >= 0 THEN 'IN' ELSE 'OUT' END AS direction,
      sj.reference_type,
      sj.balance_after,
      l.name AS location_name,
      u.full_name AS actor_name,
      st.transfer_no::text AS reference_no,
      sj.created_at
    FROM stock_journal sj
    INNER JOIN products p ON sj.product_id = p.id
    INNER JOIN locations l ON sj.location_id = l.id
    LEFT JOIN users u ON sj.user_id = u.id
    LEFT JOIN stock_transfers st
      ON sj.reference_id = st.id
      AND sj.reference_type IN ('TRANSFER_IN', 'TRANSFER_OUT')
    WHERE sj.org_id = ${orgId}
      ${locationId ? sql`AND sj.location_id = ${locationId}` : sql``}
    ORDER BY sj.created_at DESC
    LIMIT ${limit}
  `);

  return (rows as any[]).map((r) => ({
    id: r.id,
    productName: r.product_name,
    sku: r.sku,
    changeQuantity: r.change_quantity,
    direction: r.direction,
    referenceType: r.reference_type,
    referenceNo: r.reference_no,
    balanceAfter: r.balance_after,
    locationName: r.location_name,
    actorName: r.actor_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
  }));
}

// ── Main Aggregator ──

export async function getDashboardSummary(
  orgId: string,
  locationId: string,
  role: string,
  allLocations: boolean,
): Promise<DashboardSummary> {
  // Resolve scope
  const effectiveLocationId = allLocations ? undefined : locationId;

  // Get location name for scope display
  let locationName = "All Locations";
  if (!allLocations) {
    const [loc] = await db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.id, locationId));
    locationName = loc?.name ?? "Unknown";
  }

  const scope: DashboardScope = {
    locationId: allLocations ? "" : locationId,
    locationName,
    isAllLocations: allLocations,
  };

  // Build inventory location conditions
  const inventoryLocationConditions: SQL[] = effectiveLocationId
    ? [eq(inventory.locationId, effectiveLocationId)]
    : [];

  // Fire all queries in parallel — role-gate at the query level
  const [
    inventorySummary,
    procurementSummary,
    transferSummary,
    jobCardSummary,
    financialKPI,
    lowStockItems,
    recentActivity,
  ] = await Promise.all([
    // Always fetch inventory summary
    getInventorySummary(orgId, inventoryLocationConditions),

    // Procurement: only for operational roles
    canSeeOperational(role)
      ? getProcurementSummary(orgId, effectiveLocationId)
      : Promise.resolve(null),

    // Transfers: only for operational roles
    canSeeOperational(role)
      ? getTransferSummary(orgId, effectiveLocationId)
      : Promise.resolve(null),

    // Job cards: only for operational roles
    canSeeOperational(role)
      ? getJobCardSummary(orgId, effectiveLocationId)
      : Promise.resolve(null),

    // Financial KPI: only for ADMIN/MANAGER
    canSeeFinancial(role)
      ? getFinancialKPI(orgId, effectiveLocationId)
      : Promise.resolve(null),

    // Low stock items: for all roles (inventory awareness)
    getLowStockItems(orgId, inventoryLocationConditions, 10),

    // Recent activity: for all roles
    getRecentActivity(orgId, effectiveLocationId, 15),
  ]);

  return {
    scope,
    inventory: inventorySummary,
    procurement: procurementSummary,
    transfers: transferSummary,
    jobCards: jobCardSummary,
    kpi: financialKPI,
    lowStockItems,
    recentActivity,
  };
}
