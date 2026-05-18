import type { FastifyInstance } from "fastify";
import { getPromo, listPromos } from "./promo-route-service";

export async function registerPromoReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rules = await listPromos(orgId);
    return reply.send({ data: rules });
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const rule = await getPromo(id, orgId);
    if (!rule) return reply.status(404).send({ error: "Promo rule not found" });
    return reply.send(rule);
  });
}
