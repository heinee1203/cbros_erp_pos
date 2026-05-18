import type { FastifyInstance } from "fastify";
import {
  createPromo,
  deactivatePromo,
  updatePromo,
} from "./promo-route-service";
import {
  canManagePromos,
  sendPromoAdminRequired,
  sendPromoManageRequired,
} from "./promo-route-helpers";

export async function registerPromoMutationRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    if (!canManagePromos(role)) {
      return sendPromoManageRequired(reply);
    }
    const body = request.body as any;
    const rule = await createPromo(orgId, userId, body);
    return reply.status(201).send(rule);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManagePromos(role)) {
      return sendPromoManageRequired(reply);
    }
    const body = request.body as any;
    const updated = await updatePromo(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Promo rule not found" });
    return reply.send(updated);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (role !== "ADMIN") {
      return sendPromoAdminRequired(reply);
    }
    await deactivatePromo(id, orgId);
    return reply.send({ success: true });
  });
}
