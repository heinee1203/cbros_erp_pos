import type { FastifyInstance } from "fastify";
import { parseQuery, shiftsQuerySchema } from "../../lib/validate-query";
import {
  getActiveShift,
  getShift,
  getShiftZReading,
  listShiftDrawerEvents,
  listShifts,
} from "./shift-route-service";
import {
  canAccessAllShiftLocations,
  getShiftRouteErrorMessage,
  SHIFT_LOCATION_REQUIRED_ERROR,
  shouldListAllShiftLocations,
} from "./shift-route-helpers";

export async function registerShiftReadRoutes(app: FastifyInstance) {
  // GET /shifts/active
  // Get the current user's active (OPEN) shift at the current location
  app.get("/active", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({ error: SHIFT_LOCATION_REQUIRED_ERROR });
    }
    const { userId } = request.user;

    const shift = await getActiveShift(orgId, locationId, userId);
    return reply.send({ data: shift });
  });

  // GET /shifts
  // List shifts with filters and pagination
  app.get("/", async (request, reply) => {
    const q = parseQuery(shiftsQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = shouldListAllShiftLocations(
      q.allLocations,
      locationId,
    );
    if (allLocations && !canAccessAllShiftLocations(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listShifts(orgId, {
      locationId: allLocations ? undefined : q.locationId ?? locationId ?? undefined,
      userId: q.userId,
      status: q.status?.split(",").filter(Boolean),
      from: q.from,
      to: q.to,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // GET /shifts/:shiftId
  // Get shift details
  app.get<{ Params: { shiftId: string } }>(
    "/:shiftId",
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId } = request.storeContext!;

      const shift = await getShift(shiftId, orgId);
      if (!shift) {
        return reply.status(404).send({ error: "Shift not found" });
      }
      return reply.send({ data: shift });
    },
  );

  // GET /shifts/:shiftId/z-reading
  // Get Z-reading data (live if OPEN, snapshot if CLOSED)
  app.get<{ Params: { shiftId: string } }>(
    "/:shiftId/z-reading",
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId } = request.storeContext!;

      try {
        const zReading = await getShiftZReading(shiftId, orgId);
        return reply.send({ data: zReading });
      } catch (err: unknown) {
        return reply.status(400).send({ error: getShiftRouteErrorMessage(err) });
      }
    },
  );

  // GET /shifts/:shiftId/drawer-events
  // List server-persisted drawer events for a shift.
  app.get<{ Params: { shiftId: string } }>(
    "/:shiftId/drawer-events",
    async (request, reply) => {
      const { shiftId } = request.params;
      const { orgId } = request.storeContext!;

      try {
        const events = await listShiftDrawerEvents(shiftId, orgId);
        return reply.send({ data: events });
      } catch (err: unknown) {
        return reply.status(400).send({ error: getShiftRouteErrorMessage(err) });
      }
    },
  );
}
