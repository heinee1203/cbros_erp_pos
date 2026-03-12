import type { FastifyPluginAsync } from "fastify";
import { SHIFT_FORCE_CLOSE_ROLES, POS_ROLES } from "@apex/types";
import {
  getActiveShift,
  closeShift,
  forceCloseShift,
  getShiftZReading,
  getShift,
  listShifts,
} from "./service";

export const shiftRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /shifts/active ────────────────────────────
  // Get the current user's active (OPEN) shift at the current location
  app.get("/active", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { userId } = request.user;

    const shift = await getActiveShift(orgId, locationId, userId);
    return reply.send({ data: shift });
  });

  // ─── GET /shifts ────────────────────────────────────
  // List shifts with filters and pagination
  app.get("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;
    const q = request.query as Record<string, string | undefined>;

    const allLocations = q.allLocations === "true";
    if (allLocations && !SHIFT_FORCE_CLOSE_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listShifts(orgId, {
      locationId: allLocations ? undefined : (q.locationId ?? locationId),
      userId: q.userId,
      status: q.status?.split(",").filter(Boolean),
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: Math.min(parseInt(q.limit ?? "50", 10) || 50, 100),
    });

    return reply.send(result);
  });

  // ─── GET /shifts/:shiftId ──────────────────────────
  // Get shift details
  app.get("/:shiftId", async (request, reply) => {
    const { shiftId } = request.params as { shiftId: string };
    const { orgId } = request.storeContext!;

    const shift = await getShift(shiftId, orgId);
    if (!shift) {
      return reply.status(404).send({ error: "Shift not found" });
    }
    return reply.send({ data: shift });
  });

  // ─── GET /shifts/:shiftId/z-reading ────────────────
  // Get Z-reading data (live if OPEN, snapshot if CLOSED)
  app.get("/:shiftId/z-reading", async (request, reply) => {
    const { shiftId } = request.params as { shiftId: string };
    const { orgId } = request.storeContext!;

    try {
      const zReading = await getShiftZReading(shiftId, orgId);
      return reply.send({ data: zReading });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /shifts/:shiftId/close ───────────────────
  // Close a shift (cashier's own shift only)
  app.post("/:shiftId/close", async (request, reply) => {
    const { shiftId } = request.params as { shiftId: string };
    const { orgId } = request.storeContext!;
    const { userId } = request.user;

    const body = request.body as {
      actualCash: string;
      notes?: string;
    };

    if (!body.actualCash) {
      return reply
        .status(400)
        .send({ error: "actualCash is required" });
    }

    try {
      const result = await closeShift(shiftId, orgId, userId, {
        actualCash: body.actualCash,
        notes: body.notes,
      });
      return reply.send({ data: result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /shifts/:shiftId/force-close ─────────────
  // Force-close a shift (ADMIN/MANAGER with PIN)
  app.post("/:shiftId/force-close", async (request, reply) => {
    const { shiftId } = request.params as { shiftId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!SHIFT_FORCE_CLOSE_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can force-close shifts" });
    }

    const body = request.body as { pin: string };
    if (!body.pin) {
      return reply.status(400).send({ error: "PIN is required" });
    }

    try {
      const result = await forceCloseShift(
        shiftId,
        orgId,
        userId,
        role,
        body.pin,
      );
      return reply.send({ data: result });
    } catch (err: any) {
      if (err.message === "Invalid PIN") {
        return reply.status(401).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
};
