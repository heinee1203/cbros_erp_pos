import type { FastifyInstance } from "fastify";
import {
  createVehicle,
  deleteVehicle,
  unfitAllProducts,
  updateVehicle,
} from "./vehicle-route-service";
import {
  canManageVehicles,
  sendVehicleManagerRequired,
  type VehicleDeleteQuery,
} from "./vehicle-route-helpers";

export async function registerVehicleMutationRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const body = request.body as any;
    const vehicle = await createVehicle(orgId, body);
    return reply.status(201).send(vehicle);
  });

  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const body = request.body as any;
    const updated = await updateVehicle(id, orgId, body);
    if (!updated) return reply.status(404).send({ error: "Vehicle not found" });
    return reply.send(updated);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const query = request.query as VehicleDeleteQuery;
    try {
      await deleteVehicle(id, orgId, query.force === "true");
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/unfit-all", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const result = await unfitAllProducts(id, orgId);
    return reply.send(result);
  });
}
