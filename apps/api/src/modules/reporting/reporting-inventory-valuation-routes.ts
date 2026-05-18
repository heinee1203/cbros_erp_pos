import type { FastifyInstance } from "fastify";
import {
  getInventoryValuation,
  getInventoryValuationDetail,
} from "./inventory-valuation";

export async function registerReportingInventoryValuationRoutes(
  app: FastifyInstance,
) {
  app.get("/inventory-valuation", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      locationId?: string;
      groupBy?: string;
      allLocations?: string;
      categoryId?: string;
      brandId?: string;
      excludeZeroCost?: string;
      excludeZeroSell?: string;
    };

    const effectiveLocationId =
      query.allLocations === "true" || !locationId
        ? query.locationId || undefined
        : query.locationId || locationId;

    const data = await getInventoryValuation(orgId, {
      locationId: effectiveLocationId,
      groupBy: (query.groupBy as any) || "category",
      categoryId: query.categoryId || undefined,
      brandId: query.brandId || undefined,
      excludeZeroCost: query.excludeZeroCost === "true",
      excludeZeroSell: query.excludeZeroSell === "true",
    });

    return reply.send(data);
  });

  app.get("/inventory-valuation/detail", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const query = request.query as {
      groupBy?: string;
      groupName?: string;
      locationId?: string;
      cursor?: string;
      limit?: string;
      allLocations?: string;
      categoryId?: string;
      brandId?: string;
      excludeZeroCost?: string;
      excludeZeroSell?: string;
    };

    if (!query.groupName) {
      return reply.status(400).send({ error: "groupName is required" });
    }

    const effectiveLocationId =
      query.allLocations === "true" || !locationId
        ? query.locationId || undefined
        : query.locationId || locationId;

    const data = await getInventoryValuationDetail(orgId, {
      groupBy: (query.groupBy as any) || "category",
      groupName: query.groupName,
      locationId: effectiveLocationId,
      cursor: query.cursor,
      limit: query.limit ? parseInt(query.limit, 10) : 50,
      categoryId: query.categoryId || undefined,
      brandId: query.brandId || undefined,
      excludeZeroCost: query.excludeZeroCost === "true",
      excludeZeroSell: query.excludeZeroSell === "true",
    });

    return reply.send(data);
  });
}
