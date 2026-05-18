import type { FastifyInstance } from "fastify";
import {
  applyBulkPriceUpdate,
  previewBulkPriceUpdate,
} from "./pricing-route-service";

export async function registerPricingBulkRoutes(app: FastifyInstance) {
  app.post("/bulk-preview", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const body = request.body as {
      rows: Array<{ sku: string; newCost?: string; newSell?: string }>;
    };

    if (!body.rows || !Array.isArray(body.rows) || body.rows.length === 0) {
      return reply.status(400).send({
        error: "rows array is required and must not be empty",
      });
    }

    const result = await previewBulkPriceUpdate(orgId, body.rows);
    return reply.send(result);
  });

  app.post("/bulk-apply", async (request, reply) => {
    const role = (request.user as any)?.role;
    if (role !== "ADMIN" && role !== "MANAGER") {
      return reply.status(403).send({ error: "Admin or Manager role required" });
    }

    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.id;
    const body = request.body as {
      previewToken: string;
      overrides?: Record<string, { newCost?: string; newSell?: string }>;
      autoAdjustSell?: boolean;
      reason?: string;
    };

    if (!body.previewToken) {
      return reply.status(400).send({ error: "previewToken is required" });
    }

    try {
      const result = await applyBulkPriceUpdate(
        orgId,
        userId,
        body.previewToken,
        body.overrides,
        body.autoAdjustSell,
        body.reason,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
