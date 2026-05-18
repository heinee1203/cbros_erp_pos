import type { FastifyInstance } from "fastify";
import {
  queryReorderSuggestions,
  queryReorderSummary,
} from "./reorder-query-service";

export async function registerReorderListRoute(app: FastifyInstance) {
  // GET / - paginated suggestions list with summary (register LAST)
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;

    const data = await queryReorderSuggestions({
      orgId,
      search: q.search,
      priority: q.priority,
      supplierId: q.supplierId,
      brandId: q.brandId,
      categoryId: q.categoryId,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    const summary = await queryReorderSummary(orgId);
    return reply.send({ ...data, summary });
  });
}
