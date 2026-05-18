import type { FastifyInstance } from "fastify";
import {
  completeReturnSchema,
  createReturnSchema,
  voidReturnSchema,
} from "@apex/types";
import {
  completeReturn,
  createReturn,
  voidReturn,
} from "./return-route-service";
import {
  canCreateReturn,
  isDuplicateReturnRequestError,
} from "./return-route-helpers";

export async function registerReturnWorkflowRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({
        error: "A specific location must be selected for this operation",
      });
    }
    const { userId, role } = request.user;

    if (!canCreateReturn(role)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can create returns" });
    }

    const parsed = createReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createReturn(orgId, locationId, userId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (isDuplicateReturnRequestError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId } = request.user;

    const parsed = completeReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await completeReturn(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (role !== "ADMIN") {
      return reply.status(403).send({ error: "Only ADMIN can void returns" });
    }

    const parsed = voidReturnSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await voidReturn(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
