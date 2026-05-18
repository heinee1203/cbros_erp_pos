import type { FastifyInstance } from "fastify";
import { assertBackorderRole } from "./backorder-route-permissions";
import {
  cancelBackorder,
  createBackorder,
  createBackordersBulk,
  createPOFromBackorder,
  escalateAgingBackorders,
  fulfillBackorder,
  includeInPO,
  resourceBackorder,
  updateBackorder,
} from "./backorder-workflow-service";

export async function registerBackorderWorkflowRoutes(app: FastifyInstance) {
  // POST / - create a single backorder
  app.post("/", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      productId: string;
      supplierId: string;
      quantity: number;
      quantityOrdered?: number;
      quantityReceived?: number;
      quantityOutstanding?: number;
      productName?: string;
      sku?: string;
      supplierName?: string;
      unitCost?: string;
      originalPoId?: string;
      originalPoNumber?: string;
      originalPoLineId?: string;
      reason?: string;
      priority?: string;
      waitUntil?: string;
      neededByDate?: string;
      notes?: string;
    };

    if (
      !body.productId ||
      !body.supplierId ||
      !body.quantity ||
      body.quantity < 1
    ) {
      return reply
        .status(400)
        .send({
          error: "productId, supplierId, and quantity (>= 1) are required",
        });
    }

    try {
      const result = await createBackorder(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /bulk - create multiple backorders from PO partial receipt flow
  app.post("/bulk", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      items: Array<{
        productId: string;
        supplierId: string;
        quantity: number;
        quantityOrdered?: number;
        quantityReceived?: number;
        quantityOutstanding?: number;
        productName?: string;
        sku?: string;
        supplierName?: string;
        unitCost?: string;
        originalPoId?: string;
        originalPoNumber?: string;
        originalPoLineId?: string;
        reason?: string;
        priority?: string;
        waitUntil?: string;
        neededByDate?: string;
        decision?: "backorder" | "resource" | "cancel";
        newSupplierId?: string;
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

  // PATCH /:id - update priority, dates, notes, or quantity
  app.patch("/:id", async (request, reply) => {
    const { role } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const body = request.body as {
      priority?: string;
      neededByDate?: string | null;
      waitUntil?: string | null;
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

  // POST /:id/cancel - cancel a backorder
  app.post("/:id/cancel", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = (request.body as { reason?: string } | undefined);

    try {
      const result = await cancelBackorder(orgId, userId, id, body?.reason);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/create-po - create new PO from backorder
  app.post("/:id/create-po", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    try {
      const result = await createPOFromBackorder(orgId, userId, id);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /:id/resource - re-source to a different supplier
  app.post("/:id/resource", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as { newSupplierId: string };

    if (!body.newSupplierId) {
      return reply
        .status(400)
        .send({ error: "newSupplierId is required" });
    }

    try {
      const result = await resourceBackorder(
        orgId,
        userId,
        id,
        body.newSupplierId,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // PUT /:id/fulfill - mark as fulfilled
  app.put("/:id/fulfill", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    try {
      const result = await fulfillBackorder(orgId, userId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /include-in-po - mark backorders as included in a PO
  app.post("/include-in-po", async (request, reply) => {
    const { role, userId } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;

    const body = request.body as {
      backorderIds: string[];
      targetPoId: string;
      targetPoNumber: string;
    };

    if (
      !body.backorderIds?.length ||
      !body.targetPoId ||
      !body.targetPoNumber
    ) {
      return reply
        .status(400)
        .send({
          error:
            "backorderIds, targetPoId, and targetPoNumber are required",
        });
    }

    try {
      const result = await includeInPO(
        orgId,
        userId,
        body.backorderIds,
        body.targetPoId,
        body.targetPoNumber,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /escalate - auto-escalate aging backorders
  app.post("/escalate", async (request, reply) => {
    const { role } = request.user;
    assertBackorderRole(role);
    const { orgId } = request.storeContext!;
    await escalateAgingBackorders(orgId);
    return reply.send({ success: true });
  });
}
