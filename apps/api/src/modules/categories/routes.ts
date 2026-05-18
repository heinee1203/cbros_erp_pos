import type { FastifyPluginAsync } from "fastify";
import { registerCategoryMaintenanceRoutes } from "./category-maintenance-routes";
import { registerCategoryMutationRoutes } from "./category-mutation-routes";
import { registerCategoryReadRoutes } from "./category-read-routes";

export const categoryRoutes: FastifyPluginAsync = async (app) => {
  await registerCategoryReadRoutes(app);
  await registerCategoryMutationRoutes(app);
  await registerCategoryMaintenanceRoutes(app);
};
