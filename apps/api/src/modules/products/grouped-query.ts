import { db } from "@apex/database";
import { sql } from "drizzle-orm";

import type { SortField } from "./sorting";

/**
 * Grouped query handler.
 *
 * Deduplicates products within families by variant name:
 * - Family products: GROUP BY (familyId, name) -> one row per variant with aggregated stock
 * - Standalone products: no grouping, returned as-is
 *
 * When search is active: expands to include ALL family siblings when any variant matches.
 */
export async function handleGroupedQuery(
  reply: any,
  orgId: string,
  locationId: string | null,
  page: number,
  limit: number,
  offset: number,
  sortBy: SortField,
  sortDir: "asc" | "desc",
  search?: string,
  category?: string,
  stockStatus?: string,
  subCategoryId?: string,
  familyId?: string,
  subcategoryId?: string,
  brandId?: string,
  allLocations?: boolean,
  excludeSO?: boolean,
  excludeDC?: boolean,
) {
  // Exclude toggles
  const excludeSOFilter = excludeSO ? sql`AND p.special_order = false` : sql``;
  const excludeDCFilter = excludeDC ? sql`AND p.discontinued = false` : sql``;

  // Build filter fragments
  const brandFilter = brandId
    ? brandId === "__none__" ? sql`AND p.brand_id IS NULL` : sql`AND p.brand_id = ${brandId}::uuid`
    : sql``;

  const subcategoryFilter = subcategoryId
    ? subcategoryId === "__none__" ? sql`AND p.subcategory_id IS NULL` : sql`AND p.subcategory_id = ${subcategoryId}::uuid`
    : sql``;

  const familyFilter = familyId
    ? familyId === "__none__" ? sql`AND p.family_id IS NULL` : sql`AND p.family_id = ${familyId}::uuid`
    : sql``;

  const searchFilter = (() => {
    if (!search || search.length < 2) return sql``;

    // Comma-separated OR search
    if (search.includes(",")) {
      const commaTerms = search.split(",").map((t: string) => t.trim()).filter((t: string) => t.length >= 2);
      if (commaTerms.length === 0) return sql``;
      const orParts = commaTerms.map((term: string) => {
        const pat = "%" + term + "%";
        const startPat = term + "%";
        const wordPat = "% " + term + "%";
        const hyphenPat = "%-" + term + "%";
        return sql`(
          p.name ILIKE ${startPat} OR p.name ILIKE ${wordPat} OR p.name ILIKE ${hyphenPat}
          OR p.sku ILIKE ${startPat} OR p.sku ILIKE ${hyphenPat}
          OR p.barcode ILIKE ${pat}
          OR p.oem_number ILIKE ${pat}
          OR b.name ILIKE ${pat}
        )`;
      });
      return sql`AND (${sql.join(orParts, sql` OR `)})`;
    }

    const terms = search.trim().split(/\s+/).filter((t: string) => t.length >= 1);
    const fullPattern = "%" + search + "%";

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

  const categoryFilter = category
    ? sql`AND p.category = ${category}`
    : sql``;

  const stockFilter = stockStatus === "out"
    ? sql`AND (
        CASE WHEN p.is_parent = true THEN
          COALESCE((SELECT SUM(inv_chk.stock_level)::int FROM inventory inv_chk JOIN products p_chk ON inv_chk.product_id = p_chk.id WHERE p_chk.parent_product_id = p.id), 0) = 0
        ELSE COALESCE(i.stock_level, 0) = 0
        END
      )`
    : stockStatus === "low"
      ? sql`AND i.stock_level > 0 AND i.stock_level <= i.reorder_point`
      : sql``;

  const subCategoryFilter = subCategoryId
    ? subCategoryId === "__none__" ? sql`AND p.category_id IS NULL` : sql`AND p.category_id = ${subCategoryId}::uuid`
    : sql``;

  // Location filter — omitted when allLocations=true
  const locationFilter = allLocations ? sql`` : sql`AND i.location_id = ${locationId}`;
  // Only show items marked available for sale at the store
  const availabilityFilter = allLocations ? sql`` : sql`AND i.available_for_sale = true`;
  // Exclude inventory at inactive locations when showing all-locations aggregate
  const activeLocationFilter = allLocations
    ? sql`AND EXISTS (SELECT 1 FROM locations loc WHERE loc.id = i.location_id AND loc.is_active = true)`
    : sql``;

  // When search matches a family product, expand to include ALL variants in that family.
  // This lets the frontend show the complete family context around matching children.
  const familySearchExpansion = search && search.length >= 2
    ? sql`
      OR p.family_id IN (
        SELECT DISTINCT p2.family_id
        FROM inventory i2
        INNER JOIN products p2 ON i2.product_id = p2.id
        WHERE ${allLocations ? sql`TRUE` : sql`i2.location_id = ${locationId}`}
          AND p2.org_id = ${orgId}
          AND p2.family_id IS NOT NULL
          AND (p2.name ILIKE ${"%" + search + "%"} OR p2.sku ILIKE ${"%" + search + "%"} OR p2.oem_number ILIKE ${"%" + search + "%"}
               OR EXISTS (SELECT 1 FROM vehicle_compatibility vc2 WHERE vc2.product_id = p2.id AND (vc2.make ILIKE ${"%" + search + "%"} OR vc2.model ILIKE ${"%" + search + "%"}))
               OR EXISTS (SELECT 1 FROM product_tags pt2 JOIN tags t2 ON pt2.tag_id = t2.id WHERE pt2.product_id = p2.id AND t2.name ILIKE ${"%" + search + "%"})
          )
      )
    `
    : sql``;

  // Build sort expression
  const GROUPED_SORT_MAP: Record<string, ReturnType<typeof sql>> = {
    stockLevel: sql`stock_level`,
    unitPrice: sql`unit_price`,
    costPrice: sql`cost_price`,
    category: sql`category`,
    sku: sql`sku`,
    categoryName: sql`sub_category_name`,
    brandName: sql`brand_name`,
    margin: sql`CASE WHEN CAST(unit_price AS numeric) > 0 THEN (CAST(unit_price AS numeric) - CAST(cost_price AS numeric)) / CAST(unit_price AS numeric) * 100 ELSE 0 END`,
  };
  const sortExpr = GROUPED_SORT_MAP[sortBy] ?? sql`sort_key`;

  const dirExpr = sortDir === "desc" ? sql`DESC` : sql`ASC`;

  // Execute grouped query using raw SQL for the UNION ALL + aggregation
  const result = await db.execute(sql`
    WITH grouped_data AS (
      -- Part 1: Family products — one row per (family, variant_name) with aggregated stock
      SELECT
        (array_agg(p.id ORDER BY p.sku))[1] AS id,
        p.name AS name,
        (array_agg(p.sku ORDER BY p.sku))[1] AS sku,
        (array_agg(p.mnemonic_sku ORDER BY p.sku))[1] AS mnemonic_sku,
        p.category::text AS category,
        (array_agg(p.unit_price ORDER BY p.sku))[1]::text AS unit_price,
        (array_agg(p.cost_price ORDER BY p.sku))[1]::text AS cost_price,
        (array_agg(p.barcode ORDER BY p.sku))[1] AS barcode,
        (array_agg(p.oem_number ORDER BY p.sku))[1] AS oem_number,
        bool_or(p.is_variable_price) AS is_variable_price,
        GREATEST(COALESCE(SUM(i.stock_level), 0), 0)::int AS stock_level,
        COALESCE(MAX(i.reorder_point), 0)::int AS reorder_point,
        p.family_id AS family_id,
        pf.name AS family_name,
        (array_agg(p.category_id ORDER BY p.sku))[1] AS sub_category_id,
        (array_agg(cat.name ORDER BY p.sku))[1] AS sub_category_name,
        (array_agg(p.subcategory_id ORDER BY p.sku))[1] AS subcategory_id,
        (array_agg(psub.name ORDER BY p.sku))[1] AS subcategory_name,
        (array_agg(p.brand_id ORDER BY p.sku))[1] AS brand_id,
        (array_agg(b.name ORDER BY p.sku))[1] AS brand_name,
        bool_or(p.special_order) AS special_order,
        bool_or(p.discontinued) AS discontinued,
        bool_or(p.is_serialized) AS is_serialized,
        bool_or(p.is_tire) AS is_tire,
        COALESCE(pf.name, p.name) AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      INNER JOIN product_families pf ON p.family_id = pf.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${locationFilter}
        ${availabilityFilter}
        ${activeLocationFilter}
        ${familyFilter}
        ${categoryFilter}
        ${stockFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
        ${excludeSOFilter}
        ${excludeDCFilter}
        AND (TRUE ${searchFilter} ${familySearchExpansion})
      GROUP BY p.family_id, pf.name, p.name, p.category

      UNION ALL

      -- Part 2: Standalone products — no grouping
      SELECT
        p.id,
        p.name,
        p.sku,
        p.mnemonic_sku,
        p.category::text,
        p.unit_price::text,
        p.cost_price::text,
        p.barcode,
        p.oem_number,
        p.is_variable_price,
        ${allLocations ? sql`GREATEST(COALESCE(SUM(i.stock_level), 0), 0)::int` : sql`GREATEST(i.stock_level, 0)`} AS stock_level,
        ${allLocations ? sql`COALESCE(MAX(i.reorder_point), 0)::int` : sql`i.reorder_point`} AS reorder_point,
        NULL::uuid AS family_id,
        NULL::text AS family_name,
        p.category_id AS sub_category_id,
        cat.name AS sub_category_name,
        p.subcategory_id AS subcategory_id,
        psub.name AS subcategory_name,
        p.brand_id AS brand_id,
        b.name AS brand_name,
        p.special_order,
        p.discontinued,
        p.is_serialized,
        p.is_tire,
        p.name AS sort_key
      FROM inventory i
      INNER JOIN products p ON i.product_id = p.id
      LEFT JOIN categories cat ON p.category_id = cat.id
      LEFT JOIN product_subcategories psub ON p.subcategory_id = psub.id
      LEFT JOIN brands b ON p.brand_id = b.id
      WHERE p.org_id = ${orgId}
        ${locationFilter}
        ${availabilityFilter}
        ${activeLocationFilter}
        AND p.family_id IS NULL
        ${familyFilter}
        ${searchFilter}
        ${categoryFilter}
        ${stockFilter}
        ${subCategoryFilter}
        ${subcategoryFilter}
        ${brandFilter}
        ${excludeSOFilter}
        ${excludeDCFilter}
      ${allLocations ? sql`GROUP BY p.id, p.name, p.sku, p.mnemonic_sku, p.category,
               p.unit_price, p.cost_price, p.barcode, p.oem_number, p.is_variable_price,
               p.category_id, cat.name, p.subcategory_id, psub.name,
               p.brand_id, b.name, p.special_order, p.discontinued, p.is_serialized, p.is_tire` : sql``}
    )
    SELECT *, count(*) OVER() AS _total_count
    FROM grouped_data
    ORDER BY ${sortExpr} ${dirExpr}, name ASC, id ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = result as any[];
  const totalCount = rows.length > 0 ? Number(rows[0]._total_count) : 0;

  // Strip the _total_count helper field from response rows
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
    specialOrder: row.special_order ?? false,
    discontinued: row.discontinued ?? false,
    isSerialized: row.is_serialized ?? false,
    isTire: row.is_tire ?? false,
  }));

  return reply.send({
    data,
    page,
    limit,
    total: totalCount,
    totalPages: Math.ceil(totalCount / limit),
    hasMore: page * limit < totalCount,
    grouped: true,
  });
}
