import { db } from "@apex/database";
import { technicians } from "@apex/database/schema";
import { eq, and, sql, ilike, inArray } from "drizzle-orm";

/* ── Types ── */
export interface CreateTechnicianInput {
  name: string;
  nickname?: string;
  role?: string;
  phone?: string;
  commissionType?: string;
  commissionRate?: number;
  commissionRateAlt?: number;
  locationId?: string | null;
}

export interface UpdateTechnicianInput extends Partial<CreateTechnicianInput> {
  isActive?: boolean;
}

/* ── List ── */
export async function listTechnicians(orgId: string, opts: { active?: boolean; locationId?: string } = {}) {
  const conditions = [eq(technicians.orgId, orgId)];
  if (opts.active !== undefined) conditions.push(eq(technicians.isActive, opts.active));
  if (opts.locationId) conditions.push(eq(technicians.locationId, opts.locationId));

  const rows = await db
    .select()
    .from(technicians)
    .where(and(...conditions))
    .orderBy(technicians.name);

  return rows.map(mapRow);
}

/* ── Get one ── */
export async function getTechnician(id: string, orgId: string) {
  const rows = await db
    .select()
    .from(technicians)
    .where(and(eq(technicians.id, id), eq(technicians.orgId, orgId)));
  return rows[0] ? mapRow(rows[0]) : null;
}

/* ── Create ── */
export async function createTechnician(input: CreateTechnicianInput, orgId: string) {
  const [row] = await db
    .insert(technicians)
    .values({
      orgId,
      name: input.name,
      nickname: input.nickname ?? input.name.toUpperCase(),
      role: input.role ?? "mechanic",
      phone: input.phone,
      commissionType: input.commissionType ?? "percentage",
      commissionRate: String(input.commissionRate ?? 0),
      commissionRateAlt: input.commissionRateAlt != null ? String(input.commissionRateAlt) : null,
      locationId: input.locationId ?? null,
    })
    .returning();
  return mapRow(row);
}

/* ── Update ── */
export async function updateTechnician(id: string, input: UpdateTechnicianInput, orgId: string) {
  const updates: Record<string, any> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.nickname !== undefined) updates.nickname = input.nickname;
  if (input.role !== undefined) updates.role = input.role;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.commissionType !== undefined) updates.commissionType = input.commissionType;
  if (input.commissionRate !== undefined) updates.commissionRate = String(input.commissionRate);
  if (input.commissionRateAlt !== undefined) updates.commissionRateAlt = input.commissionRateAlt != null ? String(input.commissionRateAlt) : null;
  if (input.locationId !== undefined) updates.locationId = input.locationId || null;
  if (input.isActive !== undefined) updates.isActive = input.isActive;

  if (Object.keys(updates).length === 0) throw new Error("No fields to update");

  const [row] = await db
    .update(technicians)
    .set(updates)
    .where(and(eq(technicians.id, id), eq(technicians.orgId, orgId)))
    .returning();

  if (!row) throw new Error("Technician not found");
  return mapRow(row);
}

/* ── Batch update ── */
export async function batchUpdateTechnicians(
  orgId: string,
  ids: string[],
  updates: { locationId?: string; commissionRate?: number; commissionType?: string },
) {
  if (ids.length === 0) return { updated: 0 };

  const setFields: Record<string, any> = {};
  if (updates.locationId !== undefined) setFields.locationId = updates.locationId;
  if (updates.commissionRate !== undefined) setFields.commissionRate = String(updates.commissionRate);
  if (updates.commissionType !== undefined) setFields.commissionType = updates.commissionType;

  if (Object.keys(setFields).length === 0) return { updated: 0 };

  const result = await db
    .update(technicians)
    .set(setFields)
    .where(and(eq(technicians.orgId, orgId), inArray(technicians.id, ids)))
    .returning({ id: technicians.id });

  return { updated: result.length };
}

/* ── Soft delete ── */
export async function deactivateTechnician(id: string, orgId: string) {
  const [row] = await db
    .update(technicians)
    .set({ isActive: false })
    .where(and(eq(technicians.id, id), eq(technicians.orgId, orgId)))
    .returning();

  if (!row) throw new Error("Technician not found");
  return mapRow(row);
}

