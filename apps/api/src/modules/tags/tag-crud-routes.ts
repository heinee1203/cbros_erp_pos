import type { FastifyInstance } from "fastify";
import {
  createTag,
  deleteTag,
  getTagProducts,
  listTags,
  updateTag,
} from "./tag-route-service";
import {
  canManageTags,
  getTagRouteErrorStatus,
  getUserRole,
  isTagAdmin,
  parseOptionalLimit,
} from "./tag-route-helpers";

export async function registerTagCrudRoutes(app: FastifyInstance) {
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const result = await listTags({
      orgId,
      tagType: q.tagType,
      search: q.search,
      cursor: q.cursor,
      limit: parseOptionalLimit(q.limit),
    });

    return reply.send(result);
  });

  app.post("/", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage tags" });
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
    const userRole = getUserRole(request);
    if (!canManageTags(userRole)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can manage tags" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const body = request.body as { name?: string; description?: string };

    try {
      const result = await updateTag({ orgId, id, ...body });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(getTagRouteErrorStatus(err)).send({ error: err.message });
    }
  });

  app.delete("/:id", async (request, reply) => {
    const userRole = getUserRole(request);
    if (!isTagAdmin(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN can delete tags" });
    }

    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    try {
      await deleteTag(orgId, id);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(getTagRouteErrorStatus(err)).send({ error: err.message });
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
      limit: parseOptionalLimit(q.limit),
    });

    return reply.send(result);
  });
}
