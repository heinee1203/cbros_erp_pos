import type { FastifyPluginAsync } from "fastify";
import { registerInventoryCountReadRoutes } from "./inventory-count-read-routes";
import { registerInventoryCountWorkflowRoutes } from "./inventory-count-workflow-routes";

export const inventoryCountRoutes: FastifyPluginAsync = async (app) => {
  await registerInventoryCountReadRoutes(app);
  await registerInventoryCountWorkflowRoutes(app);
};
