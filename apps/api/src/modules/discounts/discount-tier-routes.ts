import type { FastifyInstance } from "fastify";
import {
  createTier,
  deleteTier,
  listTiersWithCustomerCounts,
  seedDefaultTiers,
  updateTier,
} from "./discount-route-service";

export async function registerDiscountTierRoutes(app: FastifyInstance) {
  app.get("/tiers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    await seedDefaultTiers(orgId);
    const data = await listTiersWithCustomerCounts(orgId);
    return reply.send({ data });
  });

  app.post("/tiers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as any;
    const tier = await createTier(orgId, body);
    return reply.status(201).send(tier);
  });

  app.put("/tiers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const tier = await updateTier(id, orgId, body);
    return reply.send(tier);
  });

  app.delete("/tiers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      await deleteTier(id, orgId);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
