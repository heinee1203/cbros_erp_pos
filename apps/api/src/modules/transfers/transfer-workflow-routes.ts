import type { FastifyInstance } from "fastify";
import {
  approveTransferSchema,
  cancelTransferSchema,
  createTransferSchema,
  dispatchTransferSchema,
  receiveTransferSchema,
  reportVarianceSchema,
  startPickingSchema,
} from "@apex/types";
import {
  DUPLICATE_TRANSFER_REQUEST_ERROR,
  isApproveTransferDuplicateRequest,
  isTransferWorkflowDuplicateRequest,
} from "./transfer-route-errors";
import {
  assertTransferRole,
  isTransferRole,
  isTransferAdminOrManager,
} from "./transfer-route-permissions";
import { verifyAuthorizationCredential } from "../auth/service";
import {
  approveTransfer,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  receiveTransfer,
  reportVariance,
  startPicking,
} from "./transfer-workflow-service";

export async function registerTransferCreateRoute(app: FastifyInstance) {
  // Create a draft transfer
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = createTransferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const input = parsed.data as typeof parsed.data & {
        authorizationCredential?: string;
        authorizationMethod?: "pin" | "barcode" | "card";
      };
      const currentUserCanTransfer = isTransferRole(role);
      const authorization = input.authorizationCredential
        ? await verifyAuthorizationCredential(orgId, input.authorizationCredential)
        : null;
      const authorizationCanTransfer = Boolean(
        authorization?.valid &&
          authorization.userId &&
          isTransferRole(authorization.role),
      );

      if (!currentUserCanTransfer && !authorizationCanTransfer) {
        return reply
          .status(403)
          .send({ error: "Transfer request requires manager, admin, or warehouse authorization" });
      }

      const transferUserId = authorizationCanTransfer ? authorization!.userId! : userId;
      const authorizationMethod = input.authorizationMethod ?? "pin";
      const authorizationNote = authorizationCanTransfer
        ? `Authorized by ${authorization!.fullName ?? "manager"} via ${authorizationMethod}`
        : undefined;
      const {
        authorizationCredential: _authorizationCredential,
        authorizationMethod: _authorizationMethod,
        ...safeInput
      } = input;
      const notes = [safeInput.notes, authorizationNote]
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1000) || undefined;

      const result = await createTransfer({ ...safeInput, notes }, orgId, transferUserId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
}

export async function registerTransferLifecycleRoutes(app: FastifyInstance) {
  // Approve a draft transfer and reserve stock
  app.post("/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    // Only ADMIN/MANAGER can approve
    if (!isTransferAdminOrManager(role)) {
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
      if (isApproveTransferDuplicateRequest(err)) {
        return reply.status(409).send({ error: DUPLICATE_TRANSFER_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // Move APPROVED -> PICKING
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
      if (isTransferWorkflowDuplicateRequest(err)) {
        return reply.status(409).send({ error: DUPLICATE_TRANSFER_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

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
      if (isTransferWorkflowDuplicateRequest(err)) {
        return reply.status(409).send({ error: DUPLICATE_TRANSFER_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // Confirm missing/damaged quantity
  app.post("/:id/report-variance", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!isTransferAdminOrManager(role)) {
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
      if (isTransferWorkflowDuplicateRequest(err)) {
        return reply.status(409).send({ error: DUPLICATE_TRANSFER_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

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
}
