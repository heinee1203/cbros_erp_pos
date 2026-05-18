import type { FastifyPluginAsync } from "fastify";
import { registerJobCardCreateRoute } from "./job-card-create-route";
import { registerJobCardJournalRoute, registerJobCardReadRoutes } from "./job-card-read-routes";
import { registerJobCardServiceOperationRoutes } from "./job-card-service-operation-routes";
import { registerJobCardStateRoutes } from "./job-card-state-routes";

export const jobCardRoutes: FastifyPluginAsync = async (app) => {
  await registerJobCardServiceOperationRoutes(app);
  await registerJobCardCreateRoute(app);
  await registerJobCardReadRoutes(app);
  await registerJobCardStateRoutes(app);
  await registerJobCardJournalRoute(app);
};
