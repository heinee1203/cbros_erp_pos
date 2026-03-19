import type { FastifyPluginAsync } from "fastify";
import {
  createReturnSchema,
  completeReturnSchema,
  voidReturnSchema,
} from "@apex/types";
import { REFUND_ROLES } from "@apex/types";
import {
  createReturn,
  completeReturn,
  voidReturn,
  getReturn,
  listReturns,
} from "./service";
import { parseQuery } from "../../lib/validate-query";
import { z } from "zod";

const returnsQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  status: z.string().optional(),
  originalSaleId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional(),
  allLocations: z.enum(["true", "false"]).optional(),
});

export const returnsRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /returns ──────────────────────────────
  // List returns with filters + cursor pagination
  app.get("/", async (request, reply) => {
    const q = parseQuery(returnsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listReturns(orgId, {
      locationId: allLocations ? undefined : locationId,
      status: q.status?.split(",").filter(Boolean),
      originalSaleId: q.originalSaleId,
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /returns/:id ──────────────────────────
  // Return detail with lines, sale, customer
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getReturn(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Return not found" });
    }
    return reply.send(result);
  });

  // ─── POST /returns ─────────────────────────────
  // Create a new return in DRAFT status
  app.post("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply
        .status(400)
        .send({ error: "A specific location must be selected for this operation" });
    }
    const { userId, role } = request.user;

    if (!REFUND_ROLES.includes(role as any)) {
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
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("idempotency")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /returns/:id/complete ────────────────
  // Complete a return — requires manager PIN
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

  // ─── POST /returns/:id/void ────────────────────
  // Void a completed return (ADMIN only)
  app.post("/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (role !== "ADMIN") {
      return reply
        .status(403)
        .send({ error: "Only ADMIN can void returns" });
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
};
