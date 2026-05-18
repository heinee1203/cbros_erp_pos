import type { FastifyInstance } from "fastify";
import { getDotBatchSummary, listDotBatches } from "./dot-batch-route-service";
import type { DotBatchListQuery, DotBatchSummaryQuery } from "./dot-batch-route-helpers";
import { parseDotBatchListOptions } from "./dot-batch-route-helpers";

export async function registerDotBatchReadRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as DotBatchListQuery;

    const result = await listDotBatches(orgId, parseDotBatchListOptions(query));

    return reply.send(result);
  });

  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as DotBatchSummaryQuery;

    if (!query.productId) {
      return reply.status(400).send({ error: "productId is required" });
    }

    const summary = await getDotBatchSummary(orgId, query.productId);
    return reply.send(summary);
  });
}
