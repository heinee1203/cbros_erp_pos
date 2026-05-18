import type { FastifyInstance } from "fastify";
import { createLocationSchema, updateLocationSchema } from "@apex/types";
import {
  canManageLocations,
  type LocationRouteUser,
} from "./location-route-helpers";
import {
  createLocationForOrg,
  deactivateLocationForOrg,
  findLocationByCode,
  findMutableLocation,
  reactivateLocationForOrg,
  updateLocationForOrg,
} from "./location-route-service";

export async function registerLocationMutationRoutes(app: FastifyInstance) {
  /**
   * POST /locations
   * Create a new location. ADMIN or MANAGER only.
   */
  app.post("/", async (request, reply) => {
    const user = request.user as LocationRouteUser | null;
    if (!canManageLocations(user)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const parsed = createLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const existing = await findLocationByCode(user.orgId, parsed.data.code);
    if (existing) {
      return reply.status(409).send({ error: "Location code already exists" });
    }

    const created = await createLocationForOrg(user.orgId, parsed.data);
    return reply.status(201).send({ data: created });
  });

  /**
   * PUT /locations/:id
   * Update an existing location. ADMIN or MANAGER only.
   */
  app.put<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as LocationRouteUser | null;
    if (!canManageLocations(user)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const parsed = updateLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    const { id } = request.params;

    const loc = await findMutableLocation(id, user.orgId);
    if (!loc) {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (parsed.data.code) {
      const dup = await findLocationByCode(user.orgId, parsed.data.code);

      if (dup && dup.id !== id) {
        return reply.status(409).send({ error: "Location code already exists" });
      }
    }

    const updated = await updateLocationForOrg(id, user.orgId, parsed.data);
    return reply.send({ data: updated });
  });

  /**
   * DELETE /locations/:id
   * Soft-delete (deactivate) a location. ADMIN or MANAGER only.
   * Cannot deactivate system locations.
   */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user as LocationRouteUser | null;
    if (!canManageLocations(user)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const { id } = request.params;

    const loc = await findMutableLocation(id, user.orgId);
    if (!loc) {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (loc.isSystem) {
      return reply
        .status(400)
        .send({ error: "Cannot deactivate a system location" });
    }

    const deactivated = await deactivateLocationForOrg(id, user.orgId);
    return reply.send({ data: deactivated });
  });

  /**
   * PATCH /locations/:id/reactivate
   * Reactivate a soft-deleted location. ADMIN or MANAGER only.
   */
  app.patch<{ Params: { id: string } }>(
    "/:id/reactivate",
    async (request, reply) => {
      const user = request.user as LocationRouteUser | null;
      if (!canManageLocations(user)) {
        return reply.status(403).send({ error: "Insufficient permissions" });
      }

      const { id } = request.params;

      const loc = await findMutableLocation(id, user.orgId);
      if (!loc) {
        return reply.status(404).send({ error: "Location not found" });
      }

      if (loc.isActive) {
        return reply.status(400).send({ error: "Location is already active" });
      }

      const reactivated = await reactivateLocationForOrg(id, user.orgId);
      return reply.send({ data: reactivated });
    },
  );
}
