import type { FastifyPluginAsync } from "fastify";
import { registerTransferItemRoutes } from "./transfer-item-routes";
import {
  registerTransferDetailRoutes,
  registerTransferListRoute,
} from "./transfer-read-routes";
import {
  registerTransferCreateRoute,
  registerTransferLifecycleRoutes,
} from "./transfer-workflow-routes";

export const transferRoutes: FastifyPluginAsync = async (app) => {
  await registerTransferListRoute(app);
  await registerTransferCreateRoute(app);
  await registerTransferItemRoutes(app);
  await registerTransferLifecycleRoutes(app);
  await registerTransferDetailRoutes(app);
};
