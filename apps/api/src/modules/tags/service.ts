import { db } from "@apex/database";
import {
  tags,
  productTags,
  products,
} from "@apex/database/schema";
import { eq, and, sql, ilike, gt, type SQL, inArray } from "drizzle-orm";

// ─── Tag CRUD ────────────────────────────────────────────────────────

export async function listTags(opts: {
  orgId: string;
  tagType?: string;
  search?: string;
  cursor?: string;
  limit?: number;
}) {
  const { orgId, tagType, search, cursor } = opts;
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: SQL[] = [eq(tags.orgId, orgId)];

  if (tagType) {
    conditions.push(eq(tags.tagType, tagType as any));
  }
  if (search && search.length >= 1) {
    conditions.push(ilike(tags.name, `%${search}%`));
  }
  if (cursor) {
    conditions.push(gt(tags.id, cursor));
  }

  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      tagType: tags.tagType,
      description: tags.description,
      createdAt: tags.createdAt,
      productCount: sql<number>`(
        SELECT COUNT(*)::int FROM product_tags pt
        WHERE pt.tag_id = tags.id AND pt.org_id = ${orgId}
      )`,
    })
    .from(tags)
    .where(and(...conditions))
    .orderBy(tags.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => ({
    ...r,
    productCount: Number(r.productCount),
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    data,
    cursor: hasMore ? data[data.length - 1]?.id : null,
  };
}

export async function createTag(opts: {
  orgId: string;
  name: string;
  tagType: string;
  description?: string;
}) {
  const { orgId, tagType, description } = opts;
  // Normalize name: trim; uppercase for tire sizes
  let name = opts.name.trim();
  if (tagType === "TIRE_SIZE") {
    name = name.toUpperCase();
  }

  // Check unique
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), eq(tags.name, name)));

  if (existing.length > 0) {
    throw new Error(`Tag "${name}" already exists`);
  }

  const [row] = await db
    .insert(tags)
    .values({
      orgId,
      name,
      tagType: tagType as any,
      description: description ?? null,
    })
    .returning();

  return {
    id: row.id,
    name: row.name,
    tagType: row.tagType,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateTag(opts: {
  orgId: string;
  id: string;
  name?: string;
  description?: string;
}) {
  const { orgId, id } = opts;

  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Tag not found");
  }

  const updateValues: Record<string, unknown> = {};
  if (opts.name !== undefined) updateValues.name = opts.name.trim();
  if (opts.description !== undefined) updateValues.description = opts.description;

  if (Object.keys(updateValues).length === 0) {
    throw new Error("No fields to update");
  }

  // Check unique name if changing
  if (updateValues.name) {
    const nameTaken = await db
      .select({ id: tags.id })
      .from(tags)
      .where(
        and(
          eq(tags.orgId, orgId),
          eq(tags.name, updateValues.name as string),
          sql`${tags.id} != ${id}`,
        ),
      );
    if (nameTaken.length > 0) {
      throw new Error(`Tag "${updateValues.name}" already exists`);
    }
  }

  const [row] = await db
    .update(tags)
    .set(updateValues)
    .where(and(eq(tags.id, id), eq(tags.orgId, orgId)))
    .returning();

  return {
    id: row.id,
    name: row.name,
    tagType: row.tagType,
    description: row.description,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteTag(orgId: string, id: string) {
  const existing = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, id), eq(tags.orgId, orgId)));

  if (existing.length === 0) {
    throw new Error("Tag not found");
  }

  // Cascade: delete product_tags first, then the tag
  await db
    .delete(productTags)
    .where(and(eq(productTags.tagId, id), eq(productTags.orgId, orgId)));

  await db
    .delete(tags)
    .where(and(eq(tags.id, id), eq(tags.orgId, orgId)));
}

export async function getTagProducts(opts: {
  orgId: string;
  tagId: string;
  cursor?: string;
  limit?: number;
}) {
  const { orgId, tagId, cursor } = opts;
  const limit = Math.min(opts.limit ?? 50, 200);
  const conditions: SQL[] = [
    eq(productTags.orgId, orgId),
    eq(productTags.tagId, tagId),
  ];
  if (cursor) {
    conditions.push(gt(productTags.id, cursor));
  }

  const rows = await db
    .select({
      id: productTags.id,
      productId: products.id,
      name: products.name,
      sku: products.sku,
      brandId: products.brandId,
      category: products.category,
      unitPrice: products.unitPrice,
      createdAt: productTags.createdAt,
    })
    .from(productTags)
    .innerJoin(products, eq(products.id, productTags.productId))
    .where(and(...conditions))
    .orderBy(productTags.id)
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));

  return {
    data,
    cursor: hasMore ? data[data.length - 1]?.id : null,
  };
}

