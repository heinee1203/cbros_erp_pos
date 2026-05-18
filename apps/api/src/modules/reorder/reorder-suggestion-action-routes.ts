import type { FastifyInstance } from "fastify";
import {
  createPurchaseOrdersFromReorderSuggestions,
  dismissReorderSuggestion,
  updateReorderSuggestionQty,
} from "./reorder-suggestion-action-service";

export async function registerReorderSuggestionActionRoutes(app: FastifyInstance) {
  // PATCH /:id/dismiss - mark suggestion as DISMISSED
  app.patch("/:id/dismiss", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const userId = (request.user as any)?.userId;

    await dismissReorderSuggestion({ orgId, id, userId });
    return reply.send({ success: true });
  });

  // PATCH /:id/qty - update suggested qty inline
  app.patch("/:id/qty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const { suggestedQty } = request.body as { suggestedQty: number };

    if (!suggestedQty || suggestedQty < 1) {
      return reply
        .status(400)
        .send({ error: "suggestedQty must be >= 1" });
    }

    await updateReorderSuggestionQty({ orgId, id, suggestedQty });
    return reply.send({ success: true });
  });

  // POST /create-pos - bulk create or update draft POs grouped by supplier
  app.post("/create-pos", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const userId = (request.user as any)?.userId;
    const { suggestionIds } = request.body as { suggestionIds: string[] };

    if (!suggestionIds || suggestionIds.length === 0) {
      return reply
        .status(400)
        .send({ error: "suggestionIds array is required" });
    }

    const result = await createPurchaseOrdersFromReorderSuggestions({
      orgId,
      userId,
      suggestionIds,
    });
    if (!result) {
      return reply
        .status(400)
        .send({ error: "No valid pending suggestions selected" });
    }

    return reply.send({
      success: true,
      results: result.results,
      skippedNoSupplier: result.skippedNoSupplier,
    });
  });
}
