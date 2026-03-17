import type { FastifyPluginAsync } from "fastify";
import { paginationSchema } from "@apex/types";
import { db } from "@apex/database";
import { products, inventory } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";
import { queryStockLevels, getProductLocations, updateAvailability, type SortField, type SortDir } from "./service";

const VALID_CATEGORIES = [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
];

const VALID_STOCK_STATUSES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"];

const VALID_SORT_FIELDS: SortField[] = [
  "name", "sku", "category", "location", "stockLevel",
  "reservedLevel", "available", "reorderPoint", "status",
];

const VALID_SORT_DIRS: SortDir[] = ["asc", "desc"];

export const stockLevelsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /inventory/stock-levels
   *
   * Returns paginated inventory rows enriched with product, location,
   * family data, computed available stock, and derived status.
   * Includes aggregate summary stats for the current filter set.
   *
   * Scoped to storeContext.locationId by default.
   * allLocations=true requires ADMIN or MANAGER role.
   */
  app.get("/", async (request, reply) => {
    const pageParsed = paginationSchema.safeParse(request.query);
    if (!pageParsed.success) {
      return reply.status(400).send({
        error: "Invalid pagination params",
        details: pageParsed.error.flatten(),
      });
    }

    const { cursor, limit } = pageParsed.data;
    const { orgId, locationId } = request.storeContext!;

    // Parse optional query params
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true" || !locationId;
    const search = q.search;
    const category = q.category;
    const stockStatus = q.stockStatus;
    const belowReorder = q.belowReorder === "true";
    const overrideLocationId = q.locationId;
    const sortBy = q.sortBy as SortField | undefined;
    const sortDir = q.sortDir as SortDir | undefined;

    // Validate category
    if (category && !VALID_CATEGORIES.includes(category)) {
      return reply.status(400).send({ error: `Invalid category: ${category}` });
    }

    // Validate stockStatus
    if (stockStatus && !VALID_STOCK_STATUSES.includes(stockStatus)) {
      return reply
        .status(400)
        .send({ error: `Invalid stockStatus: ${stockStatus}` });
    }

    // Validate sort params
    if (sortBy && !VALID_SORT_FIELDS.includes(sortBy)) {
      return reply.status(400).send({ error: `Invalid sortBy: ${sortBy}` });
    }
    if (sortDir && !VALID_SORT_DIRS.includes(sortDir)) {
      return reply.status(400).send({ error: `Invalid sortDir: ${sortDir}` });
    }

    // Cross-location guard — only ADMIN/MANAGER can see all locations
    if (allLocations) {
      const userRole = (request.user as any)?.role;
      if (userRole !== "ADMIN" && userRole !== "MANAGER") {
        return reply.status(403).send({
          error: "Cross-location access requires ADMIN or MANAGER role",
        });
      }
    }

    const result = await queryStockLevels({
      orgId,
      defaultLocationId: locationId ?? "",
      allLocations,
      locationId: overrideLocationId,
      search,
      category,
      stockStatus: stockStatus as any,
      belowReorder,
      sortBy,
      sortDir,
      cursor,
      limit,
    });

    return reply.send(result);
  });

  /**
   * GET /inventory/stock-levels/product/:productId/locations
   *
   * Returns inventory rows for a single product across ALL active locations.
   * Used by the web product detail drawer "Stores" section.
   */
  app.get<{ Params: { productId: string } }>(
    "/product/:productId/locations",
    async (request, reply) => {
      const { orgId } = request.storeContext!;
      const { productId } = request.params;

      if (!productId) {
        return reply.status(400).send({ error: "productId is required" });
      }

      const rows = await getProductLocations(orgId, productId);
      return reply.send({ data: rows });
    },
  );

  /**
   * PATCH /inventory/stock-levels/availability
   *
   * Batch toggle available_for_sale for a product across multiple locations.
   * Creates inventory rows (with stock=0) if they don't exist.
   * ADMIN/MANAGER only.
   */
  app.patch("/availability", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (userRole !== "ADMIN" && userRole !== "MANAGER") {
      return reply.status(403).send({
        error: "Toggling availability requires ADMIN or MANAGER role",
      });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productId: string;
      updates: Array<{ locationId: string; availableForSale?: boolean; reorderPoint?: number; optimalStock?: number }>;
    };

    if (!body.productId || !Array.isArray(body.updates) || body.updates.length === 0) {
      return reply.status(400).send({
        error: "productId and updates[] are required",
      });
    }

    await updateAvailability(orgId, body.productId, body.updates);

    return reply.send({ success: true });
  });

  /**
   * PATCH /inventory/stock-levels/reorder-point
   * Update reorder point for a product's inventory row(s).
   * If locationId is set, update that location only.
   * If locationId is null (All Locations), update ALL inventory rows for this product.
   */
  app.patch("/reorder-point", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!["ADMIN", "MANAGER"].includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can update reorder points" });
    }

    const { orgId, locationId } = request.storeContext!;
    const body = request.body as { productId: string; reorderPoint: number };

    if (!body.productId || typeof body.reorderPoint !== "number" || body.reorderPoint < 0) {
      return reply.status(400).send({ error: "productId and reorderPoint (>= 0) required" });
    }

    // Verify product belongs to org
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, body.productId), eq(products.orgId, orgId)))
      .limit(1);

    if (!product) {
      return reply.status(404).send({ error: "Product not found" });
    }

    // Update reorder point
    const conditions = [eq(inventory.productId, body.productId)];
    if (locationId) {
      conditions.push(eq(inventory.locationId, locationId));
    }

    const result = await db
      .update(inventory)
      .set({ reorderPoint: body.reorderPoint })
      .where(and(...conditions))
      .returning({ id: inventory.id });

    return reply.send({ updated: result.length });
  });
};