// ─── Product Tags ────────────────────────────────────────────────────

export async function getProductTags(orgId: string, productId: string) {
  const rows = await db
    .select({
      id: productTags.id,
      tagId: tags.id,
      tagName: tags.name,
      tagType: tags.tagType,
      createdAt: productTags.createdAt,
    })
    .from(productTags)
    .innerJoin(tags, eq(tags.id, productTags.tagId))
    .where(
      and(eq(productTags.orgId, orgId), eq(productTags.productId, productId)),
    )
    .orderBy(tags.name);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addProductTag(
  orgId: string,
  productId: string,
  tagId: string,
) {
  // Check duplicate
  const existing = await db
    .select({ id: productTags.id })
    .from(productTags)
    .where(
      and(
        eq(productTags.orgId, orgId),
        eq(productTags.productId, productId),
        eq(productTags.tagId, tagId),
      ),
    );

  if (existing.length > 0) {
    return { alreadyExists: true };
  }

  const [row] = await db
    .insert(productTags)
    .values({ orgId, productId, tagId })
    .returning();

  return {
    id: row.id,
    productId: row.productId,
    tagId: row.tagId,
    createdAt: row.createdAt.toISOString(),
    alreadyExists: false,
  };
}

export async function addOrCreateProductTag(opts: {
  orgId: string;
  productId: string;
  name: string;
  tagType: string;
}) {
  const { orgId, productId, tagType } = opts;
  let name = opts.name.trim();
  if (tagType === "TIRE_SIZE") {
    name = name.toUpperCase();
  }

  // Find or create the tag
  let tagRow = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.orgId, orgId), eq(tags.name, name)))
    .then((rows) => rows[0]);

  if (!tagRow) {
    const [created] = await db
      .insert(tags)
      .values({ orgId, name, tagType: tagType as any })
      .returning({ id: tags.id });
    tagRow = created;
  }

  // Assign
  return addProductTag(orgId, productId, tagRow.id);
}

export async function removeProductTag(
  orgId: string,
  productId: string,
  tagId: string,
) {
  const result = await db
    .delete(productTags)
    .where(
      and(
        eq(productTags.orgId, orgId),
        eq(productTags.productId, productId),
        eq(productTags.tagId, tagId),
      ),
    );

  return result;
}

// ─── Bulk Tagging ────────────────────────────────────────────────────

export async function bulkAssignTag(
  orgId: string,
  tagId: string,
  productIds: string[],
) {
  if (productIds.length === 0) return { assigned: 0, skipped: 0 };

  // Find existing assignments to skip
  const existingRows = await db
    .select({ productId: productTags.productId })
    .from(productTags)
    .where(
      and(
        eq(productTags.orgId, orgId),
        eq(productTags.tagId, tagId),
        inArray(productTags.productId, productIds),
      ),
    );

  const existingSet = new Set(existingRows.map((r) => r.productId));
  const newIds = productIds.filter((id) => !existingSet.has(id));

  if (newIds.length > 0) {
    await db.insert(productTags).values(
      newIds.map((productId) => ({
        orgId,
        productId,
        tagId,
      })),
    );
  }

  return { assigned: newIds.length, skipped: existingSet.size };
}

export async function bulkAssignBySearch(opts: {
  orgId: string;
  tagId: string;
  searchQuery: string;
  preview: boolean;
}) {
  const { orgId, tagId, searchQuery, preview } = opts;
  const searchPattern = `%${searchQuery}%`;

  const matchedProducts = await db
    .select({ id: products.id, name: products.name, sku: products.sku })
    .from(products)
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.isActive, true),
        sql`(${ilike(products.name, searchPattern)} OR ${ilike(products.sku, searchPattern)})`,
      ),
    )
    .limit(500);

  if (preview) {
    return {
      preview: true,
      matchCount: matchedProducts.length,
      products: matchedProducts,
    };
  }

  const productIds = matchedProducts.map((p) => p.id);
  const result = await bulkAssignTag(orgId, tagId, productIds);

  return {
    preview: false,
    matchCount: matchedProducts.length,
    ...result,
  };
}

