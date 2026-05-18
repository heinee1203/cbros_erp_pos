import type { FastifyPluginAsync } from "fastify";
import { registerSyncCatalogRoutes } from "./sync-catalog-routes";
import { registerSyncInventoryRoutes } from "./sync-inventory-routes";

export const syncRoutes: FastifyPluginAsync = async (app) => {
  await registerSyncCatalogRoutes(app);
  await registerSyncInventoryRoutes(app);
};
