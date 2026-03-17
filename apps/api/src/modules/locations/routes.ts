import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";
import { createLocationSchema, updateLocationSchema } from "@apex/types";

export const locationRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /locations
   * List locations for the authenticated user's organization.
   * ?includeInactive=true to include soft-deleted locations.
   */
  app.get("/", async (request, reply) => {
    const user = request.user as { orgId: string } | null;
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const { includeInactive } = request.query as { includeInactive?: string };
    const showAll = includeInactive === "true";

    const conditions = [eq(locations.orgId, user.orgId)];
    if (!showAll) {
      conditions.push(eq(locations.isActive, true));
    }

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        code: locations.code,
        type: locations.type,
        address: locations.address,
        isActive: locations.isActive,
        isSystem: locations.isSystem,
        createdAt: locations.createdAt,
        updatedAt: locations.updatedAt,
      })
      .from(locations)
      .where(and(...conditions))
      .orderBy(locations.name);

    return reply.send({ data: rows });
  });

  /**
   * POST /locations
   * Create a new location. ADMIN or MANAGER only.
   */
  app.post("/", async (request, reply) => {
    const user = request.user;
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const parsed = createLocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation failed",
        details: parsed.error.flatten(),
      });
    }

    // Check for duplicate code within org
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.orgId, user.orgId),
          eq(locations.code, parsed.data.code),
        ),
      )
      .limit(1);

    if (existing) {
      return reply.status(409).send({ error: "Location code already exists" });
    }

    const [created] = await db
      .insert(locations)
      .values({
        orgId: user.orgId,
        name: parsed.data.name,
        code: parsed.data.code,
        type: parsed.data.type,
        address: parsed.data.address ?? null,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  /**
   * PUT /locations/:id
   * Update an existing location. ADMIN or MANAGER only.
   */
  app.put<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
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

    // Verify location belongs to org
    const [loc] = await db
      .select({ id: locations.id, isSystem: locations.isSystem })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: "Location not found" });
    }

    // If code is being changed, check for duplicates
    if (parsed.data.code) {
      const [dup] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(
          and(
            eq(locations.orgId, user.orgId),
            eq(locations.code, parsed.data.code),
          ),
        )
        .limit(1);

      if (dup && dup.id !== id) {
        return reply.status(409).send({ error: "Location code already exists" });
      }
    }

    const [updated] = await db
      .update(locations)
      .set(parsed.data)
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .returning();

    return reply.send({ data: updated });
  });

  /**
   * DELETE /locations/:id
   * Soft-delete (deactivate) a location. ADMIN or MANAGER only.
   * Cannot deactivate system locations.
   */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const user = request.user;
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const { id } = request.params;

    const [loc] = await db
      .select({ id: locations.id, isSystem: locations.isSystem })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (loc.isSystem) {
      return reply.status(400).send({ error: "Cannot deactivate a system location" });
    }

    const [deactivated] = await db
      .update(locations)
      .set({ isActive: false })
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .returning();

    return reply.send({ data: deactivated });
  });

  /**
   * PATCH /locations/:id/reactivate
   * Reactivate a soft-deleted location. ADMIN or MANAGER only.
   */
  app.patch<{ Params: { id: string } }>("/:id/reactivate", async (request, reply) => {
    const user = request.user;
    if (!user || !["ADMIN", "MANAGER"].includes(user.role)) {
      return reply.status(403).send({ error: "Insufficient permissions" });
    }

    const { id } = request.params;

    const [loc] = await db
      .select({ id: locations.id, isActive: locations.isActive })
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .limit(1);

    if (!loc) {
      return reply.status(404).send({ error: "Location not found" });
    }

    if (loc.isActive) {
      return reply.status(400).send({ error: "Location is already active" });
    }

    const [reactivated] = await db
      .update(locations)
      .set({ isActive: true })
      .where(and(eq(locations.id, id), eq(locations.orgId, user.orgId)))
      .returning();

    return reply.send({ data: reactivated });
  });
};
