import type { FastifyInstance } from "fastify";
import {
  listCommissionRateProducts,
  updateProductCommissionRate,
} from "./technician-route-service";
import {
  canManageTechnicians,
  getUserRole,
} from "./technician-route-helpers";

export async function registerTechnicianCommissionRoutes(app: FastifyInstance) {
  app.get("/commission-rates", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await listCommissionRateProducts(orgId);
    return reply.send({ data: rows });
  });

  app.patch("/commission-rates/:productId", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can edit commission rates" });
    }

    const { orgId } = request.storeContext!;
    const { productId } = request.params as { productId: string };
    const body = request.body as { commissionAmount: number | null };

    const updated = await updateProductCommissionRate(
      orgId,
      productId,
      body.commissionAmount,
    );

    if (!updated) return reply.status(404).send({ error: "Product not found" });
    return reply.send(updated);
  });
}
