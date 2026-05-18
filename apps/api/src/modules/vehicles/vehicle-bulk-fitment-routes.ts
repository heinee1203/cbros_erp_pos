import type { FastifyInstance } from "fastify";
import {
  bulkApplyFitment,
  bulkRemoveFitment,
} from "./vehicle-route-service";
import {
  canManageVehicles,
  sendVehicleManagerRequired,
  type BulkApplyFitmentBody,
  type BulkRemoveFitmentBody,
} from "./vehicle-route-helpers";

export async function registerVehicleBulkFitmentRoutes(app: FastifyInstance) {
  app.post("/bulk-apply", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const { vehicleId, productIds, notes } = request.body as BulkApplyFitmentBody;
    if (!vehicleId || !productIds?.length) {
      return reply.status(400).send({ error: "vehicleId and productIds required" });
    }
    if (productIds.length > 500) {
      return reply.status(400).send({ error: "Maximum 500 products per request" });
    }
    const result = await bulkApplyFitment(orgId, vehicleId, productIds, notes);
    return reply.send(result);
  });

  app.post("/bulk-remove", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!canManageVehicles(role)) {
      return sendVehicleManagerRequired(reply);
    }
    const { vehicleId, productIds } = request.body as BulkRemoveFitmentBody;
    if (!vehicleId || !productIds?.length) {
      return reply.status(400).send({ error: "vehicleId and productIds required" });
    }
    const result = await bulkRemoveFitment(orgId, vehicleId, productIds);
    return reply.send(result);
  });
}
