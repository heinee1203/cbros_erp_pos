import type { FastifyInstance } from "fastify";
import { registerItemPreviewRoutes } from "./item-preview-routes";
import { registerItemExecutionRoutes } from "./item-execution-routes";
import { registerItemRollbackRoutes } from "./item-rollback-routes";
import { registerImportProfileRoutes } from "./import-profile-routes";
import { registerLocationMappingRoutes } from "./location-mapping-routes";

export function registerItemImportRoutes(app: FastifyInstance) {
  registerItemPreviewRoutes(app);
  registerItemExecutionRoutes(app);
  registerItemRollbackRoutes(app);
  registerImportProfileRoutes(app);
  registerLocationMappingRoutes(app);
}
