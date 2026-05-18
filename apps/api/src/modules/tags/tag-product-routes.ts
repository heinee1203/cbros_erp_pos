import type { FastifyInstance } from "fastify";
import {
  addOrCreateProductTag,
  addProductTag,
  getProductTags,
  removeProductTag,
} from "./tag-route-service";
import { canManageTags, getUserRole } from "./tag-route-helpers";

export async function registerTagProductRoutes(app: FastifyInstance) {
  app.get("/by-product/:productId", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;

    const result = await getProductTags(orgId, productId);
    return reply.send({ data: result });
  });

  app.post("/by-product/:productId", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage product tags" });
    }

    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { tagId?: string; name?: string; tagType?: string };

    if (body.tagId) {
      const result = await addProductTag(orgId, productId, body.tagId);
      return reply.status(201).send(result);
    }

    if (body.name && body.tagType) {
      const result = await addOrCreateProductTag({
        orgId,
        productId,
        name: body.name,
        tagType: body.tagType,
      });
      return reply.status(201).send(result);
    }

    return reply.status(400).send({
      error: "Either tagId or (name + tagType) is required",
    });
  });

  app.delete("/by-product/:productId/:tagId", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage product tags" });
    }

    const { productId, tagId } = request.params as {
      productId: string;
      tagId: string;
    };
    const { orgId } = request.storeContext!;

    await removeProductTag(orgId, productId, tagId);
    return reply.status(204).send();
  });
}
