import type { FastifyInstance } from "fastify";
import {
  completeSaleSchema,
  createSaleSchema,
  refundSaleSchema,
  voidSaleSchema,
} from "@apex/types";
import { getRequiredLocationContext, requireAnyPermission } from "../../lib/require-permission";
import { logAction } from "./sale-audit-service";
import { verifyAuthorizationCredential } from "./sale-auth-service";
import { CreditLimitError } from "./sale-customer-service";
import {
  DUPLICATE_SALE_REQUEST_ERROR,
  isDuplicateSaleRequest,
} from "./sale-route-errors";
import { assertPosRole, canRefundWithRole, canVoidWithRole } from "./sale-route-permissions";
import {
  completeSale,
  createSale,
  parkSale,
  refundSale,
  resumeSale,
  voidSale,
} from "./sale-workflow-service";

export async function registerSalesWorkflowRoutes(app: FastifyInstance) {
  // Create a new sale in OPEN status
  app.post("/", { preHandler: requireAnyPermission("pos.accept_payments") }, async (request, reply) => {
    const context = getRequiredLocationContext(request, reply);
    if (!context) return;
    const { orgId, locationId } = context;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createSale(parsed.data, orgId, locationId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Park an open sale (OPEN -> PARKED)
  app.post("/:id/park", { preHandler: requireAnyPermission("pos.accept_payments") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await parkSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Resume a parked sale (PARKED -> OPEN)
  app.post("/:id/resume", { preHandler: requireAnyPermission("pos.accept_payments") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await resumeSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Void a sale (QUOTE/OPEN/PARKED -> VOIDED)
  app.post("/:id/void", { preHandler: requireAnyPermission("pos.void_sale", "pos.accept_payments") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = voidSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const voidInput = parsed.data as typeof parsed.data & {
        authorizationCredential?: string;
        authorizationMethod?: "pin" | "barcode" | "card";
      };
      const currentUserCanVoid = canVoidWithRole(role);
      const authorization = voidInput.authorizationCredential
        ? await verifyAuthorizationCredential(orgId, voidInput.authorizationCredential)
        : null;
      const authorizationCanVoid = Boolean(
        authorization?.valid &&
          authorization.userId &&
          canVoidWithRole(authorization.role),
      );

      if (!currentUserCanVoid && !authorizationCanVoid) {
        return reply.status(403).send({
          error: "Void requires MANAGER or ADMIN authorization",
        });
      }

      const voidUserId = authorizationCanVoid ? authorization!.userId! : userId;
      const authorizationMethod = voidInput.authorizationMethod ?? "pin";
      const authorizationNote = authorizationCanVoid
        ? `Authorized by ${authorization!.fullName ?? "manager"} via ${authorizationMethod}`
        : undefined;
      const notes = [voidInput.notes, authorizationNote].filter(Boolean).join(" | ") || undefined;
      const result = await voidSale(id, orgId, voidUserId, notes);
      logAction({
        orgId,
        userId,
        action: "SALE_VOID",
        entityType: "SALE",
        entityId: id,
        details: {
          authorizedByUserId: authorizationCanVoid ? authorization!.userId : userId,
          authorizedByName: authorizationCanVoid ? authorization!.fullName : undefined,
          authorizationMethod: authorizationCanVoid ? authorizationMethod : "session",
          requestedByUserId: userId,
        },
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // Complete a sale - THE CHECKOUT PATH
  app.post("/:id/complete", { preHandler: requireAnyPermission("pos.accept_payments") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = completeSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await completeSale(id, orgId, userId, parsed.data);
      logAction({ orgId, userId, action: "SALE_COMPLETE", entityType: "SALE", entityId: id, details: { paymentCount: parsed.data.payments?.length ?? 0 }, ipAddress: request.ip });
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof CreditLimitError) {
        return reply.status(409).send({
          error: err.message,
          code: "CREDIT_LIMIT_EXCEEDED",
          overage: err.overage,
          currentBalance: err.currentBalance,
          creditLimit: err.creditLimit,
        });
      }
      if (isDuplicateSaleRequest(err)) {
        return reply
          .status(409)
          .send({ error: DUPLICATE_SALE_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // Refund a completed sale - admin/manager only
  app.post("/:id/refund", { preHandler: requireAnyPermission("pos.perform_refunds", "pos.accept_payments") }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    const parsed = refundSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const refundInput = parsed.data as typeof parsed.data & {
        authorizationCredential?: string;
        authorizationMethod?: "pin" | "barcode" | "card";
      };
      const currentUserCanRefund = canRefundWithRole(role);
      const authorization = refundInput.authorizationCredential
        ? await verifyAuthorizationCredential(orgId, refundInput.authorizationCredential)
        : null;
      const authorizationCanRefund = Boolean(
        authorization?.valid &&
          authorization.userId &&
          canRefundWithRole(authorization.role),
      );

      if (!currentUserCanRefund && !authorizationCanRefund) {
        return reply.status(403).send({
          error: "Refund requires ADMIN or MANAGER authorization",
        });
      }

      const refundUserId = authorizationCanRefund ? authorization!.userId! : userId;
      const refundRole = authorizationCanRefund ? authorization!.role! : role;
      const authorizationMethod = refundInput.authorizationMethod ?? "pin";
      const authorizationNote = authorizationCanRefund
        ? `Authorized by ${authorization!.fullName ?? "manager"} via ${authorizationMethod}`
        : undefined;
      const { authorizationCredential: _authorizationCredential, ...safeRefundInput } = refundInput;
      const result = await refundSale(id, orgId, refundUserId, refundRole, {
        ...safeRefundInput,
        notes: [refundInput.notes, authorizationNote].filter(Boolean).join(" | ") || undefined,
      } as any);
      logAction({
        orgId,
        userId,
        action: "SALE_REFUND",
        entityType: "SALE",
        entityId: id,
        details: {
          authorizedByUserId: authorizationCanRefund ? authorization!.userId : userId,
          authorizedByName: authorizationCanRefund ? authorization!.fullName : undefined,
          authorizationMethod: authorizationCanRefund ? authorizationMethod : "session",
          lineCount: parsed.data.lines.length,
        },
        ipAddress: request.ip,
      });
      return reply.send(result);
    } catch (err: any) {
      if (isDuplicateSaleRequest(err)) {
        return reply
          .status(409)
          .send({ error: DUPLICATE_SALE_REQUEST_ERROR });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
}
