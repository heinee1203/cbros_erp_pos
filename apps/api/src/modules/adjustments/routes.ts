import type { FastifyPluginAsync } from "fastify";
import { createAdjustmentSchema } from "@apex/types";
import { UserRole } from "@apex/types";
import { createAdjustment } from "./service";

// Roles allowed to make manual adjustments
const ADJUSTMENT_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

export const adjustmentRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /inventory/adjustments ───────────────────
  // Create a manual stock adjustment
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    // Cashiers cannot make adjustments
    if (!ADJUSTMENT_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Insufficient role for stock adjustments" });
    }

    const parsed = createAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
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
      // Idempotency check — duplicate key means request was already processed
      // postgres.js uses err.code '23505' for unique_violation
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("duplicate key") ||
        err.message?.includes("idempotency_key")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
};
