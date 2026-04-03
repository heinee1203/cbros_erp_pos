import type { FastifyPluginAsync } from "fastify";
import { listDotBatches, getDotBatchSummary } from "./service";

export const dotBatchRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /inventory/dot-batches ───────────────────
  // List DOT batches for a product at a location
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await listDotBatches(orgId, {
      productId: q.productId,
      locationId: q.locationId,
      inStock: q.inStock === "true",
      limit: q.limit ? parseInt(q.limit, 10) : 50,
      cursor: q.cursor,
    });

    return reply.send(result);
  });

  // ─── GET /inventory/dot-batches/summary ───────────────────
  // Summary stats for a product's DOT batches
  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { productId?: string };

    if (!q.productId) {
      return reply.status(400).send({ error: "productId is required" });
    }

    const summary = await getDotBatchSummary(orgId, q.productId);
    return reply.send(summary);
  });
};
