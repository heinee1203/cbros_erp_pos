import type { FastifyInstance } from "fastify";
import {
  calculateCommissions,
  getTechnician,
  listTechnicians,
} from "./technician-route-service";

export async function registerTechnicianReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as { active?: string; locationId?: string };

    const data = await listTechnicians(orgId, {
      active: query.active === "true" ? true : query.active === "false" ? false : undefined,
      locationId: query.locationId,
    });

    return reply.send({ data });
  });

  app.get("/commissions", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as { from?: string; to?: string; locationId?: string };

    if (!query.from || !query.to) {
      return reply
        .status(400)
        .send({ error: "from and to date parameters are required" });
    }

    const result = await calculateCommissions(orgId, {
      from: query.from,
      to: query.to,
      locationId: query.locationId,
    });

    return reply.send(result);
  });

  app.get("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const tech = await getTechnician(id, orgId);
    if (!tech) return reply.status(404).send({ error: "Technician not found" });

    return reply.send(tech);
  });
}
