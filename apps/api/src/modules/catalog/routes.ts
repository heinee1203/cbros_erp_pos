import type { FastifyPluginAsync } from "fastify";
import { registerCatalogApiKeyAuthHook } from "./catalog-auth-hook";
import { registerCatalogItemRoutes } from "./catalog-item-routes";
import { registerCatalogSearchRoutes } from "./catalog-search-routes";

export const catalogRoutes: FastifyPluginAsync = async (app) => {
  registerCatalogApiKeyAuthHook(app);
  await registerCatalogSearchRoutes(app);
  await registerCatalogItemRoutes(app);
};
