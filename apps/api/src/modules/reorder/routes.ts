import type { FastifyPluginAsync } from "fastify";
import { registerReorderAiRoutes } from "./reorder-ai-routes";
import { registerReorderListRoute } from "./reorder-list-route";
import { registerReorderOverviewRoutes } from "./reorder-overview-routes";
import { registerReorderSuggestionActionRoutes } from "./reorder-suggestion-action-routes";

export const reorderRoutes: FastifyPluginAsync = async (app) => {
  await registerReorderOverviewRoutes(app);
  await registerReorderSuggestionActionRoutes(app);
  await registerReorderAiRoutes(app);
  await registerReorderListRoute(app);
};
