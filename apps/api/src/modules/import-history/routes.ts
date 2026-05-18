import type { FastifyPluginAsync } from "fastify";
import { registerImportHistoryBatchRoutes } from "./import-history-batch-routes";
import { registerImportHistoryImportRoutes } from "./import-history-import-routes";
import { registerImportHistoryProgressRoutes } from "./import-history-progress-routes";

export const importHistoryRoutes: FastifyPluginAsync = async (app) => {
  await registerImportHistoryImportRoutes(app);
  await registerImportHistoryProgressRoutes(app);
  await registerImportHistoryBatchRoutes(app);
};
