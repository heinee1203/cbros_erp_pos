import type { FastifyInstance } from "fastify";
import {
  autoTagTires,
  bulkAssignBySearch,
  bulkAssignTag,
} from "./tag-route-service";
import { canManageTags, getUserRole } from "./tag-route-helpers";

export async function registerTagBulkRoutes(app: FastifyInstance) {
  app.post("/:id/bulk-assign", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can bulk assign tags" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { productIds: string[] };

    if (!Array.isArray(body.productIds)) {
      return reply.status(400).send({ error: "productIds array is required" });
    }

    const result = await bulkAssignTag(orgId, id, body.productIds);
    return reply.send(result);
  });

  app.post("/bulk-assign-by-search", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can bulk assign tags" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      tagId: string;
      searchQuery: string;
      preview?: boolean;
    };

    if (!body.tagId || !body.searchQuery) {
      return reply
        .status(400)
        .send({ error: "tagId and searchQuery are required" });
    }

    const result = await bulkAssignBySearch({
      orgId,
      tagId: body.tagId,
      searchQuery: body.searchQuery,
      preview: body.preview ?? true,
    });

    return reply.send(result);
  });

  app.post("/auto-tag-tires", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can auto-tag tires" });
    }

    const { orgId } = request.storeContext!;
    const result = await autoTagTires(orgId);
    return reply.send(result);
  });
}