/* ── Commission calculation ── */
export async function calculateCommissions(
  orgId: string,
  opts: { from: string; to: string; locationId?: string },
) {
  const locationFilter = opts.locationId ? sql`AND s.location_id = ${opts.locationId}` : sql``;
  const hsLocationFilter = opts.locationId ? sql`AND hs.location_id = ${opts.locationId}` : sql``;

  // Step 1: per-branch shop labor revenue for the period (live + historical)
  const branchShopRows: any[] = await db.execute(sql`
    SELECT branch_id, SUM(revenue) AS total FROM (
      SELECT s.location_id AS branch_id, SUM(sl.line_total::numeric) AS revenue
      FROM sale_lines sl
      INNER JOIN sales s ON s.id = sl.sale_id
      INNER JOIN products p ON p.id = sl.product_id
      WHERE s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
        AND s.completed_at >= ${opts.from}::timestamptz
        AND s.completed_at <= ${opts.to}::timestamptz
        AND p.track_inventory = false
        AND (p.name ILIKE '%labor%' OR EXISTS (
          SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.name ILIKE '%labor%'
        ))
        ${locationFilter}
      GROUP BY s.location_id
      UNION ALL
      SELECT hs.location_id AS branch_id, SUM(hs.quantity * hs.unit_price::numeric) AS revenue
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.movement_date >= ${opts.from}::timestamptz
        AND hs.movement_date <= ${opts.to}::timestamptz
        AND hs.technician_id IS NOT NULL
        AND hs.unit_price::numeric > 0
        ${hsLocationFilter}
      GROUP BY hs.location_id
    ) combined
    GROUP BY branch_id
  `);
  const branchLaborMap = new Map<string, number>();
  let shopTotalLabor = 0;
  for (const r of branchShopRows) {
    const amt = parseFloat(r.total) || 0;
    branchLaborMap.set(r.branch_id, (branchLaborMap.get(r.branch_id) || 0) + amt);
    shopTotalLabor += amt;
  }

  // Step 2: per-technician revenue split by fixed vs percentage commission
  const techRows: any[] = await db.execute(sql`
    SELECT technician_id,
      SUM(job_count)::int AS job_count,
      SUM(total_revenue) AS total_revenue,
      SUM(pct_revenue) AS pct_revenue,
      SUM(fixed_commission) AS fixed_commission
    FROM (
      -- Live POS sales
      SELECT
        sl.technician_id,
        COUNT(DISTINCT sl.sale_id)::int AS job_count,
        COALESCE(SUM(sl.line_total::numeric), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN p.commission_amount IS NULL THEN sl.line_total::numeric ELSE 0 END), 0) AS pct_revenue,
        COALESCE(SUM(CASE WHEN p.commission_amount IS NOT NULL THEN sl.quantity * p.commission_amount::numeric ELSE 0 END), 0) AS fixed_commission
      FROM sale_lines sl
      INNER JOIN sales s ON s.id = sl.sale_id
      INNER JOIN products p ON p.id = sl.product_id
      WHERE s.org_id = ${orgId}
        AND s.status IN ('COMPLETED', 'PARTIALLY_REFUNDED')
        AND s.completed_at >= ${opts.from}::timestamptz
        AND s.completed_at <= ${opts.to}::timestamptz
        AND p.track_inventory = false
        AND sl.technician_id IS NOT NULL
        AND (p.name ILIKE '%labor%' OR EXISTS (
          SELECT 1 FROM categories c WHERE c.id = p.category_id AND c.name ILIKE '%labor%'
        ))
        ${locationFilter}
      GROUP BY sl.technician_id
      UNION ALL
      -- Historical sales: technician_id is the indicator
      SELECT
        hs.technician_id,
        COUNT(DISTINCT hs.reason_reference)::int AS job_count,
        COALESCE(SUM(hs.quantity * hs.unit_price::numeric), 0) AS total_revenue,
        COALESCE(SUM(CASE WHEN p.commission_amount IS NULL THEN hs.quantity * hs.unit_price::numeric ELSE 0 END), 0) AS pct_revenue,
        COALESCE(SUM(CASE WHEN p.commission_amount IS NOT NULL THEN hs.quantity * p.commission_amount::numeric ELSE 0 END), 0) AS fixed_commission
      FROM historical_sales hs
      INNER JOIN products p ON p.id = hs.product_id
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.movement_date >= ${opts.from}::timestamptz
        AND hs.movement_date <= ${opts.to}::timestamptz
        AND hs.technician_id IS NOT NULL
        AND (hs.unit_price::numeric > 0 OR p.commission_amount IS NOT NULL)
        ${hsLocationFilter}
      GROUP BY hs.technician_id
    ) combined
    GROUP BY technician_id
  `);

  // Step 3: get all active technicians
  const techs = await db
    .select()
    .from(technicians)
    .where(and(eq(technicians.orgId, orgId), eq(technicians.isActive, true)));

  // Step 4: calculate per-tech commission (fixed product rates + technician rate)
  const results = techs.map((tech) => {
    const rev = techRows.find((r: any) => r.technician_id === tech.id);
    const totalRevenue = parseFloat(rev?.total_revenue) || 0;
    const pctRevenue = parseFloat(rev?.pct_revenue) || 0;
    const fixedCommission = parseFloat(rev?.fixed_commission) || 0;
    const jobCount = rev?.job_count ?? 0;
    const rate = parseFloat(tech.commissionRate ?? "0");
    const rateAlt = parseFloat(tech.commissionRateAlt ?? "0");

    // Percentage-based commission (on revenue from items WITHOUT product commission_amount)
    let rateCommission = 0;
    let rateFormula = "";

    switch (tech.commissionType) {
      case "percentage":
        rateCommission = pctRevenue * (rate / 100);
        rateFormula = `${rate}% \u00D7 \u20B1${pctRevenue.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
        break;

      case "higher_of": {
        const ownPct = pctRevenue * (rate / 100);
        // Use technician's assigned branch shop total (fall back to all-store if unassigned)
        const branchTotal = tech.locationId
          ? (branchLaborMap.get(tech.locationId) ?? 0)
          : shopTotalLabor;
        const shopPct = branchTotal * (rateAlt / 100);
        rateCommission = Math.max(ownPct, shopPct);
        const branchLabel = tech.locationId ? "branch" : "all stores";
        rateFormula = rateCommission === ownPct
          ? `${rate}% own (\u20B1${ownPct.toFixed(2)}) > ${rateAlt}% ${branchLabel} (\u20B1${shopPct.toFixed(2)})`
          : `${rateAlt}% ${branchLabel} (\u20B1${shopPct.toFixed(2)}) > ${rate}% own (\u20B1${ownPct.toFixed(2)})`;
        break;
      }

      case "fixed_per_job":
        rateCommission = jobCount * rate;
        rateFormula = `${jobCount} jobs \u00D7 \u20B1${rate.toFixed(2)}`;
        break;

      default:
        rateFormula = "Unknown type";
    }

    const totalCommission = fixedCommission + rateCommission;
    const parts: string[] = [];
    if (fixedCommission > 0) parts.push(`Fixed: \u20B1${fixedCommission.toFixed(2)}`);
    if (rateCommission > 0) parts.push(`Rate: \u20B1${rateCommission.toFixed(2)} (${rateFormula})`);
    const formula = parts.length > 0 ? parts.join(" + ") : rateFormula || "\u2014";

    return {
      technicianId: tech.id,
      name: tech.name,
      nickname: tech.nickname,
      role: tech.role,
      locationId: tech.locationId,
      commissionType: tech.commissionType,
      commissionRate: rate,
      commissionRateAlt: rateAlt || null,
      jobCount,
      ownLaborRevenue: Math.round(totalRevenue * 100) / 100,
      shopTotalLabor: Math.round(shopTotalLabor * 100) / 100,
      fixedCommission: Math.round(fixedCommission * 100) / 100,
      rateCommission: Math.round(rateCommission * 100) / 100,
      commission: Math.round(totalCommission * 100) / 100,
      formula,
    };
  });

  const totalCommission = results.reduce((s, r) => s + r.commission, 0);

  return {
    data: results.sort((a, b) => b.commission - a.commission),
    summary: {
      shopTotalLabor: Math.round(shopTotalLabor * 100) / 100,
      totalCommission: Math.round(totalCommission * 100) / 100,
      technicianCount: results.length,
    },
  };
}

/* ── Seed helper ── */
export async function seedTechnicians(orgId: string, locationId?: string) {
  const existing = await db.select().from(technicians).where(eq(technicians.orgId, orgId));
  if (existing.length > 0) return { seeded: 0, message: "Technicians already exist" };

  const seeds: CreateTechnicianInput[] = [
    { name: "Allan", nickname: "ALLAN", role: "chief_mechanic", commissionType: "higher_of", commissionRate: 10, commissionRateAlt: 5 },
    { name: "Cerwin", nickname: "CERWIN", role: "installer", commissionType: "percentage", commissionRate: 10 },
    { name: "Edwin", nickname: "EDWIN", role: "installer", commissionType: "percentage", commissionRate: 10 },
    { name: "Verwin", nickname: "VERWIN", role: "installer", commissionType: "percentage", commissionRate: 10 },
    { name: "Toytoy", nickname: "TOYTOY", role: "mechanic", commissionType: "percentage", commissionRate: 10 },
    { name: "Joenymar", nickname: "JOENYMAR", role: "mechanic", commissionType: "percentage", commissionRate: 10 },
    { name: "Jun", nickname: "JUN", role: "mechanic", commissionType: "percentage", commissionRate: 10 },
    { name: "Jose", nickname: "JOSE", role: "mechanic", commissionType: "percentage", commissionRate: 10 },
  ];

  const rows = await db.insert(technicians).values(
    seeds.map((s) => ({
      orgId,
      name: s.name,
      nickname: s.nickname,
      role: s.role,
      commissionType: s.commissionType ?? "percentage",
      commissionRate: String(s.commissionRate ?? 0),
      commissionRateAlt: s.commissionRateAlt != null ? String(s.commissionRateAlt) : null,
      locationId: locationId ?? null,
    })),
  ).returning();

  return { seeded: rows.length, message: `Seeded ${rows.length} technicians` };
}

/* ── Auto-discover technicians from labor product variants ── */
export async function seedFromProducts(orgId: string) {
  // Find all unique variant names under labor parent products
  const variantRows: any[] = await db.execute(sql`
    SELECT DISTINCT UPPER(TRIM(p.name)) AS tech_name
    FROM products p
    JOIN products parent ON p.parent_product_id = parent.id
    LEFT JOIN categories c ON parent.category_id = c.id
    WHERE p.org_id = ${orgId}
      AND (c.name ILIKE '%labor%' OR parent.name ILIKE '%labor%' OR parent.name ILIKE '%install%')
    ORDER BY tech_name
  `);

  // Filter out service-tier variants (e.g., "JOENYMAR 1 SIDE" → base is JOENYMAR)
  // A name is a tier variant if it contains a known suffix pattern
  const TIER_PATTERNS = /\s+\d+\s+SIDES?$|\s+FULL\s+TINT$/i;

  // Extract unique base technician names
  const baseNames = new Set<string>();
  for (const row of variantRows) {
    let name: string = row.tech_name?.trim();
    if (!name) continue;
    // Strip tier suffix to get base name
    name = name.replace(TIER_PATTERNS, "").trim();
    if (name.length >= 2) baseNames.add(name);
  }

  // Get existing technician nicknames
  const existing = await db.select({ nickname: technicians.nickname }).from(technicians).where(eq(technicians.orgId, orgId));
  const existingNames = new Set(existing.map((t) => (t.nickname ?? "").toUpperCase()));

  // Filter to only new names
  const newNames = [...baseNames].filter((n) => !existingNames.has(n));

  if (newNames.length === 0) {
    return { seeded: 0, message: "All technicians already exist", discovered: baseNames.size };
  }

  // Title-case helper
  const titleCase = (s: string) =>
    s.toLowerCase().replace(/(^|\s|-)\w/g, (c) => c.toUpperCase());

  const rows = await db.insert(technicians).values(
    newNames.map((n) => ({
      orgId,
      name: titleCase(n),
      nickname: n.toUpperCase(),
      role: "mechanic",
      commissionType: "percentage",
      commissionRate: "10",
      commissionRateAlt: null,
      locationId: null,
    })),
  ).returning();

  return {
    seeded: rows.length,
    discovered: baseNames.size,
    existing: existingNames.size,
    message: `Seeded ${rows.length} new technicians (${baseNames.size} total discovered, ${existingNames.size} already existed)`,
    names: rows.map((r) => r.nickname),
  };
}

/* ── Backfill historical_sales technician_id from Loyverse labor variants ── */
export async function backfillHistoricalTechnicians(orgId: string) {
  // Step 1: Exact match (nickname = variant name)
  const exactResult: any[] = await db.execute(sql`
    WITH matched AS (
      UPDATE historical_sales hs
      SET technician_id = t.id
      FROM products p
      JOIN technicians t ON UPPER(t.nickname) = UPPER(TRIM(p.name)) AND t.org_id = ${orgId}
      WHERE hs.product_id = p.id
        AND hs.org_id = ${orgId}
        AND p.parent_product_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM products parent
          LEFT JOIN categories c ON parent.category_id = c.id
          WHERE parent.id = p.parent_product_id
            AND (c.name ILIKE '%labor%' OR parent.name ILIKE '%install%' OR parent.name ILIKE '%labor%')
        )
        AND hs.technician_id IS NULL
      RETURNING hs.id
    )
    SELECT COUNT(*)::int AS updated FROM matched
  `);
  const exactCount = exactResult[0]?.updated ?? 0;

  // Step 2: Prefix match for tier variants (e.g., "JOENYMAR 1 SIDE" starts with "JOENYMAR")
  // Match variant name that STARTS WITH a technician nickname followed by space
  const prefixResult: any[] = await db.execute(sql`
    WITH matched AS (
      UPDATE historical_sales hs
      SET technician_id = sub.tech_id
      FROM (
        SELECT DISTINCT ON (hs2.id) hs2.id AS hs_id, t.id AS tech_id
        FROM historical_sales hs2
        JOIN products p ON hs2.product_id = p.id
        JOIN technicians t ON t.org_id = ${orgId}
          AND UPPER(TRIM(p.name)) LIKE UPPER(t.nickname) || ' %'
        WHERE hs2.org_id = ${orgId}
          AND p.parent_product_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM products parent
            LEFT JOIN categories c ON parent.category_id = c.id
            WHERE parent.id = p.parent_product_id
              AND (c.name ILIKE '%labor%' OR parent.name ILIKE '%install%' OR parent.name ILIKE '%labor%')
          )
          AND hs2.technician_id IS NULL
        ORDER BY hs2.id, LENGTH(t.nickname) DESC
      ) sub
      WHERE hs.id = sub.hs_id
      RETURNING hs.id
    )
    SELECT COUNT(*)::int AS updated FROM matched
  `);
  const prefixCount = prefixResult[0]?.updated ?? 0;

  const total = exactCount + prefixCount;
  return {
    updated: total,
    exactMatches: exactCount,
    prefixMatches: prefixCount,
    message: total > 0
      ? `Linked ${total} historical labor sales (${exactCount} exact + ${prefixCount} prefix matches)`
      : "No unlinked historical labor sales found (already backfilled or no matching technicians)",
  };
}

/* ── Map DB row → API response ── */
function mapRow(r: typeof technicians.$inferSelect) {
  return {
    id: r.id,
    orgId: r.orgId,
    name: r.name,
    nickname: r.nickname,
    role: r.role,
    phone: r.phone,
    commissionType: r.commissionType,
    commissionRate: parseFloat(r.commissionRate ?? "0"),
    commissionRateAlt: r.commissionRateAlt ? parseFloat(r.commissionRateAlt) : null,
    locationId: r.locationId,
    isActive: r.isActive,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
