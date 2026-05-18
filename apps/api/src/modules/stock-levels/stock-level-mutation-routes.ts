import type { FastifyInstance } from "fastify";
import {
  updateAvailability,
  updateReorderPoint,
} from "./stock-level-route-service";
import {
  getUserRole,
  isManagerRole,
} from "./stock-level-route-helpers";

export async function registerStockLevelMutationRoutes(app: FastifyInstance) {
  app.patch("/availability", async (request, reply) => {
    if (!isManagerRole(getUserRole(request))) {
      return reply.status(403).send({
        error: "Toggling availability requires ADMIN or MANAGER role",
      });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      productId: string;
      updates: Array<{
        locationId: string;
        availableForSale?: boolean;
        reorderPoint?: number;
        optimalStock?: number;
      }>;
    };

    if (!body.productId || !Array.isArray(body.updates) || body.updates.length === 0) {
      return reply.status(400).send({
        error: "productId and updates[] are required",
      });
    }

    await updateAvailability(orgId, body.productId, body.updates);

    return reply.send({ success: true });
  });

  app.patch("/reorder-point", async (request, reply) => {
    if (!isManagerRole(getUserRole(request))) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can update reorder points" });
    }

    const { orgId, locationId } = request.storeContext!;
    const body = request.body as { productId: string; reorderPoint: number };

    if (!body.productId || typeof body.reorderPoint !== "number" || body.reorderPoint < 0) {
      return reply
        .status(400)
        .send({ error: "productId and reorderPoint (>= 0) required" });
    }

    const result = await updateReorderPoint(
      orgId,
      locationId ?? undefined,
      body.productId,
      body.reorderPoint,
    );

    if (!result) {
      return reply.status(404).send({ error: "Product not found" });
    }

    return reply.send(result);
  });
}
