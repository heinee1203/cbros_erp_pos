import type { FastifyPluginAsync } from "fastify";
import { registerTagBulkRoutes } from "./tag-bulk-routes";
import { registerTagCrudRoutes } from "./tag-crud-routes";
import { registerTagDemandRoutes } from "./tag-demand-routes";
import { registerTagProductRoutes } from "./tag-product-routes";

export const tagRoutes: FastifyPluginAsync = async (app) => {
  await registerTagCrudRoutes(app);
  await registerTagBulkRoutes(app);
  await registerTagDemandRoutes(app);
  await registerTagProductRoutes(app);
};
