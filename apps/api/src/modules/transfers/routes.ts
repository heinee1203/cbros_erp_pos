import type { FastifyPluginAsync } from "fastify";
import {
  createTransferSchema,
  approveTransferSchema,
  startPickingSchema,
  dispatchTransferSchema,
  receiveTransferSchema,
  reportVarianceSchema,
  cancelTransferSchema,
} from "@apex/types";
import { UserRole } from "@apex/types";
import { paginationSchema } from "@apex/types";
import {
  createTransfer,
  approveTransfer,
  startPicking,
  dispatchTransfer,
  receiveTransfer,
  reportVariance,
  cancelTransfer,
  getTransfer,
  getTransferByNumber,
  getTransferJournal,
  listTransfers,
} from "./service";

// Roles allowed to manage transfers
const TRANSFER_ROLES = [
  UserRole.ADMIN,
  UserRole.MANAGER,
  UserRole.WAREHOUSE_STAFF,
];

function assertTransferRole(role: string) {
  if (!TRANSFER_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for transfer operations");
  }
}

export const transferRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /transfers ──────────────────────────────────
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

  // ─── POST /transfers ───────────────────────────────
  // Create a draft transfer
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertTransferRole(role);

    const parsed = createTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createTransfer(parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/approve ───────────────────
  // Approve a draft transfer and reserve stock
  app.post("/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    // Only ADMIN/MANAGER can approve
    if (role !== UserRole.ADMIN && role !== UserRole.MANAGER) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can approve transfers" });
    }

    const parsed = approveTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await approveTransfer(
        id,
        orgId,
        userId,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.message?.includes("unique constraint") || err.message?.includes("idempotency")) {
        return reply.status(409).send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/start-picking ─────────────
  // Move APPROVED → PICKING
  app.post("/:id/start-picking", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    assertTransferRole(request.user.role);

    const parsed = startPickingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await startPicking(id, orgId, parsed.data.idempotencyKey);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/dispatch ──────────────────
  // Dispatch reserved stock into transit
  app.post("/:id/dispatch", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertTransferRole(role);

    const parsed = dispatchTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await dispatchTransfer(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique constraint") || err.message?.includes("duplicate key") || err.message?.includes("idempotency_key")) {
        return reply.status(409).send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/receive ───────────────────
  // Receive stock from transit into destination
  app.post("/:id/receive", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertTransferRole(role);

    const parsed = receiveTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await receiveTransfer(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique constraint") || err.message?.includes("duplicate key") || err.message?.includes("idempotency_key")) {
        return reply.status(409).send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/report-variance ───────────
  // Confirm missing/damaged quantity
  app.post("/:id/report-variance", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (role !== UserRole.ADMIN && role !== UserRole.MANAGER) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can report variance" });
    }

    const parsed = reportVarianceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await reportVariance(id, orgId, userId, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique constraint") || err.message?.includes("duplicate key") || err.message?.includes("idempotency_key")) {
        return reply.status(409).send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /transfers/:id/cancel ────────────────────
  // Cancel a transfer
  app.post("/:id/cancel", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertTransferRole(role);

    const parsed = cancelTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await cancelTransfer(
        id,
        orgId,
        userId,
        parsed.data.idempotencyKey,
        parsed.data.notes,
      );
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /transfers/by-number/:transferNo ────────────
  // Resolve transfer by public transfer_no (for deep-linking)
  // Returns full detail with server-computed allowedActions
  app.get("/by-number/:transferNo", async (request, reply) => {
    const { transferNo } = request.params as { transferNo: string };
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const result = await getTransferByNumber(
      transferNo,
      orgId,
      role,
      locationId,
    );
    if (!result) {
      return reply.status(404).send({ error: "Transfer not found" });
    }
    return reply.send(result);
  });

  // ─── GET /transfers/:id ────────────────────────────
  // Get transfer details with lines, locations, receipts + allowedActions
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const result = await getTransfer(id, orgId, role, locationId);
    if (!result) {
      return reply.status(404).send({ error: "Transfer not found" });
    }
    return reply.send(result);
  });

  // ─── GET /transfers/:id/journal ────────────────────
  // Get transfer-related journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const entries = await getTransferJournal(id, orgId);
    return reply.send({ data: entries });
  });
};
