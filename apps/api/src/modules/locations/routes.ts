import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { locations } from "@apex/database/schema";
import { eq, and } from "drizzle-orm";

export const locationRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /locations
   * List all active locations for the authenticated user's organization.
   * This endpoint is exempt from X-Location-ID requirement (chicken-and-egg:
   * the user needs this list to PICK which location to activate).
   */
  app.get("/", async (request, reply) => {
    const user = request.user as { orgId: string } | null;
    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const rows = await db
      .select({
        id: locations.id,
        name: locations.name,
        code: locations.code,
        type: locations.type,
        address: locations.address,
        isActive: locations.isActive,
      })
      .from(locations)
      .where(
        and(
          eq(locations.orgId, user.orgId),
          eq(locations.isActive, true),
        ),
      )
      .orderBy(locations.name);

    return reply.send({ data: rows });
  });
};
