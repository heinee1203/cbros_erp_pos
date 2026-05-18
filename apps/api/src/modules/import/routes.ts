import type { FastifyPluginAsync } from "fastify";
import { requireAnyRole } from "../../lib/require-permission";
import { registerItemImportRoutes } from "./item-routes";
import { registerReceiptImportRoutes } from "./receipt-routes";
import { registerImportMaintenanceRoutes } from "./maintenance-routes";

export const importRoutes: FastifyPluginAsync = async (app) => {
  app.addHook("preHandler", requireAnyRole("ADMIN", "MANAGER"));

  registerItemImportRoutes(app);
  registerReceiptImportRoutes(app);
  registerImportMaintenanceRoutes(app);
};
