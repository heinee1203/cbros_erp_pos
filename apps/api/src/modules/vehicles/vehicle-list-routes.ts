import type { FastifyInstance } from "fastify";
import { listVehicles } from "./vehicle-route-service";
import {
  parseVehicleListOptions,
  type VehicleListQuery,
} from "./vehicle-route-helpers";

export async function registerVehicleListRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as VehicleListQuery;
    const result = await listVehicles(orgId, parseVehicleListOptions(query));
    return reply.send(result);
  });
}