// ─── Auto-Tag Tires ──────────────────────────────────────────────────

const TIRE_SIZE_REGEX = /(\d{3})\s*[\/\\]\s*(\d{2,3})\s*[Rr]\s*(\d{2})/;

export async function autoTagTires(orgId: string) {
  // Find products in TIRES category
  const tireProducts = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(
      and(
        eq(products.orgId, orgId),
        eq(products.isActive, true),
        eq(products.category, "TIRES"),
      ),
    );

  let taggedCount = 0;

  for (const product of tireProducts) {
    const match = product.name.match(TIRE_SIZE_REGEX);
    if (!match) continue;

    const width = match[1];
    const aspect = match[2];
    const rim = match[3];
    const normalized = `${width}/${aspect}R${rim}`;

    // Find or create TIRE_SIZE tag
    let tagRow = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.orgId, orgId), eq(tags.name, normalized)))
      .then((rows) => rows[0]);

    if (!tagRow) {
      const [created] = await db
        .insert(tags)
        .values({
          orgId,
          name: normalized,
          tagType: "TIRE_SIZE",
        })
        .returning({ id: tags.id });
      tagRow = created;
    }

    // Assign (skip if exists)
    const existing = await db
      .select({ id: productTags.id })
      .from(productTags)
      .where(
        and(
          eq(productTags.orgId, orgId),
          eq(productTags.productId, product.id),
          eq(productTags.tagId, tagRow.id),
        ),
      );

    if (existing.length === 0) {
      await db
        .insert(productTags)
        .values({ orgId, productId: product.id, tagId: tagRow.id });
      taggedCount++;
    }
  }

  return {
    scannedProducts: tireProducts.length,
    taggedCount,
  };
}

// ─── Demand Report ───────────────────────────────────────────────────

export async function getDemandByTag(opts: {
  orgId: string;
  tagType?: string;
  from?: string;
  to?: string;
  sortBy?: string;
  cursor?: string;
  limit?: number;
}) {
  const { orgId, tagType, from, to, sortBy, cursor } = opts;
  const limit = Math.min(opts.limit ?? 50, 200);

  // Build dynamic SQL fragments
  const slDateConds: SQL[] = [];
  const hsDateConds: SQL[] = [];
  if (from) {
    slDateConds.push(sql`s.completed_at >= ${from}`);
    hsDateConds.push(sql`hs.movement_date >= ${from}`);
  }
  if (to) {
    slDateConds.push(sql`s.completed_at <= ${to}`);
    hsDateConds.push(sql`hs.movement_date <= ${to}`);
  }
  const slDateWhere = slDateConds.length > 0
    ? sql.join(slDateConds.map(c => sql`AND ${c}`), sql` `)
    : sql``;
  const hsDateWhere = hsDateConds.length > 0
    ? sql.join(hsDateConds.map(c => sql`AND ${c}`), sql` `)
    : sql``;

  const tagTypeFilter = tagType ? sql`AND t.tag_type = ${tagType}` : sql``;
  const cursorFilter = cursor ? sql`AND t.id > ${cursor}` : sql``;

  const rows = await db.execute(sql`
    WITH sale_data AS (
      SELECT sl.product_id, sl.quantity AS qty,
             sl.line_total::numeric AS revenue
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      WHERE sl.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${slDateWhere}
      UNION ALL
      SELECT hs.product_id, hs.quantity AS qty,
             0::numeric AS revenue
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.direction = 'OUT'
        ${hsDateWhere}
    )
    SELECT
      t.id AS tag_id,
      t.name AS tag_name,
      t.tag_type AS tag_type,
      COALESCE(SUM(sd.qty), 0)::text AS total_qty_sold,
      COALESCE(SUM(sd.revenue), 0)::text AS total_revenue,
      COUNT(DISTINCT pt.product_id)::text AS product_count,
      (
        SELECT b.name FROM products p2
        JOIN brands b ON b.id = p2.brand_id
        JOIN product_tags pt2 ON pt2.product_id = p2.id AND pt2.tag_id = t.id
        JOIN sale_data sd2 ON sd2.product_id = p2.id
        GROUP BY b.name
        ORDER BY SUM(sd2.qty) DESC
        LIMIT 1
      ) AS top_brand
    FROM tags t
    JOIN product_tags pt ON pt.tag_id = t.id AND pt.org_id = ${orgId}
    LEFT JOIN sale_data sd ON sd.product_id = pt.product_id
    WHERE t.org_id = ${orgId}
      ${tagTypeFilter}
      ${cursorFilter}
    GROUP BY t.id, t.name, t.tag_type
    ORDER BY ${sortBy === "revenue" ? sql`total_revenue` : sql`total_qty_sold`} DESC, t.id
    LIMIT ${limit + 1}
  `);

  const arrRows = [...rows] as any[];
  const hasMore = arrRows.length > limit;
  const data = arrRows.slice(0, limit).map((r: any) => ({
    tagId: r.tag_id,
    tagName: r.tag_name,
    tagType: r.tag_type,
    totalQtySold: Number(r.total_qty_sold),
    totalRevenue: Number(r.total_revenue),
    productCount: Number(r.product_count),
    topBrand: r.top_brand,
  }));

  return {
    data,
    cursor: hasMore ? data[data.length - 1]?.tagId : null,
    period: { from: from ?? null, to: to ?? null },
  };
}

