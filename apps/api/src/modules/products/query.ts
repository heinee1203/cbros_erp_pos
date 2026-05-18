import { brands, categories, inventory, products } from "@apex/database/schema";
import { eq, ilike, sql, type SQL } from "drizzle-orm";

import { type SortField, VALID_SORT_FIELDS } from "./sorting";
import { hasProductManageRole } from "./permissions";

type ProductListQueryBasics = {
  allLocations?: string;
  brandId?: string;
  category?: string;
  categoryId?: string;
  excludeDC?: string;
  excludeSO?: string;
  familyId?: string;
  grouped?: string;
  hasVehicles?: string;
  includeInactive?: string;
  limit?: string;
  oemNumber?: string;
  page?: string;
  parentOnly?: string;
  parentProductId?: string;
  search?: string;
  sortBy?: string;
  sortDir?: string;
  stockStatus?: string;
  subcategoryId?: string;
  vehicleEngine?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleYear?: string;
};

export function resolveProductScope(q: ProductListQueryBasics, locationId: string | null | undefined) {
  return q.allLocations === "true" || !locationId;
}

export function parseProductPagination(q: ProductListQueryBasics) {
  const page = Math.max(1, parseInt(q.page ?? "1", 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(q.limit ?? "50", 10) || 50));

  return {
    page,
    limit,
    offset: (page - 1) * limit,
  };
}

export function parseProductSort(q: ProductListQueryBasics): { sortBy: SortField; sortDir: "asc" | "desc" } {
  return {
    sortBy: VALID_SORT_FIELDS.includes(q.sortBy as SortField) ? (q.sortBy as SortField) : "name",
    sortDir: q.sortDir === "desc" ? "desc" : "asc",
  };
}

export function isGroupedProductQuery(q: ProductListQueryBasics) {
  return q.grouped === "true";
}

export function canIncludeInactiveProducts(q: ProductListQueryBasics, role: string | null | undefined) {
  return q.includeInactive === "true" && hasProductManageRole(role);
}

export function buildStandardProductListConditions({
  q,
  orgId,
  locationId,
  role,
}: {
  q: ProductListQueryBasics;
  orgId: string;
  locationId: string;
  role: string | null | undefined;
}) {
  const conditions: SQL[] = [eq(products.orgId, orgId)];

  // Parents may have no inventory row because stock comes from children.
  conditions.push(sql`(${inventory.locationId} = ${locationId} OR (${products.isParent} = true AND ${inventory.locationId} IS NULL))`);
  conditions.push(sql`(${inventory.availableForSale} = true OR (${products.isParent} = true AND ${inventory.availableForSale} IS NULL))`);

  if (!canIncludeInactiveProducts(q, role)) {
    conditions.push(eq(products.isActive, true));
  }

  const parentOnly = q.parentOnly === "true";
  if (parentOnly) {
    conditions.push(sql`${products.parentProductId} IS NULL`);
  }

  if (q.parentProductId) {
    conditions.push(eq(products.parentProductId, q.parentProductId));
  }

  addStandardProductSearchConditions(conditions, q.search);
  addStandardProductTaxonomyConditions(conditions, q);
  addStandardProductVehicleConditions(conditions, q);
  addStandardProductStockConditions(conditions, q);

  if (q.category) {
    conditions.push(eq(products.category, q.category as any));
  }

  if (q.excludeSO === "true") conditions.push(eq(products.specialOrder, false));
  if (q.excludeDC === "true") conditions.push(eq(products.discontinued, false));

  return { conditions, parentOnly };
}

export type ProductBulkFilter = {
  search?: string;
  familyId?: string;
  categoryId?: string;
  brandId?: string;
};

