import type { FastifyInstance } from "fastify";
import {
  addLaborSchema,
  addPartsSchema,
  approveJobCardSchema,
  cancelJobCardSchema,
  issuePartsSchema,
  JobCardStatus,
  returnPartsSchema,
  transitionJobCardSchema,
  updatePartQtySchema,
} from "@apex/types";
import { isContentionError, isIdempotencyError } from "./job-card-route-errors";
import {
  addLabor,
  addParts,
  approveJobCard,
  cancelJobCard,
  issueParts,
  returnParts,
  transitionJobCard,
  updatePartQty,
} from "./job-card-workflow-service";

export async function registerJobCardStateRoutes(app: FastifyInstance) {
  // POST /job-cards/:id/check-in - SCHEDULED -> CHECKED_IN
  app.post("/:id/check-in", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.CHECKED_IN,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/start-estimating - CHECKED_IN -> ESTIMATING
  app.post("/:id/start-estimating", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.ESTIMATING,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/labor - Add labor lines
  app.post("/:id/labor", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = addLaborSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addLabor(id, orgId, userId, role, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/parts - Add part lines
  app.post("/:id/parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = addPartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await addParts(id, orgId, userId, role, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PATCH /job-cards/parts/:partId/qty - Update planned qty
  app.patch("/parts/:partId/qty", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { partId } = request.params as { partId: string };

    const parsed = updatePartQtySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await updatePartQty(
        partId, orgId, userId, role,
        parsed.data.plannedQty,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/approve - ESTIMATING -> APPROVED
  app.post("/:id/approve", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = approveJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await approveJobCard(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/move-to-bay - WAITING_FOR_PARTS -> READY_FOR_BAY
  app.post("/:id/move-to-bay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.READY_FOR_BAY,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/start-work - READY_FOR_BAY -> IN_PROGRESS
  app.post("/:id/start-work", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.IN_PROGRESS,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/issue-parts - Issue parts
  app.post("/:id/issue-parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = issuePartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await issueParts(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/return-parts - Return parts
  app.post("/:id/return-parts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = returnPartsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await returnParts(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/complete-work - IN_PROGRESS -> WORK_COMPLETED
  app.post("/:id/complete-work", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.WORK_COMPLETED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/invoice - WORK_COMPLETED -> INVOICED
  app.post("/:id/invoice", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.INVOICED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/close - INVOICED -> CLOSED
  app.post("/:id/close", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = transitionJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await transitionJobCard(
        id, orgId, userId, role,
        JobCardStatus.CLOSED,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /job-cards/:id/cancel - Any pre-INVOICED -> CANCELLED
  app.post("/:id/cancel", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    const { id } = request.params as { id: string };

    const parsed = cancelJobCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelJobCard(
        id, orgId, userId, role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) return reply.status(409).send({ error: err.message });
      if (isContentionError(err)) return reply.status(423).send({ error: err.message });
      return reply.status(400).send({ error: err.message });
    }
  });
}
