import { db } from "@apex/database";
import { sql } from "drizzle-orm";

// ── Phase 8: Service Performance & Business Intelligence ──
// All KPIs derived from immutable source-of-truth records.
// Cost from stock_journal.unit_cost_snapshot at JOB_CARD_ISSUE time.
// Revenue from job_card_parts.unit_price (locked at estimation) and job_card_labor.line_total.
// Technician efficiency excludes WAITING_FOR_PARTS and READY_FOR_BAY from denominator.

// ── Types ──

export interface JobCardMargin {
  jobCardId: string;
  jobNo: string;
  locationId: string;
  technicianId: string | null;
  status: string;
  invoicedAt: string | null;
  laborRevenue: string;
  totalLaborHours: string;
  laborLineCount: number;
  partsRevenue: string;
  netPartsIssued: number;
  partsLineCount: number;
  partsCogs: string;
  totalRevenue: string;
  grossProfit: string;
  grossMarginPct: string;
  partsMarkupPct: string;
}

export interface TechnicianEfficiency {
  technicianId: string;
  technicianName: string;
  jobsCompleted: number;
  totalActiveWorkHours: string;
  avgActiveHoursPerJob: string;
  totalPartsWaitHours: string;
  totalBayQueueHours: string;
  avgTurnaroundHours: string;
  estimateAccuracyRatio: string | null;
  efficiencyPct: string | null;
}

export interface ServiceHistoryEntry {
  jobCardId: string;
  jobNo: string;
  status: string;
  locationName: string;
  customerName: string;
  customerPhone: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number | null;
  vehiclePlate: string | null;
  odometerReading: number | null;
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  grandTotal: string;
  createdAt: string;
  checkedInAt: string | null;
  completedAt: string | null;
  invoicedAt: string | null;
  closedAt: string | null;
}

export interface KPISummary {
  totalJobCards: number;
  completedJobCards: number;
  cancelledJobCards: number;
  avgGrossMarginPct: string;
  totalLaborRevenue: string;
  totalPartsRevenue: string;
  totalPartsCogs: string;
  totalGrossProfit: string;
  avgActiveWorkHours: string;
  avgTurnaroundHours: string;
}

// ── Job Card Margin Query ──

