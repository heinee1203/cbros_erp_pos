import { db } from "@apex/database";
import { sql, type SQL } from "drizzle-orm";

import type { SortField } from "./sorting";

/**
 * All-locations aggregate query.
 * Returns products across ALL org locations with SUM(stock_level).
 */
export async function handleAllLocationsQuery(
  reply: any,
  orgId: string,
  page: number,
  limit: number,
  offset: number,
  sortBy: SortField,
  sortDir: "asc" | "desc",
  q: Record<string, string | undefined>,
) {
  // Build filter fragments for raw SQL — segment-aware multi-term search
  const searchFilter = (() => {
    if (!q.search || q.search.length < 2) return sql``;

    // Prefix-based search modes
    const rawSearch = q.search.trim();
    const beginsMatch = rawSearch.match(/^begins:(.+)/i);
    const skuMatch = rawSearch.match(/^sku:(.+)/i);
    const barcodeMatch = rawSearch.match(/^barcode:(.+)/i);

    if (beginsMatch) {
      const term = beginsMatch[1].trim();
      return term.length >= 1 ? sql`AND (p.name ILIKE ${term + "%"})` : sql``;
    }
    if (skuMatch) {
      const term = skuMatch[1].trim();
      return term.length >= 1 ? sql`AND (p.sku ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = p.id AND child.sku ILIKE ${term + "%"}))` : sql``;
    }
    if (barcodeMatch) {
      const term = barcodeMatch[1].trim();
      return term.length >= 1 ? sql`AND (p.barcode ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = p.id AND child.barcode ILIKE ${term + "%"}))` : sql``;
    }

    // Comma-separated OR search
    if (q.search.includes(",")) {
      const commaTerms = q.search.split(",").map((t: string) => t.trim()).filter((t: string) => t.length >= 2);
      if (commaTerms.length === 0) return sql``;
      const orParts = commaTerms.map((term: string) => {
        const pat = "%" + term + "%";
        // Multi-word terms: each word must match in name (AND within term)
        const words = term.split(/\s+/).filter((w: string) => w.length >= 1);
        const nameCondition = words.length > 1
          ? sql`(${sql.join(words.map((w: string) => sql`p.name ILIKE ${"%" + w + "%"}`), sql` AND `)})`
          : sql`p.name ILIKE ${pat}`;
        return sql`(
          ${nameCondition}
          OR p.sku ILIKE ${pat}
          OR p.barcode ILIKE ${pat}
          OR p.oem_number ILIKE ${pat}
          OR b.name ILIKE ${pat}
          OR EXISTS (
            SELECT 1 FROM products child
            WHERE child.parent_product_id = p.id
            AND (child.name ILIKE ${pat} OR child.sku ILIKE ${pat})
          )
        )`;
      });
      return sql`AND (${sql.join(orParts, sql` OR `)})`;
    }

    const terms = q.search.trim().split(/\s+/).filter((t: string) => t.length >= 1);
    const fullPattern = "%" + q.search + "%";

    if (terms.length === 1) {
      const t = terms[0];
      return sql`AND (
        p.name ILIKE ${"%" + t + "%"}
        OR p.sku ILIKE ${"%" + t + "%"}
        OR p.barcode ILIKE ${fullPattern}
        OR p.oem_number ILIKE ${fullPattern}
        OR cat.name ILIKE ${fullPattern}
        OR EXISTS (
          SELECT 1 FROM products child
          WHERE child.parent_product_id = p.id
          AND (child.sku ILIKE ${t + "%"} OR child.sku ILIKE ${"%-" + t + "%"}
               OR child.barcode ILIKE ${fullPattern} OR child.name ILIKE ${fullPattern})
        )
        OR EXISTS (
          SELECT 1 FROM vehicle_compatibility vc
          WHERE vc.product_id = p.id
          AND (vc.make ILIKE ${fullPattern} OR vc.model ILIKE ${fullPattern}
               OR vc.engine ILIKE ${fullPattern} OR vc.notes ILIKE ${fullPattern})
        )
        OR EXISTS (
          SELECT 1 FROM product_tags pt
          JOIN tags t ON pt.tag_id = t.id
          WHERE pt.product_id = p.id
          AND t.name ILIKE ${fullPattern}
        )
      )`;
    }

    // Multi-term: each term must match a segment in the name (AND logic)
    const termParts = terms.map((t: string) =>
      sql`(p.name ILIKE ${"%" + t + "%"})`
    );
    return sql`AND (
      (${sql.join(termParts, sql` AND `)})
      OR p.sku ILIKE ${fullPattern}
      OR p.barcode ILIKE ${fullPattern}
      OR p.oem_number ILIKE ${fullPattern}
      OR EXISTS (
        SELECT 1 FROM vehicle_compatibility vc
        WHERE vc.product_id = p.id
        AND (vc.make ILIKE ${fullPattern} OR vc.model ILIKE ${fullPattern}
             OR vc.engine ILIKE ${fullPattern} OR vc.notes ILIKE ${fullPattern})
      )
      OR EXISTS (
        SELECT 1 FROM product_tags pt
        JOIN tags t ON pt.tag_id = t.id
        WHERE pt.product_id = p.id
        AND t.name ILIKE ${fullPattern}
      )
    )`;
  })();

  const familyFilter = q.familyId
    ? q.familyId === "__none__" ? sql`AND p.family_id IS NULL` : sql`AND p.family_id = ${q.familyId}::uuid`
    : sql``;

  const categoryFilter = q.category
    ? sql`AND p.category = ${q.category}`
    : sql``;

  // Bug 8 follow-up: client sends `categoryId` (canonical name); the legacy
  // `subCategoryId` was the only Bug-8-incomplete spot left in this file.
  // Variable name kept as subCategoryFilter to avoid colliding with the
  // separate `categoryFilter` (free-text legacy `p.category` column) above.
  const subCategoryFilter = q.categoryId
    ? q.categoryId === "__none__" ? sql`AND p.category_id IS NULL` : sql`AND p.category_id = ${q.categoryId}::uuid`
    : sql``;

  const subcategoryFilter = q.subcategoryId
    ? q.subcategoryId === "__none__" ? sql`AND p.subcategory_id IS NULL` : sql`AND p.subcategory_id = ${q.subcategoryId}::uuid`
    : sql``;

  const brandFilter = q.brandId
    ? q.brandId === "__none__" ? sql`AND p.brand_id IS NULL` : sql`AND p.brand_id = ${q.brandId}::uuid`
    : sql``;

  const oemFilter = q.oemNumber
    ? sql`AND (p.oem_number ILIKE ${"%" + q.oemNumber + "%"} OR p.name ILIKE ${"%" + q.oemNumber + "%"} OR p.sku ILIKE ${"%" + q.oemNumber + "%"} OR p.barcode ILIKE ${"%" + q.oemNumber + "%"})`
    : sql``;

  const vehicleFilter = (() => {
    if (q.vehicleMake === "__none__") {
      return sql`AND NOT EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = p.id)`;
    }
    const vcConds: SQL[] = [sql`vc.product_id = p.id`];
    if (q.vehicleMake) vcConds.push(sql`vc.make = ${q.vehicleMake}`);
    if (q.vehicleModel) vcConds.push(sql`vc.model ILIKE ${"%" + q.vehicleModel + "%"}`);
    if (q.vehicleYear) {
      const year = parseInt(q.vehicleYear, 10);
      if (!isNaN(year)) vcConds.push(sql`(vc.year_start IS NULL OR vc.year_start <= ${year}) AND (vc.year_end IS NULL OR vc.year_end >= ${year})`);
    }
    if (q.vehicleEngine) vcConds.push(sql`vc.engine ILIKE ${"%" + q.vehicleEngine + "%"}`);
    if (vcConds.length <= 1) return sql``; // only product_id condition = no vehicle filters
    return sql`AND EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE ${sql.join(vcConds, sql` AND `)})`;
  })();

  const includeInactive = q.includeInactive === "true";
  const activeFilter = includeInactive ? sql`` : sql`AND p.is_active = true`;

  const parentOnlyFilter = q.parentOnly === "true" ? sql`AND p.parent_product_id IS NULL` : sql``;
  const parentFilter = q.parentProductId ? sql`AND p.parent_product_id = ${q.parentProductId}::uuid` : sql``;
  const excludeSOFilter = q.excludeSO === "true" ? sql`AND p.special_order = false` : sql``;
  const excludeDCFilter = q.excludeDC === "true" ? sql`AND p.discontinued = false` : sql``;

  // Stock status filter operates on the aggregated sum
  const stockHaving = q.stockStatus === "out"
    ? sql`HAVING (
        CASE WHEN bool_or(p.is_parent) THEN
          COALESCE((SELECT SUM(inv_chk.stock_level)::int FROM inventory inv_chk JOIN products p_chk ON inv_chk.product_id = p_chk.id WHERE p_chk.parent_product_id = p.id), 0) = 0
        ELSE COALESCE(SUM(i.stock_level), 0) = 0
        END
      )`
    : q.stockStatus === "low"
      ? sql`HAVING COALESCE(SUM(i.stock_level), 0) > 0 AND COALESCE(SUM(i.stock_level), 0) <= MAX(i.reorder_point)`
      : sql``;

  // Sort expression (refers to CTE output columns, not table-qualified)
  const FLAT_SORT_MAP: Record<string, ReturnType<typeof sql>> = {
    stockLevel: sql`stock_level`,
    unitPrice: sql`unit_price`,
    costPrice: sql`cost_price`,
    category: sql`category`,
    sku: sql`sku`,
    categoryName: sql`sub_category_name`,
    brandName: sql`brand_name`,
    margin: sql`CASE WHEN CAST(unit_price AS numeric) > 0 THEN (CAST(unit_price AS numeric) - CAST(cost_price AS numeric)) / CAST(unit_price AS numeric) * 100 ELSE 0 END`,
  };
  const sortExpr = FLAT_SORT_MAP[sortBy] ?? sql`name`;
  const dirExpr = sortDir === "desc" ? sql`DESC` : sql`ASC`;

  // Vehicle model subselect
  const vehicleModelExpr = q.vehicleMake && q.vehicleMake !== "__none__"
    ? sql`(SELECT string_agg(DISTINCT vc.model, ', ' ORDER BY vc.model) FROM vehicle_compatibility vc WHERE vc.product_id = p.id AND vc.make = ${q.vehicleMake})`
    : sql`NULL`;

  const result = await db.execute(sql`
    WITH agg AS (
      SELECT
        p.id, p.name, p.sku, p.mnemonic_sku, p.category::text,
        p.unit_price::text, p.cost_price::text, p.barcode, p.oem_number,
        p.is_variable_price,
        GREATEST(CASE WHEN p.is_parent THEN COALESCE((
          SELECT SUM(inv2.stock_level)::int
          FROM inventory inv2
          INNER JOIN products p2 ON inv2.product_id = p2.id
          INNER JOIN locations loc2 ON inv2.location_id = loc2.id AND loc2.is_active = true
          WHERE p2.parent_product_id = p.id
        ), 0) ELSE COALESCE(SUM(i.stock_level), 0) END, 0)::int AS stock_level,
        COALESCE(MAX(i.reorder_point), 0)::int AS reorder_point,
        p.family_id, pf.name AS family_name,
        p.category_id AS sub_category_id, cat.name AS sub_category_name,
        p.subcategory_id, psub.name AS subcategory_name,
        p.brand_id, b.name AS brand_name,
        p.parent_product_id, p.is_parent,
        (SELECT pp.name FROM products pp WHERE pp.id = p.parent_product_id) AS parent_name,
        p.special_order, p.discontinued, p.is_serialized, p.is_tire,
        ${vehicleModelExpr} AS vehicle_model
      FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
          AND EXISTS (SELECT 1 FROM locations loc WHERE loc.id = i.location_id AND loc.is_active = true)
        LEFT JOIN product_families pf ON p.family_id = pf.id
        LEFT JOIN categories cat ON p.category_id = cat.id
        LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
        LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${activeFilter}
        ${parentOnlyFilter}
        ${parentFilter}
        ${excludeSOFilter}
        ${excludeDCFilter}
        ${searchFilter}
        ${familyFilter}
        ${categoryFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
        ${oemFilter}
        ${vehicleFilter}
      GROUP BY p.id, p.name, p.sku, p.mnemonic_sku, p.category,
               p.unit_price, p.cost_price, p.barcode, p.oem_number, p.is_variable_price,
               p.family_id, pf.name, p.category_id, cat.name,
               p.subcategory_id, psub.name, p.brand_id, b.name,
               p.parent_product_id, p.is_parent, p.is_serialized, p.is_tire,
               (SELECT pp.name FROM products pp WHERE pp.id = p.parent_product_id)
      ${stockHaving}
    )
    SELECT *, count(*) OVER() AS _total_count
    FROM agg
    ORDER BY ${sortExpr} ${dirExpr}, name ASC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = result as any[];
  const totalCount = rows.length > 0 ? Number(rows[0]._total_count) : 0;

  const data = rows.map(({ _total_count, ...row }) => ({
    id: row.id,
    name: row.name,
    sku: row.sku,
    mnemonicSku: row.mnemonic_sku,
    category: row.category,
    unitPrice: row.unit_price,
    costPrice: row.cost_price,
    barcode: row.barcode,
    oemNumber: row.oem_number,
    isVariablePrice: row.is_variable_price,
    stockLevel: row.stock_level,
    reorderPoint: row.reorder_point,
    familyId: row.family_id,
    familyName: row.family_name,
    subCategoryId: row.sub_category_id,
    subCategoryName: row.sub_category_name,
    subcategoryId: row.subcategory_id,
    subcategoryName: row.subcategory_name,
    brandId: row.brand_id,
    brandName: row.brand_name,
    parentProductId: row.parent_product_id,
    parentName: row.parent_name || null,
    isParent: row.is_parent,
    specialOrder: row.special_order ?? false,
    discontinued: row.discontinued ?? false,
    isSerialized: row.is_serialized ?? false,
    isTire: row.is_tire ?? false,
    vehicleModel: row.vehicle_model,
  }));

  return reply.send({
    data,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    hasMore: page * limit < totalCount,
  });
}