export function buildBulkProductFilterConditions(orgId: string, filter: ProductBulkFilter) {
  const conditions: SQL[] = [eq(products.orgId, orgId), eq(products.isActive, true)];
  if (filter.search && filter.search.length >= 2) {
    conditions.push(ilike(products.name, `%${filter.search}%`));
  }
  if (filter.familyId) conditions.push(eq(products.familyId, filter.familyId));
  if (filter.categoryId) conditions.push(eq(products.categoryId, filter.categoryId));
  if (filter.brandId) conditions.push(eq(products.brandId, filter.brandId));
  return conditions;
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function addStandardProductSearchConditions(conditions: SQL[], search: string | undefined) {
  if (!search || search.length < 2) return;

  const rawSearch = search.trim();
  const beginsMatch = rawSearch.match(/^begins:(.+)/i);
  const skuMatch = rawSearch.match(/^sku:(.+)/i);
  const barcodeMatch = rawSearch.match(/^barcode:(.+)/i);

  if (beginsMatch) {
    const term = beginsMatch[1].trim();
    if (term.length >= 1) {
      conditions.push(sql`(${products.name} ILIKE ${term + "%"})`);
    }
    return;
  }

  if (skuMatch) {
    const term = skuMatch[1].trim();
    if (term.length >= 1) {
      conditions.push(sql`(${products.sku} ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = ${products.id} AND child.sku ILIKE ${term + "%"}))`);
    }
    return;
  }

  if (barcodeMatch) {
    const term = barcodeMatch[1].trim();
    if (term.length >= 1) {
      conditions.push(sql`(${products.barcode} ILIKE ${term + "%"} OR EXISTS (SELECT 1 FROM products child WHERE child.parent_product_id = ${products.id} AND child.barcode ILIKE ${term + "%"}))`);
    }
    return;
  }

  if (search.includes(",")) {
    const commaTerms = search.split(",").map((t: string) => t.trim()).filter((t: string) => t.length >= 2);
    if (commaTerms.length > 0) {
      const orParts = commaTerms.map((term: string) => {
        const pat = "%" + term + "%";
        const words = term.split(/\s+/).filter((w: string) => w.length >= 1);
        const nameCondition = words.length > 1
          ? sql`(${sql.join(words.map((w: string) => sql`${products.name} ILIKE ${"%" + w + "%"}`), sql` AND `)})`
          : sql`${products.name} ILIKE ${pat}`;
        return sql`(
          ${nameCondition}
          OR ${products.sku} ILIKE ${pat}
          OR ${products.barcode} ILIKE ${pat}
          OR ${products.oemNumber} ILIKE ${pat}
          OR ${brands.name} ILIKE ${pat}
          OR EXISTS (
            SELECT 1 FROM products child
            WHERE child.parent_product_id = ${products.id}
            AND (child.name ILIKE ${pat} OR child.sku ILIKE ${pat})
          )
        )`;
      });
      conditions.push(sql`(${sql.join(orParts, sql` OR `)})`);
    }
    return;
  }

  const searchTerms = search.trim().split(/\s+/).filter((t: string) => t.length >= 1);

  if (searchTerms.length === 1) {
    const term = searchTerms[0];
    const substringPattern = "%" + term + "%";
    const hyphenPattern = "%-" + term + "%";
    const startPattern = term + "%";
    conditions.push(
      sql`(
        ${products.name} ILIKE ${substringPattern}
        OR ${products.sku} ILIKE ${substringPattern}
        OR ${products.barcode} ILIKE ${substringPattern}
        OR ${products.oemNumber} ILIKE ${substringPattern}
        OR ${categories.name} ILIKE ${substringPattern}
        OR EXISTS (
          SELECT 1 FROM products child
          WHERE child.parent_product_id = ${products.id}
          AND (child.sku ILIKE ${startPattern} OR child.sku ILIKE ${hyphenPattern}
               OR child.barcode ILIKE ${substringPattern} OR child.name ILIKE ${substringPattern})
        )
        OR EXISTS (
          SELECT 1 FROM vehicle_compatibility vc
          WHERE vc.product_id = ${products.id}
          AND (vc.make ILIKE ${substringPattern} OR vc.model ILIKE ${substringPattern}
               OR vc.engine ILIKE ${substringPattern} OR vc.notes ILIKE ${substringPattern})
        )
        OR EXISTS (
          SELECT 1 FROM product_tags pt
          JOIN tags t ON pt.tag_id = t.id
          WHERE pt.product_id = ${products.id}
          AND t.name ILIKE ${substringPattern}
        )
      )`,
    );
    return;
  }

  const fullSearchTerm = "%" + search + "%";
  const termConditions = searchTerms.map((term: string) => {
    const pat = "%" + term + "%";
    return sql`(${products.name} ILIKE ${pat})`;
  });
  conditions.push(
    sql`(
      (${sql.join(termConditions, sql` AND `)})
      OR ${products.sku} ILIKE ${fullSearchTerm}
      OR ${products.barcode} ILIKE ${fullSearchTerm}
      OR ${products.oemNumber} ILIKE ${fullSearchTerm}
      OR EXISTS (
        SELECT 1 FROM vehicle_compatibility vc
        WHERE vc.product_id = ${products.id}
        AND (vc.make ILIKE ${fullSearchTerm} OR vc.model ILIKE ${fullSearchTerm}
             OR vc.engine ILIKE ${fullSearchTerm} OR vc.notes ILIKE ${fullSearchTerm})
      )
      OR EXISTS (
        SELECT 1 FROM product_tags pt
        JOIN tags t ON pt.tag_id = t.id
        WHERE pt.product_id = ${products.id}
        AND t.name ILIKE ${fullSearchTerm}
      )
    )`,
  );
}

function addStandardProductTaxonomyConditions(conditions: SQL[], q: ProductListQueryBasics) {
  if (q.oemNumber) {
    const oemTerm = "%" + q.oemNumber + "%";
    conditions.push(
      sql`(${products.oemNumber} ILIKE ${oemTerm} OR ${products.name} ILIKE ${oemTerm} OR ${products.sku} ILIKE ${oemTerm} OR ${products.barcode} ILIKE ${oemTerm})`,
    );
  }

  if (q.hasVehicles === "true") {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id})`,
    );
  }

  if (q.familyId) {
    if (q.familyId === "__none__") {
      conditions.push(sql`${products.familyId} IS NULL`);
    } else {
      conditions.push(eq(products.familyId, q.familyId));
    }
  }

  if (q.categoryId) {
    if (q.categoryId === "__none__") {
      conditions.push(sql`${products.categoryId} IS NULL`);
    } else {
      conditions.push(eq(products.categoryId, q.categoryId));
    }
  }

  if (q.subcategoryId) {
    if (q.subcategoryId === "__none__") {
      conditions.push(sql`${products.subcategoryId} IS NULL`);
    } else {
      conditions.push(eq(products.subcategoryId, q.subcategoryId));
    }
  }

  if (q.brandId) {
    if (q.brandId === "__none__") {
      conditions.push(sql`${products.brandId} IS NULL`);
    } else {
      conditions.push(eq(products.brandId, q.brandId));
    }
  }
}

function addStandardProductVehicleConditions(conditions: SQL[], q: ProductListQueryBasics) {
  if (!q.vehicleMake && !q.vehicleModel && !q.vehicleYear && !q.vehicleEngine) return;

  if (q.vehicleMake === "__none__") {
    conditions.push(
      sql`NOT EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE vc.product_id = ${products.id})`,
    );
    return;
  }

  const vcConds: SQL[] = [
    sql`vc.product_id = ${products.id}`,
  ];
  if (q.vehicleMake) {
    vcConds.push(sql`vc.make = ${q.vehicleMake}`);
  }
  if (q.vehicleModel) {
    vcConds.push(sql`vc.model ILIKE ${"%" + q.vehicleModel + "%"}`);
  }
  if (q.vehicleYear) {
    const year = parseInt(q.vehicleYear, 10);
    if (!isNaN(year)) {
      vcConds.push(sql`(vc.year_start IS NULL OR vc.year_start <= ${year}) AND (vc.year_end IS NULL OR vc.year_end >= ${year})`);
    }
  }
  if (q.vehicleEngine) {
    vcConds.push(sql`vc.engine ILIKE ${"%" + q.vehicleEngine + "%"}`);
  }
  conditions.push(
    sql`EXISTS (SELECT 1 FROM vehicle_compatibility vc WHERE ${sql.join(vcConds, sql` AND `)})`,
  );
}

function addStandardProductStockConditions(conditions: SQL[], q: ProductListQueryBasics) {
  if (q.stockStatus === "out") {
    conditions.push(sql`(
      CASE WHEN ${products.isParent} = true THEN
        COALESCE((
          SELECT SUM(inv_chk.stock_level)::int
          FROM inventory inv_chk
          INNER JOIN products p_chk ON inv_chk.product_id = p_chk.id
          WHERE p_chk.parent_product_id = ${products.id}
        ), 0) = 0
      ELSE
        COALESCE(${inventory.stockLevel}, 0) = 0
      END
    )`);
  } else if (q.stockStatus === "low") {
    conditions.push(
      sql`${inventory.stockLevel} > 0 AND ${inventory.stockLevel} <= ${inventory.reorderPoint}`,
    );
  } else if (q.stockStatus === "special_order") {
    conditions.push(eq(products.specialOrder, true));
  } else if (q.stockStatus === "not_special_order") {
    conditions.push(eq(products.specialOrder, false));
  }
}
