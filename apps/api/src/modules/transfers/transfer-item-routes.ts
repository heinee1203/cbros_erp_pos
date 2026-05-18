import type { FastifyInstance } from "fastify";
import {
  addTransferItemSchema,
  updateTransferItemSchema,
  updateTransferSchema,
} from "@apex/types";
import { assertTransferRole } from "./transfer-route-permissions";
import {
  addTransferItem,
  deleteTransferItem,
  updateTransfer,
  updateTransferItem,
} from "./transfer-item-service";

export async function registerTransferItemRoutes(app: FastifyInstance) {
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);
    const parsed = updateTransferSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    try {
      const result = await updateTransfer(id, orgId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/:id/items", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);
    const parsed = addTransferItemSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    try {
      const result = await addTransferItem(id, orgId, parsed.data);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.patch("/:id/items/:itemId", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);
    const parsed = updateTransferItemSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Validation failed", details: parsed.error.flatten() });
    try {
      const result = await updateTransferItem(id, itemId, orgId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.delete("/:id/items/:itemId", async (request, reply) => {
    const { id, itemId } = request.params as { id: string; itemId: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);
    try {
      await deleteTransferItem(id, itemId, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}
