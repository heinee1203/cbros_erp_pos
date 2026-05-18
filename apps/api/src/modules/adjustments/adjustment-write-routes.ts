import type { FastifyInstance } from "fastify";
import { createAdjustmentSchema } from "@apex/types";
import { createAdjustment } from "./adjustment-route-service";
import {
  isAdjustmentRole,
  isDuplicateAdjustmentRequestError,
} from "./adjustment-route-helpers";

export async function registerAdjustmentWriteRoutes(app: FastifyInstance) {
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!isAdjustmentRole(role)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role for stock adjustments" });
    }

    const parsed = createAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await createAdjustment(
        parsed.data,
        orgId,
        userId,
        role,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      if (isDuplicateAdjustmentRequestError(err)) {
        return reply.status(409).send({
          error: "Duplicate request (idempotency key already used)",
        });
      }

      return reply.status(400).send({ error: err.message });
    }
  });
}
