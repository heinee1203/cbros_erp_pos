import type { FastifyInstance } from "fastify";
import {
  backfillHistoricalTechnicians,
  batchUpdateTechnicians,
  createTechnician,
  deactivateTechnician,
  seedFromProducts,
  seedTechnicians,
  updateTechnician,
} from "./technician-route-service";
import {
  canManageTechnicians,
  getTechnicianErrorStatus,
  getUserRole,
} from "./technician-route-helpers";

export async function registerTechnicianWriteRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as any;

    if (!body?.name) {
      return reply.status(400).send({ error: "name is required" });
    }

    try {
      const result = await createTechnician(body, orgId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/seed", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can seed technicians" });
    }

    const { orgId, locationId } = request.storeContext!;
    const result = await seedTechnicians(orgId, locationId ?? undefined);
    return reply.send(result);
  });

  app.post("/batch-update", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can batch update" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      ids: string[];
      updates: {
        locationId?: string;
        commissionRate?: number;
        commissionType?: string;
      };
    };

    if (!body?.ids?.length || !body?.updates) {
      return reply.status(400).send({ error: "ids and updates are required" });
    }

    try {
      const result = await batchUpdateTechnicians(orgId, body.ids, body.updates);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/seed-from-products", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can seed technicians" });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await seedFromProducts(orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  app.post("/backfill-historical", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can run backfill" });
    }

    const { orgId } = request.storeContext!;
    const result = await backfillHistoricalTechnicians(orgId);
    return reply.send(result);
  });

  app.put("/:id", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    try {
      const result = await updateTechnician(id, body, orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(getTechnicianErrorStatus(err)).send({ error: err.message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTechnicians(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    try {
      await deactivateTechnician(id, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(getTechnicianErrorStatus(err)).send({ error: err.message });
    }
  });
}