export async function getTagDemandDetail(opts: {
  orgId: string;
  tagId: string;
  from?: string;
  to?: string;
}) {
  const { orgId, tagId, from, to } = opts;

  const slDateConds: SQL[] = [];
  const hsDateConds: SQL[] = [];
  if (from) {
    slDateConds.push(sql`s.completed_at >= ${from}`);
    hsDateConds.push(sql`hs.movement_date >= ${from}`);
  }
  if (to) {
    slDateConds.push(sql`s.completed_at <= ${to}`);
    hsDateConds.push(sql`hs.movement_date <= ${to}`);
  }
  const slDateWhere = slDateConds.length > 0
    ? sql.join(slDateConds.map(c => sql`AND ${c}`), sql` `)
    : sql``;
  const hsDateWhere = hsDateConds.length > 0
    ? sql.join(hsDateConds.map(c => sql`AND ${c}`), sql` `)
    : sql``;

  const rows = await db.execute(sql`
    WITH sale_data AS (
      SELECT sl.product_id, sl.quantity AS qty,
             sl.line_total::numeric AS revenue
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      WHERE sl.org_id = ${orgId}
        AND s.status = 'COMPLETED'
        ${slDateWhere}
      UNION ALL
      SELECT hs.product_id, hs.quantity AS qty,
             0::numeric AS revenue
      FROM historical_sales hs
      WHERE hs.org_id = ${orgId}
        AND hs.reason_type = 'SALE'
        AND hs.direction = 'OUT'
        ${hsDateWhere}
    )
    SELECT
      p.id AS product_id,
      p.name,
      p.sku,
      b.name AS brand_name,
      p.unit_price::text AS unit_price,
      COALESCE(SUM(sd.qty), 0)::text AS qty_sold,
      COALESCE(SUM(sd.revenue), 0)::text AS revenue,
      COALESCE((
        SELECT SUM(inv.stock_level)::int
        FROM inventory inv
        INNER JOIN locations loc ON loc.id = inv.location_id AND loc.is_active = true
        WHERE inv.product_id = p.id AND inv.org_id = ${orgId}
      ), 0)::text AS current_stock
    FROM product_tags pt
    JOIN products p ON p.id = pt.product_id
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN sale_data sd ON sd.product_id = p.id
    WHERE pt.org_id = ${orgId}
      AND pt.tag_id = ${tagId}
    GROUP BY p.id, p.name, p.sku, b.name, p.unit_price
    ORDER BY COALESCE(SUM(sd.qty), 0) DESC
  `);

  return [...rows].map((r: any) => ({
    productId: r.product_id,
    name: r.name,
    sku: r.sku,
    brandName: r.brand_name,
    sellPrice: Number(r.unit_price),
    qtySold: Number(r.qty_sold),
    revenue: Number(r.revenue),
    currentStock: Number(r.current_stock),
  }));
}
