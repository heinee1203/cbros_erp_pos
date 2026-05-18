import type { FastifyInstance } from "fastify";
import {
  cancelPOSchema,
  closeVariancePOSchema,
  receivePOSchema,
  submitPOSchema,
} from "@apex/types";
import { logAction } from "./procurement-audit-service";
import {
  cancelPO,
  closeWithVariance,
  submitPO,
} from "./purchase-order-lifecycle-service";
import { receivePO } from "./purchase-order-receiving-service";
import { isContentionError, isIdempotencyError } from "./route-support";

export function registerPurchaseOrderLifecycleRoutes(app: FastifyInstance) {
  app.post("/purchase-orders/:id/submit", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = submitPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await submitPO(
        id,
        orgId,
        userId,
        role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      logAction({
        orgId,
        userId,
        action: "PO_SUBMIT",
        entityType: "PO",
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/purchase-orders/:id/receive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = receivePOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await receivePO(id, orgId, userId, role, parsed.data);
      logAction({
        orgId,
        userId,
        action: "PO_RECEIVE",
        entityType: "PO",
        entityId: id,
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      if (isContentionError(err)) {
        return reply
          .status(423)
          .send({ error: "Resource locked — retry in a moment" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/purchase-orders/:id/close-variance", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = closeVariancePOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await closeWithVariance(
        id,
        orgId,
        userId,
        role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply.status(409).send({
          error: "Duplicate request (idempotency key already used)",
        });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/purchase-orders/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = cancelPOSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelPO(
        id,
        orgId,
        userId,
        role,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (isIdempotencyError(err)) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
