import type { FastifyPluginAsync } from "fastify";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  getTagProducts,
  getProductTags,
  addProductTag,
  addOrCreateProductTag,
  removeProductTag,
  bulkAssignTag,
  bulkAssignBySearch,
  autoTagTires,
  getDemandByTag,
  getTagDemandDetail,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const tagRoutes: FastifyPluginAsync = async (app) => {
  // ── Tags CRUD ────────────────────────────────────────────────────

  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await listTags({
      orgId,
      tagType: q.tagType,
      search: q.search,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage tags" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      name: string;
      tagType: string;
      description?: string;
    };

    if (!body.name || !body.tagType) {
      return reply.status(400).send({ error: "name and tagType are required" });
    }

    try {
      const result = await createTag({
        orgId,
        name: body.name,
        tagType: body.tagType,
        description: body.description,
      });
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage tags" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { name?: string; description?: string };

    try {
      const result = await updateTag({ orgId, id, ...body });
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Only ADMIN can delete tags" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      await deleteTag(orgId, id);
      return reply.status(204).send();
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  app.get("/:id/products", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await getTagProducts({
      orgId,
      tagId: id,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });

    return reply.send(result);
  });

  // ── Bulk Operations ──────────────────────────────────────────────

  app.post("/:id/bulk-assign", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can bulk assign tags" });
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
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can bulk assign tags" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      tagId: string;
      searchQuery: string;
      preview?: boolean;
    };

    if (!body.tagId || !body.searchQuery) {
      return reply.status(400).send({ error: "tagId and searchQuery are required" });
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
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can auto-tag tires" });
    }

    const { orgId } = request.storeContext!;
    const result = await autoTagTires(orgId);
    return reply.send(result);
  });

  // ── Demand Report ────────────────────────────────────────────────

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
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
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

  // ── Product Tags (by-product paths) ──────────────────────────────

  app.get("/by-product/:productId", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;

    const result = await getProductTags(orgId, productId);
    return reply.send({ data: result });
  });

  app.post("/by-product/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage product tags" });
    }

    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { tagId?: string; name?: string; tagType?: string };

    // If tagId provided, directly assign; otherwise find-or-create by name
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
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage product tags" });
    }

    const { productId, tagId } = request.params as {
      productId: string;
      tagId: string;
    };
    const { orgId } = request.storeContext!;

    await removeProductTag(orgId, productId, tagId);
    return reply.status(204).send();
  });
};
