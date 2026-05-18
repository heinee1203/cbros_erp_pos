import type { FastifyPluginAsync } from "fastify";
import { registerProductSupplierMaintenanceRoutes } from "./product-supplier-maintenance-routes";
import { registerProductSupplierMutationRoutes } from "./product-supplier-mutation-routes";
import { registerProductSupplierReadRoutes } from "./product-supplier-read-routes";

export const productSuppliersRoutes: FastifyPluginAsync = async (app) => {
  await registerProductSupplierMaintenanceRoutes(app);
  await registerProductSupplierReadRoutes(app);
  await registerProductSupplierMutationRoutes(app);
};
