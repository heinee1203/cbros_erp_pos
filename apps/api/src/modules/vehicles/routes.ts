import type { FastifyPluginAsync } from "fastify";
import {
  listVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  unfitAllProducts,
  getVehicleProducts,
  bulkApplyFitment,
  bulkRemoveFitment,
} from "./service";

const MANAGER_ROLES = ["ADMIN", "MANAGER"];

export const vehicleRoutes: FastifyPluginAsync = async (app) => {
  // GET /vehicles — list vehicle definitions
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { search?: string; make?: string; limit?: string; cursor?: string };
    const result = await listVehicles(orgId, {
      search: q.search,
      make: q.make,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
      cursor: q.cursor,
    });
    return reply.send(result);
  });

  // POST /vehicles — create vehicle
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const vehicle = await createVehicle(orgId, body);
    return reply.status(201).send(vehicle);
  });

  // PATCH /vehicles/:id — update vehicle
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const body = request.body as any;
    const updated = await updateVehicle(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Vehicle not found" });
    return reply.send(updated);
  });

  // DELETE /vehicles/:id — delete vehicle (?force=true to remove fitments first)
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const q = request.query as { force?: string };
    try {
      await deleteVehicle(id, orgId, q.force === "true");
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /vehicles/:id/unfit-all — remove all fitments for this vehicle
  app.post("/:id/unfit-all", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const result = await unfitAllProducts(id, orgId);
    return reply.send(result);
  });

  // GET /vehicles/:id/products — products fitted to this vehicle
  app.get("/:id/products", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const prods = await getVehicleProducts(id, orgId);
    return reply.send({ data: prods });
  });

  // POST /vehicles/bulk-apply — apply vehicle fitment to multiple products
  app.post("/bulk-apply", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const { vehicleId, productIds, notes } = request.body as {
      vehicleId: string;
      productIds: string[];
      notes?: string;
    };
    if (!vehicleId || !productIds?.length) {
      return reply.status(400).send({ error: "vehicleId and productIds required" });
    }
    if (productIds.length > 500) {
      return reply.status(400).send({ error: "Maximum 500 products per request" });
    }
    const result = await bulkApplyFitment(orgId, vehicleId, productIds, notes);
    return reply.send(result);
  });

  // POST /vehicles/bulk-remove — remove vehicle fitment from multiple products
  app.post("/bulk-remove", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!MANAGER_ROLES.includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }
    const { vehicleId, productIds } = request.body as {
      vehicleId: string;
      productIds: string[];
    };
    if (!vehicleId || !productIds?.length) {
      return reply.status(400).send({ error: "vehicleId and productIds required" });
    }
    const result = await bulkRemoveFitment(orgId, vehicleId, productIds);
    return reply.send(result);
  });
};