export async function getJobCardMargins(
  orgId: string,
  options: {
    locationId?: string;
    from?: string;
    to?: string;
    cursor?: string;
    limit?: number;
  } = {},
): Promise<{ data: JobCardMargin[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = options.limit ?? 50;

  const rows = await db.execute(sql`
    SELECT
      jc.id AS job_card_id,
      jc.job_no,
      jc.location_id,
      jc.assigned_technician_user_id AS technician_id,
      jc.status,
      jc.invoiced_at,

      -- Labor revenue
      COALESCE(labor.total_labor_revenue, 0)::numeric(12,2) AS labor_revenue,
      COALESCE(labor.total_labor_hours, 0)::numeric(6,2) AS total_labor_hours,
      COALESCE(labor.labor_line_count, 0)::int AS labor_line_count,

      -- Parts revenue (sell price × net issued)
      COALESCE(parts.total_parts_revenue, 0)::numeric(12,2) AS parts_revenue,
      COALESCE(parts.net_parts_issued, 0)::int AS net_parts_issued,
      COALESCE(parts.parts_line_count, 0)::int AS parts_line_count,

      -- Parts COGS (from journal snapshots)
      COALESCE(cogs.total_parts_cogs, 0)::numeric(12,2) AS parts_cogs,

      -- Derived
      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))::numeric(12,2)
        AS total_revenue,
      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))::numeric(12,2)
        AS gross_profit,

      CASE
        WHEN COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) > 0
        THEN ROUND(
          ((COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))
           / (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))
          ) * 100, 2)
        ELSE 0
      END AS gross_margin_pct,

      CASE
        WHEN COALESCE(cogs.total_parts_cogs, 0) > 0
        THEN ROUND(
          ((COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))
           / COALESCE(cogs.total_parts_cogs, 0)
          ) * 100, 2)
        ELSE 0
      END AS parts_markup_pct

    FROM job_cards jc

    LEFT JOIN LATERAL (
      SELECT
        SUM(jcl.line_total) AS total_labor_revenue,
        SUM(jcl.qty_hours)  AS total_labor_hours,
        COUNT(*)            AS labor_line_count
      FROM job_card_labor jcl
      WHERE jcl.job_card_id = jc.id
    ) labor ON TRUE

    LEFT JOIN LATERAL (
      SELECT
        SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total_parts_revenue,
        SUM(jcp.issued_qty - jcp.returned_qty) AS net_parts_issued,
        COUNT(*) AS parts_line_count
      FROM job_card_parts jcp
      WHERE jcp.job_card_id = jc.id
        AND (jcp.issued_qty - jcp.returned_qty) > 0
    ) parts ON TRUE

    LEFT JOIN LATERAL (
      SELECT
        SUM(-sj.change_quantity * COALESCE(sj.unit_cost_snapshot, 0)) AS total_parts_cogs
      FROM stock_journal sj
      WHERE sj.reference_id = jc.id
        AND sj.reference_type IN ('JOB_CARD_ISSUE', 'JOB_CARD_RETURN')
    ) cogs ON TRUE

    WHERE jc.org_id = ${orgId}
      AND jc.status != 'CANCELLED'
      ${options.locationId ? sql`AND jc.location_id = ${options.locationId}` : sql``}
      ${options.from ? sql`AND jc.invoiced_at >= ${options.from}::timestamptz` : sql``}
      ${options.to ? sql`AND jc.invoiced_at <= ${options.to}::timestamptz` : sql``}
      ${options.cursor ? sql`AND jc.id > ${options.cursor}` : sql``}

    ORDER BY jc.id ASC
    LIMIT ${limit + 1}
  `);

  const hasMore = rows.length > limit;
  const data = (hasMore ? rows.slice(0, limit) : rows) as any[];
  const nextCursor = hasMore ? data[data.length - 1].job_card_id : null;

  return {
    data: data.map((r) => ({
      jobCardId: r.job_card_id,
      jobNo: r.job_no,
      locationId: r.location_id,
      technicianId: r.technician_id,
      status: r.status,
      invoicedAt: r.invoiced_at,
      laborRevenue: r.labor_revenue,
      totalLaborHours: r.total_labor_hours,
      laborLineCount: r.labor_line_count,
      partsRevenue: r.parts_revenue,
      netPartsIssued: r.net_parts_issued,
      partsLineCount: r.parts_line_count,
      partsCogs: r.parts_cogs,
      totalRevenue: r.total_revenue,
      grossProfit: r.gross_profit,
      grossMarginPct: r.gross_margin_pct,
      partsMarkupPct: r.parts_markup_pct,
    })),
    nextCursor,
    hasMore,
  };
}

/**
 * Get single job card margin detail.
 */
export async function getJobCardMarginById(
  jobCardId: string,
  orgId: string,
): Promise<JobCardMargin | null> {
  const result = await getJobCardMargins(orgId, { limit: 1 });
  // Use direct query for single lookup
  const rows = await db.execute(sql`
    SELECT
      jc.id AS job_card_id,
      jc.job_no,
      jc.location_id,
      jc.assigned_technician_user_id AS technician_id,
      jc.status,
      jc.invoiced_at,

      COALESCE(labor.total_labor_revenue, 0)::numeric(12,2) AS labor_revenue,
      COALESCE(labor.total_labor_hours, 0)::numeric(6,2) AS total_labor_hours,
      COALESCE(labor.labor_line_count, 0)::int AS labor_line_count,

      COALESCE(parts.total_parts_revenue, 0)::numeric(12,2) AS parts_revenue,
      COALESCE(parts.net_parts_issued, 0)::int AS net_parts_issued,
      COALESCE(parts.parts_line_count, 0)::int AS parts_line_count,

      COALESCE(cogs.total_parts_cogs, 0)::numeric(12,2) AS parts_cogs,

      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))::numeric(12,2)
        AS total_revenue,
      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))::numeric(12,2)
        AS gross_profit,

      CASE
        WHEN COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) > 0
        THEN ROUND(
          ((COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))
           / (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))
          ) * 100, 2)
        ELSE 0
      END AS gross_margin_pct,

      CASE
        WHEN COALESCE(cogs.total_parts_cogs, 0) > 0
        THEN ROUND(
          ((COALESCE(parts.total_parts_revenue, 0) - COALESCE(cogs.total_parts_cogs, 0))
           / COALESCE(cogs.total_parts_cogs, 0)
          ) * 100, 2)
        ELSE 0
      END AS parts_markup_pct

    FROM job_cards jc

    LEFT JOIN LATERAL (
      SELECT SUM(jcl.line_total) AS total_labor_revenue,
             SUM(jcl.qty_hours) AS total_labor_hours,
             COUNT(*) AS labor_line_count
      FROM job_card_labor jcl WHERE jcl.job_card_id = jc.id
    ) labor ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total_parts_revenue,
             SUM(jcp.issued_qty - jcp.returned_qty) AS net_parts_issued,
             COUNT(*) AS parts_line_count
      FROM job_card_parts jcp
      WHERE jcp.job_card_id = jc.id AND (jcp.issued_qty - jcp.returned_qty) > 0
    ) parts ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(-sj.change_quantity * COALESCE(sj.unit_cost_snapshot, 0)) AS total_parts_cogs
      FROM stock_journal sj
      WHERE sj.reference_id = jc.id
        AND sj.reference_type IN ('JOB_CARD_ISSUE', 'JOB_CARD_RETURN')
    ) cogs ON TRUE

    WHERE jc.id = ${jobCardId} AND jc.org_id = ${orgId}
  `);

  if (rows.length === 0) return null;
  const r = rows[0] as any;

  return {
    jobCardId: r.job_card_id,
    jobNo: r.job_no,
    locationId: r.location_id,
    technicianId: r.technician_id,
    status: r.status,
    invoicedAt: r.invoiced_at,
    laborRevenue: r.labor_revenue,
    totalLaborHours: r.total_labor_hours,
    laborLineCount: r.labor_line_count,
    partsRevenue: r.parts_revenue,
    netPartsIssued: r.net_parts_issued,
    partsLineCount: r.parts_line_count,
    partsCogs: r.parts_cogs,
    totalRevenue: r.total_revenue,
    grossProfit: r.gross_profit,
    grossMarginPct: r.gross_margin_pct,
    partsMarkupPct: r.parts_markup_pct,
  };
}

// ── Technician Efficiency Query ──
// Uses job_card_state_log for accurate state duration tracking.
// LEAD() with deterministic tie-breaker: transitioned_at, created_at, id.
// Efficiency denominator: active_work ONLY (READY_FOR_BAY excluded).
// WAITING_FOR_PARTS excluded entirely from technician scoring.

export async function getTechnicianEfficiency(
  orgId: string,
  options: {
    locationId?: string;
    from?: string;
    to?: string;
  } = {},
): Promise<TechnicianEfficiency[]> {
  const rows = await db.execute(sql`
    WITH transitions AS (
      SELECT
        jcsl.job_card_id,
        jcsl.org_id,
        jcsl.to_status AS status,
        jcsl.transitioned_at AS entered_at,
        LEAD(jcsl.transitioned_at) OVER (
          PARTITION BY jcsl.job_card_id
          ORDER BY jcsl.transitioned_at, jcsl.created_at, jcsl.id
        ) AS exited_at
      FROM job_card_state_log jcsl
      WHERE jcsl.org_id = ${orgId}
    ),
    state_durations AS (
      SELECT
        t.job_card_id,
        t.org_id,
        t.status,
        EXTRACT(EPOCH FROM (t.exited_at - t.entered_at)) / 3600.0 AS duration_hours
      FROM transitions t
      WHERE t.exited_at IS NOT NULL
    ),
    job_durations AS (
      SELECT
        sd.job_card_id,
        sd.org_id,
        jc.assigned_technician_user_id AS technician_id,
        jc.completed_at,

        -- Active work time (IN_PROGRESS state only)
        SUM(CASE WHEN sd.status = 'IN_PROGRESS' THEN sd.duration_hours ELSE 0 END) AS active_work_hours,

        -- Parts waiting time (completely excluded from efficiency)
        SUM(CASE WHEN sd.status = 'WAITING_FOR_PARTS' THEN sd.duration_hours ELSE 0 END) AS parts_wait_hours,

        -- Bay queue time (separate workshop flow KPI, not technician)
        SUM(CASE WHEN sd.status = 'READY_FOR_BAY' THEN sd.duration_hours ELSE 0 END) AS bay_queue_hours,

        -- Total turnaround (CHECKED_IN through WORK_COMPLETED)
        SUM(CASE WHEN sd.status IN (
            'CHECKED_IN','ESTIMATING','APPROVED',
            'WAITING_FOR_PARTS','READY_FOR_BAY','IN_PROGRESS'
          ) THEN sd.duration_hours ELSE 0 END) AS total_turnaround_hours

      FROM state_durations sd
      JOIN job_cards jc ON jc.id = sd.job_card_id
      WHERE jc.assigned_technician_user_id IS NOT NULL
        AND jc.completed_at IS NOT NULL
        ${options.locationId ? sql`AND jc.location_id = ${options.locationId}` : sql``}
        ${options.from ? sql`AND jc.completed_at >= ${options.from}::timestamptz` : sql``}
        ${options.to ? sql`AND jc.completed_at <= ${options.to}::timestamptz` : sql``}
      GROUP BY sd.job_card_id, sd.org_id, jc.assigned_technician_user_id, jc.completed_at
    ),
    labor_estimates AS (
      SELECT
        jcl.job_card_id,
        SUM(jcl.qty_hours)       AS actual_labor_hours,
        SUM(so.estimated_hours)  AS estimated_labor_hours
      FROM job_card_labor jcl
      JOIN service_operations so ON so.id = jcl.service_operation_id
      GROUP BY jcl.job_card_id
    )
    SELECT
      jd.technician_id,
      COALESCE(u.email, 'Unknown') AS technician_name,

      COUNT(*)::int AS jobs_completed,

      -- Active work time (fair metric)
      ROUND(SUM(jd.active_work_hours)::numeric, 2) AS total_active_work_hours,
      ROUND(AVG(jd.active_work_hours)::numeric, 2) AS avg_active_hours_per_job,

      -- Waiting time (excluded from efficiency score)
      ROUND(SUM(jd.parts_wait_hours)::numeric, 2) AS total_parts_wait_hours,
      ROUND(SUM(jd.bay_queue_hours)::numeric, 2) AS total_bay_queue_hours,

      -- Total turnaround
      ROUND(AVG(jd.total_turnaround_hours)::numeric, 2) AS avg_turnaround_hours,

      -- Estimate accuracy
      CASE
        WHEN SUM(le.estimated_labor_hours) > 0
        THEN ROUND((SUM(le.actual_labor_hours) / SUM(le.estimated_labor_hours))::numeric, 2)
        ELSE NULL
      END AS estimate_accuracy_ratio,

      -- Efficiency: active_work / active_work ONLY (no bay queue, no parts wait)
      CASE
        WHEN SUM(jd.active_work_hours) > 0
        THEN ROUND((SUM(jd.active_work_hours) / SUM(jd.active_work_hours))::numeric * 100, 2)
        ELSE NULL
      END AS efficiency_pct

    FROM job_durations jd
    LEFT JOIN labor_estimates le ON le.job_card_id = jd.job_card_id
    LEFT JOIN users u ON u.id = jd.technician_id
    WHERE jd.completed_at IS NOT NULL
    GROUP BY jd.technician_id, u.email
    ORDER BY total_active_work_hours DESC
  `);

  return (rows as any[]).map((r) => ({
    technicianId: r.technician_id,
    technicianName: r.technician_name,
    jobsCompleted: r.jobs_completed,
    totalActiveWorkHours: r.total_active_work_hours,
    avgActiveHoursPerJob: r.avg_active_hours_per_job,
    totalPartsWaitHours: r.total_parts_wait_hours,
    totalBayQueueHours: r.total_bay_queue_hours,
    avgTurnaroundHours: r.avg_turnaround_hours,
    estimateAccuracyRatio: r.estimate_accuracy_ratio,
    efficiencyPct: r.efficiency_pct,
  }));
}

// ── Service History Query ──

export async function getServiceHistoryByVehicle(
  vehicleId: string,
  orgId: string,
): Promise<ServiceHistoryEntry[]> {
  const rows = await db.execute(sql`
    SELECT
      jc.id AS job_card_id,
      jc.job_no,
      jc.status,
      l.name AS location_name,
      c.name AS customer_name,
      c.phone AS customer_phone,
      cv.make AS vehicle_make,
      cv.model AS vehicle_model,
      cv.year AS vehicle_year,
      cv.plate_no AS vehicle_plate,
      jc.odometer_reading,

      COALESCE(labor.total_labor_revenue, 0)::numeric(12,2) AS total_labor_revenue,
      COALESCE(parts.total_parts_revenue, 0)::numeric(12,2) AS total_parts_revenue,
      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))::numeric(12,2) AS grand_total,

      jc.created_at,
      jc.checked_in_at,
      jc.completed_at,
      jc.invoiced_at,
      jc.closed_at

    FROM job_cards jc
    JOIN customers c ON c.id = jc.customer_id
    JOIN customer_vehicles cv ON cv.id = jc.customer_vehicle_id
    JOIN locations l ON l.id = jc.location_id

    LEFT JOIN LATERAL (
      SELECT SUM(jcl.line_total) AS total_labor_revenue
      FROM job_card_labor jcl WHERE jcl.job_card_id = jc.id
    ) labor ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total_parts_revenue
      FROM job_card_parts jcp
      WHERE jcp.job_card_id = jc.id AND (jcp.issued_qty - jcp.returned_qty) > 0
    ) parts ON TRUE

    WHERE jc.customer_vehicle_id = ${vehicleId}
      AND jc.org_id = ${orgId}
      AND jc.status != 'CANCELLED'

    ORDER BY jc.created_at DESC
  `);

  return (rows as any[]).map((r) => ({
    jobCardId: r.job_card_id,
    jobNo: r.job_no,
    status: r.status,
    locationName: r.location_name,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    vehicleMake: r.vehicle_make,
    vehicleModel: r.vehicle_model,
    vehicleYear: r.vehicle_year,
    vehiclePlate: r.vehicle_plate,
    odometerReading: r.odometer_reading,
    totalLaborRevenue: r.total_labor_revenue,
    totalPartsRevenue: r.total_parts_revenue,
    grandTotal: r.grand_total,
    createdAt: r.created_at,
    checkedInAt: r.checked_in_at,
    completedAt: r.completed_at,
    invoicedAt: r.invoiced_at,
    closedAt: r.closed_at,
  }));
}

export async function getServiceHistoryByCustomer(
  customerId: string,
  orgId: string,
): Promise<ServiceHistoryEntry[]> {
  const rows = await db.execute(sql`
    SELECT
      jc.id AS job_card_id,
      jc.job_no,
      jc.status,
      l.name AS location_name,
      c.name AS customer_name,
      c.phone AS customer_phone,
      cv.make AS vehicle_make,
      cv.model AS vehicle_model,
      cv.year AS vehicle_year,
      cv.plate_no AS vehicle_plate,
      jc.odometer_reading,

      COALESCE(labor.total_labor_revenue, 0)::numeric(12,2) AS total_labor_revenue,
      COALESCE(parts.total_parts_revenue, 0)::numeric(12,2) AS total_parts_revenue,
      (COALESCE(labor.total_labor_revenue, 0) + COALESCE(parts.total_parts_revenue, 0))::numeric(12,2) AS grand_total,

      jc.created_at,
      jc.checked_in_at,
      jc.completed_at,
      jc.invoiced_at,
      jc.closed_at

    FROM job_cards jc
    JOIN customers c ON c.id = jc.customer_id
    JOIN customer_vehicles cv ON cv.id = jc.customer_vehicle_id
    JOIN locations l ON l.id = jc.location_id

    LEFT JOIN LATERAL (
      SELECT SUM(jcl.line_total) AS total_labor_revenue
      FROM job_card_labor jcl WHERE jcl.job_card_id = jc.id
    ) labor ON TRUE

    LEFT JOIN LATERAL (
      SELECT SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total_parts_revenue
      FROM job_card_parts jcp
      WHERE jcp.job_card_id = jc.id AND (jcp.issued_qty - jcp.returned_qty) > 0
    ) parts ON TRUE

    WHERE jc.customer_id = ${customerId}
      AND jc.org_id = ${orgId}
      AND jc.status != 'CANCELLED'

    ORDER BY jc.created_at DESC
  `);

  return (rows as any[]).map((r) => ({
    jobCardId: r.job_card_id,
    jobNo: r.job_no,
    status: r.status,
    locationName: r.location_name,
    customerName: r.customer_name,
    customerPhone: r.customer_phone,
    vehicleMake: r.vehicle_make,
    vehicleModel: r.vehicle_model,
    vehicleYear: r.vehicle_year,
    vehiclePlate: r.vehicle_plate,
    odometerReading: r.odometer_reading,
    totalLaborRevenue: r.total_labor_revenue,
    totalPartsRevenue: r.total_parts_revenue,
    grandTotal: r.grand_total,
    createdAt: r.created_at,
    checkedInAt: r.checked_in_at,
    completedAt: r.completed_at,
    invoicedAt: r.invoiced_at,
    closedAt: r.closed_at,
  }));
}

// ── KPI Summary Query ──

export async function getKPISummary(
  orgId: string,
  options: {
    locationId?: string;
    from?: string;
    to?: string;
  } = {},
): Promise<KPISummary> {
  const rows = await db.execute(sql`
    WITH margin_data AS (
      SELECT
        jc.id,
        jc.status,

        COALESCE(labor.total_labor_revenue, 0) AS labor_revenue,
        COALESCE(parts.total_parts_revenue, 0) AS parts_revenue,
        COALESCE(cogs.total_parts_cogs, 0) AS parts_cogs

      FROM job_cards jc

      LEFT JOIN LATERAL (
        SELECT SUM(jcl.line_total) AS total_labor_revenue
        FROM job_card_labor jcl WHERE jcl.job_card_id = jc.id
      ) labor ON TRUE

      LEFT JOIN LATERAL (
        SELECT SUM(jcp.unit_price * (jcp.issued_qty - jcp.returned_qty)) AS total_parts_revenue
        FROM job_card_parts jcp
        WHERE jcp.job_card_id = jc.id AND (jcp.issued_qty - jcp.returned_qty) > 0
      ) parts ON TRUE

      LEFT JOIN LATERAL (
        SELECT SUM(-sj.change_quantity * COALESCE(sj.unit_cost_snapshot, 0)) AS total_parts_cogs
        FROM stock_journal sj
        WHERE sj.reference_id = jc.id
          AND sj.reference_type IN ('JOB_CARD_ISSUE', 'JOB_CARD_RETURN')
      ) cogs ON TRUE

      WHERE jc.org_id = ${orgId}
        ${options.locationId ? sql`AND jc.location_id = ${options.locationId}` : sql``}
        ${options.from ? sql`AND jc.created_at >= ${options.from}::timestamptz` : sql``}
        ${options.to ? sql`AND jc.created_at <= ${options.to}::timestamptz` : sql``}
    ),
    time_data AS (
      SELECT
        jcsl.job_card_id,
        jcsl.to_status AS status,
        EXTRACT(EPOCH FROM (
          LEAD(jcsl.transitioned_at) OVER (
            PARTITION BY jcsl.job_card_id
            ORDER BY jcsl.transitioned_at, jcsl.created_at, jcsl.id
          ) - jcsl.transitioned_at
        )) / 3600.0 AS duration_hours
      FROM job_card_state_log jcsl
      WHERE jcsl.org_id = ${orgId}
    ),
    avg_times AS (
      SELECT
        ROUND(AVG(CASE WHEN td.status = 'IN_PROGRESS' THEN td.duration_hours END)::numeric, 2) AS avg_active,
        ROUND(AVG(CASE WHEN td.status IN (
          'CHECKED_IN','ESTIMATING','APPROVED',
          'WAITING_FOR_PARTS','READY_FOR_BAY','IN_PROGRESS'
        ) THEN td.duration_hours END)::numeric, 2) AS avg_turnaround
      FROM time_data td
      WHERE td.duration_hours IS NOT NULL
    )
    SELECT
      COUNT(*)::int AS total_job_cards,
      COUNT(*) FILTER (WHERE md.status IN ('WORK_COMPLETED','INVOICED','CLOSED'))::int AS completed_job_cards,
      COUNT(*) FILTER (WHERE md.status = 'CANCELLED')::int AS cancelled_job_cards,

      CASE
        WHEN SUM(md.labor_revenue + md.parts_revenue) > 0
        THEN ROUND(
          ((SUM(md.labor_revenue + md.parts_revenue - md.parts_cogs))
           / SUM(md.labor_revenue + md.parts_revenue)
          ) * 100, 2)::numeric(12,2)
        ELSE 0
      END AS avg_gross_margin_pct,

      COALESCE(SUM(md.labor_revenue), 0)::numeric(12,2) AS total_labor_revenue,
      COALESCE(SUM(md.parts_revenue), 0)::numeric(12,2) AS total_parts_revenue,
      COALESCE(SUM(md.parts_cogs), 0)::numeric(12,2) AS total_parts_cogs,
      COALESCE(SUM(md.labor_revenue + md.parts_revenue - md.parts_cogs), 0)::numeric(12,2) AS total_gross_profit,

      COALESCE(at.avg_active, 0) AS avg_active_work_hours,
      COALESCE(at.avg_turnaround, 0) AS avg_turnaround_hours

    FROM margin_data md
    CROSS JOIN avg_times at
    GROUP BY at.avg_active, at.avg_turnaround
  `);

  if (rows.length === 0) {
    return {
      totalJobCards: 0,
      completedJobCards: 0,
      cancelledJobCards: 0,
      avgGrossMarginPct: "0.00",
      totalLaborRevenue: "0.00",
      totalPartsRevenue: "0.00",
      totalPartsCogs: "0.00",
      totalGrossProfit: "0.00",
      avgActiveWorkHours: "0.00",
      avgTurnaroundHours: "0.00",
    };
  }

  const r = rows[0] as any;
  return {
    totalJobCards: r.total_job_cards,
    completedJobCards: r.completed_job_cards,
    cancelledJobCards: r.cancelled_job_cards,
    avgGrossMarginPct: r.avg_gross_margin_pct,
    totalLaborRevenue: r.total_labor_revenue,
    totalPartsRevenue: r.total_parts_revenue,
    totalPartsCogs: r.total_parts_cogs,
    totalGrossProfit: r.total_gross_profit,
    avgActiveWorkHours: r.avg_active_work_hours,
    avgTurnaroundHours: r.avg_turnaround_hours,
  };
}
