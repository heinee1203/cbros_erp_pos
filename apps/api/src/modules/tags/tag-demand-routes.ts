import type { FastifyInstance } from "fastify";
import {
  getDemandByTag,
  getTagDemandDetail,
} from "./tag-route-service";
import { parseOptionalLimit } from "./tag-route-helpers";

export async function registerTagDemandRoutes(app: FastifyInstance) {
  app.get("/demand", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await getDemandByTag({
      orgId,
      tagType: q.tagType,
      from: q.from,
      to: q.to,
      sortBy: q.sortBy,
      cursor: q.cursor,
      limit: parseOptionalLimit(q.limit),
    });

    return reply.send(result);
  });

  app.get("/demand/:tagId", async (request, reply) => {
    const { tagId } = request.params as { tagId: string };
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await getTagDemandDetail({
      orgId,
      tagId,
      from: q.from,
      to: q.to,
    });

    return reply.send({ data: result });
  });
}
