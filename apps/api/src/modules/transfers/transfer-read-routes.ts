import type { FastifyInstance } from "fastify";
import { paginationSchema } from "@apex/types";
import { assertTransferRole } from "./transfer-route-permissions";
import {
  getTransfer,
  getTransferByNumber,
  getTransferJournal,
  listTransfers,
} from "./transfer-read-service";

export async function registerTransferListRoute(app: FastifyInstance) {
  // List transfers with cursor-based pagination
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertTransferRole(role);

    const parsed = paginationSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const result = await listTransfers(orgId, parsed.data.cursor, parsed.data.limit);
    return reply.send(result);
  });
}

export async function registerTransferDetailRoutes(app: FastifyInstance) {
  // Resolve transfer by public transfer_no (for deep-linking)
  app.get("/by-number/:transferNo", async (request, reply) => {
    const { transferNo } = request.params as { transferNo: string };
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const result = await getTransferByNumber(
      transferNo,
      orgId,
      role,
      locationId ?? "",
    );
    if (!result) {
      return reply.status(404).send({ error: "Transfer not found" });
    }
    return reply.send(result);
  });

  // Get transfer details with lines, locations, receipts + allowedActions
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const result = await getTransfer(id, orgId, role, locationId ?? "");
    if (!result) {
      return reply.status(404).send({ error: "Transfer not found" });
    }
    return reply.send(result);
  });

  // Get transfer-related journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const entries = await getTransferJournal(id, orgId);
    return reply.send({ data: entries });
  });
}
