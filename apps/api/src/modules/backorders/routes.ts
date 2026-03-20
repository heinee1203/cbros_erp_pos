import type { FastifyPluginAsync } from "fastify";
import {
  listBackorders,
  getBackordersBySupplier,
  getBackordersForSupplier,
  createBackorder,
  createBackordersBulk,
  updateBackorder,
  cancelBackorder,
  includeInPO,
  getBackorderSummary,
  escalateAgingBackorders,
  getPendingBackorderCount,
} from "./service";

const BACKORDER_ROLES = ["ADMIN", "MANAGER"];

function assertBackorderRole(role: string) {
  if (!BACKORDER_ROLES.includes(role)) {
    throw new Error("Insufficient role for backorder operations");
  }
}

export const backorderRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /summary — counts for dashboard cards ───
  app.get("/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const summary = await getBackorderSummary(orgId);
    return reply.send(summary);
  });

  // ─── GET /count — pending count for sidebar badge ───
  app.get("/count", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const count = await getPendingBackorderCount(orgId);
    return reply.send({ count });
  });

  // ─── GET /by-supplier — group pending by supplier ───
  app.get("/by-supplier", async (request, reply) => {
    const { orgId } = request.storeContext!;
    return reply.send(await getBackordersBySupplier(orgId));
  });

  // ─── GET /for-supplier/:supplierId — pending for a supplier ───
  app.get("/for-supplier/:supplierId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { supplierId } = request.params as { supplierId: string };
    const items = await getBackordersForSupplier(orgId, supplierId);
    return reply.send({ data: items });
  });

  // ─── POST / — create a single backorder ───
  app.post("/", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      productId: string;
      supplierId: string;
      quantity: number;
      originalPoId?: string;
      originalPoNumber?: string;
      reason?: string;
      priority?: string;
      neededByDate?: string;
      notes?: string;
    };

    if (!body.productId || !body.supplierId || !body.quantity || body.quantity < 1) {
      return reply.status(400).send({ error: "productId, supplierId, and quantity (>= 1) are required" });
    }

    try {
      const result = await createBackorder(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /bulk — create multiple backorders (from PO redirect flow) ───
  app.post("/bulk", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      items: Array<{
        productId: string;
        supplierId: string;
        quantity: number;
        originalPoId?: string;
        originalPoNumber?: string;
        reason?: string;
        priority?: string;
        neededByDate?: string;
      }>;
    };

    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      return reply.status(400).send({ error: "items array is required" });
    }

    try {
      const results = await createBackordersBulk(orgId, userId, body.items);
      return reply.status(201).send({ results });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /:id — update priority, needed_by_date, notes ───
  app.patch("/:id", async (request, reply) => {
    const { role } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const body = request.body as {
      priority?: string;
      neededByDate?: string | null;
      notes?: string | null;
      quantity?: number;
    };

    try {
      const result = await updateBackorder(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /:id/cancel — cancel a backorder ───
  app.post("/:id/cancel", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string } | undefined;

    try {
      const result = await cancelBackorder(orgId, userId, id, body?.reason);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /include-in-po — mark backorders as included in a PO ───
  app.post("/include-in-po", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      backorderIds: string[];
      targetPoId: string;
      targetPoNumber: string;
    };

    if (!body.backorderIds?.length || !body.targetPoId || !body.targetPoNumber) {
      return reply.status(400).send({ error: "backorderIds, targetPoId, and targetPoNumber are required" });
    }

    try {
      const result = await includeInPO(orgId, userId, body.backorderIds, body.targetPoId, body.targetPoNumber);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /escalate — auto-escalate aging backorders ───
  app.post("/escalate", async (request, reply) => {
    const { role } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    await escalateAgingBackorders(orgId);
    return reply.send({ success: true });
  });

  // ─── GET / — list backorders (register LAST) ───
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const result = await listBackorders({
      orgId,
      status: q.status,
      supplierId: q.supplierId,
      priority: q.priority,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit, 10) : undefined,
    });
    const summary = await getBackorderSummary(orgId);
    return reply.send({ ...result, summary });
  });
};
