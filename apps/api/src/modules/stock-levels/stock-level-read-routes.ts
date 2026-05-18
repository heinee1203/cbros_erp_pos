import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@apex/types";
import {
  getProductLocations,
  queryProductStockLevels,
  queryStockLevels,
  type SortDir,
  type SortField,
} from "./stock-level-route-service";
import {
  getUserRole,
  isManagerRole,
  VALID_SORT_DIRS,
  VALID_SORT_FIELDS,
  VALID_STOCK_STATUSES,
} from "./stock-level-route-helpers";

export async function registerStockLevelReadRoutes(app: FastifyInstance) {
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
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true" || !locationId;
    const search = q.search;
    const category = q.category;
    const familyId = q.familyId;
    const categoryId = q.categoryId;
    const subcategoryId = q.subcategoryId;
    const stockStatus = q.stockStatus;
    const belowReorder = q.belowReorder === "true";
    const overrideLocationId = q.locationId;
    const sortBy = q.sortBy as SortField | undefined;
    const sortDir = q.sortDir as SortDir | undefined;

    if (stockStatus && !VALID_STOCK_STATUSES.includes(stockStatus)) {
      return reply
        .status(400)
        .send({ error: `Invalid stockStatus: ${stockStatus}` });
    }

    if (sortBy && !VALID_SORT_FIELDS.includes(sortBy)) {
      return reply.status(400).send({ error: `Invalid sortBy: ${sortBy}` });
    }
    if (sortDir && !VALID_SORT_DIRS.includes(sortDir)) {
      return reply.status(400).send({ error: `Invalid sortDir: ${sortDir}` });
    }

    if (allLocations && !isManagerRole(getUserRole(request))) {
      return reply.status(403).send({
        error: "Cross-location access requires ADMIN or MANAGER role",
      });
    }

    const view = q.view;

    if (view === "product") {
      const result = await queryProductStockLevels({
        orgId,
        defaultLocationId: locationId ?? "",
        allLocations: true,
        search,
        category,
        familyId,
        categoryId,
        subcategoryId,
        stockStatus: stockStatus as any,
        belowReorder,
        sortBy,
        sortDir,
        cursor,
        limit,
      });
      return reply.send(result);
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
}
