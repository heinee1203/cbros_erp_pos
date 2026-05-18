import type { FastifyInstance } from "fastify";
import {
  createServiceOperationSchema,
  paginationSchema,
  updateServiceOperationSchema,
} from "@apex/types";
import { isIdempotencyError } from "./job-card-route-errors";
import {
  createServiceOperation,
  getServiceOperation,
  listServiceOperations,
  updateServiceOperation,
} from "./service-operation-service";

export async function registerJobCardServiceOperationRoutes(app: FastifyInstance) {
  // POST /job-cards/service-operations
  app.post("/service-operations", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    const parsed = createServiceOperationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createServiceOperation(parsed.data, orgId, role);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /job-cards/service-operations/:id
  app.patch("/service-operations/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = updateServiceOperationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updateServiceOperation(id, orgId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /job-cards/service-operations
  app.get("/service-operations", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid pagination params" });
    }

    const result = await listServiceOperations(orgId, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });

  // GET /job-cards/service-operations/:id
  app.get("/service-operations/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const result = await getServiceOperation(id, orgId);
    if (!result) return reply.status(404).send({ error: "Service operation not found" });
    return reply.send(result);
  });
}
