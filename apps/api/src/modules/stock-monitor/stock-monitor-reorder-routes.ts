import type { FastifyInstance } from "fastify";
import { getReorderSuggestions } from "./stock-monitor-query-service";
import { buildReorderSuggestionQuery } from "./stock-monitor-route-helpers";

export async function registerStockMonitorReorderRoutes(app: FastifyInstance) {
  app.get("/reorder-suggestions", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;
    const suggestions = await getReorderSuggestions(
      orgId,
      buildReorderSuggestionQuery(q),
    );
    return reply.send({ data: suggestions });
  });
}
