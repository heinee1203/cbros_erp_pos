import type { FastifyPluginAsync } from "fastify";
import { registerVehicleBulkFitmentRoutes } from "./vehicle-bulk-fitment-routes";
import { registerVehicleListRoutes } from "./vehicle-list-routes";
import { registerVehicleMutationRoutes } from "./vehicle-mutation-routes";
import { registerVehicleProductRoutes } from "./vehicle-product-routes";

export const vehicleRoutes: FastifyPluginAsync = async (app) => {
  await registerVehicleListRoutes(app);
  await registerVehicleMutationRoutes(app);
  await registerVehicleProductRoutes(app);
  await registerVehicleBulkFitmentRoutes(app);
};
