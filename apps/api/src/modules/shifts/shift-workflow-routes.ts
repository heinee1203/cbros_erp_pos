import type { FastifyInstance } from "fastify";
import { closeShift, createShiftDrawerEvent, forceCloseShift } from "./shift-route-service";
import { verifyAuthorizationCredential } from "./shift-auth-service";
import {
  canAccessAllShiftLocations,
  getForceCloseErrorStatus,
  getShiftRouteErrorMessage,
  type ShiftCloseBody,
  type ShiftDrawerEventBody,
  type ShiftForceCloseBody,
} from "./shift-route-helpers";

export async function registerShiftWorkflowRoutes(app: FastifyInstance) {
  // POST /shifts/:shiftId/close
  // Close a shift (cashier's own shift only)
  app.post<{ Params: { shiftId: string } }>(
    "/:shiftId/close",
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId } = request.storeContext!;
      const { userId } = request.user;

      const body = request.body as ShiftCloseBody;

      if (!body.actualCash) {
        return reply.status(400).send({ error: "actualCash is required" });
      }

      try {
        const result = await closeShift(shiftId, orgId, userId, {
          actualCash: body.actualCash,
          expectedCashAdjustment: body.expectedCashAdjustment,
          notes: body.notes,
        });
        return reply.send({ data: result });
      } catch (err: unknown) {
        return reply.status(400).send({ error: getShiftRouteErrorMessage(err) });
      }
    },
  );

  // POST /shifts/:shiftId/drawer-events
  // Record paid-in, paid-out, or no-sale register events with manager authorization.
  app.post<{ Params: { shiftId: string } }>(
    "/:shiftId/drawer-events",
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId, locationId } = request.storeContext!;
      const { userId } = request.user;

      if (!locationId) {
        return reply.status(400).send({ error: "Locked register location is required" });
      }

      const body = request.body as ShiftDrawerEventBody;
      if (!body?.type) {
        return reply.status(400).send({ error: "Drawer event type is required" });
      }
      if (!body.authorizationCredential) {
        return reply.status(400).send({ error: "Manager authorization credential is required" });
      }

      const authorization = await verifyAuthorizationCredential(orgId, body.authorizationCredential);
      const authorized = Boolean(
        authorization.valid &&
          authorization.userId &&
          canAccessAllShiftLocations(authorization.role ?? ""),
      );
      if (!authorized) {
        return reply.status(401).send({ error: "Invalid manager authorization" });
      }

      try {
        const result = await createShiftDrawerEvent(shiftId, orgId, locationId, userId, {
          type: body.type,
          amount: body.amount,
          reason: body.reason,
          clientEventId: body.clientEventId,
          authorizationMethod: body.authorizationMethod ?? "pin",
          authorizationUserId: authorization.userId!,
          approvedBy: authorization.fullName ?? "Manager",
          drawerOpened: body.drawerOpened,
          drawerError: body.drawerError,
        });
        return reply.send({ data: result });
      } catch (err: unknown) {
        return reply.status(400).send({ error: getShiftRouteErrorMessage(err) });
      }
    },
  );

  // POST /shifts/:shiftId/force-close
  // Force-close a shift (ADMIN/MANAGER with PIN, manager barcode, or manager card)
  app.post<{ Params: { shiftId: string } }>(
    "/:shiftId/force-close",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId } = request.storeContext!;
      const { userId, role } = request.user;

      if (!canAccessAllShiftLocations(role)) {
        return reply
          .status(403)
          .send({ error: "Only ADMIN or MANAGER can force-close shifts" });
      }

      const body = request.body as ShiftForceCloseBody;
      const credential = body.authorizationCredential ?? body.pin;
      if (!credential) {
        return reply.status(400).send({ error: "Manager authorization credential is required" });
      }

      const authorization = await verifyAuthorizationCredential(orgId, credential);
      const authorizationCanForceClose = Boolean(
        authorization.valid &&
          authorization.userId &&
          canAccessAllShiftLocations(authorization.role ?? ""),
      );

      if (!authorizationCanForceClose) {
        return reply.status(401).send({ error: "Invalid manager authorization" });
      }

      try {
        const authorizationMethod = body.authorizationMethod ?? (body.pin ? "pin" : "barcode");
        const result = await forceCloseShift(
          shiftId,
          orgId,
          authorization.userId!,
          authorization.role!,
          authorization.fullName,
          authorizationMethod,
        );
        return reply.send({ data: result });
      } catch (err: unknown) {
        const message = getShiftRouteErrorMessage(err);
        return reply.status(getForceCloseErrorStatus(message)).send({
          error: message,
        });
      }
    },
  );
}
