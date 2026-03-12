import type { FastifyPluginAsync } from "fastify";
import { paginationSchema } from "@apex/types";
import { queryStockLevels } from "./service";

const VALID_CATEGORIES = [
  "TIRES",
  "LUBRICANTS",
  "HARD_PARTS",
  "ACCESSORIES",
  "LABOR_SERVICES",
];

const VALID_STOCK_STATUSES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"];

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

    const allLocations = q.allLocations === "true";
    const search = q.search;
    const category = q.category;
    const stockStatus = q.stockStatus;
    const belowReorder = q.belowReorder === "true";
    const overrideLocationId = q.locationId;

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
      defaultLocationId: locationId,
      allLocations,
      locationId: overrideLocationId,
      search,
      category,
      stockStatus: stockStatus as any,
      belowReorder,
      cursor,
      limit,
    });

    return reply.send(result);
  });
};
