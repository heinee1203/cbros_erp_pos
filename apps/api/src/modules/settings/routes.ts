import type { FastifyPluginAsync } from "fastify";
import { updateCompanySettingsSchema } from "@apex/types";
import { db } from "@apex/database";
import { organizationSettings } from "@apex/database/schema";
import { eq } from "drizzle-orm";

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  // GET /settings/company — fetch org settings
  app.get("/company", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db
      .select()
      .from(organizationSettings)
      .where(eq(organizationSettings.orgId, orgId))
      .limit(1);
    return reply.send({ data: rows[0] ?? {} });
  });

  // PUT /settings/company — upsert org settings (ADMIN only)
  app.put("/company", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (userRole !== "ADMIN") {
      return reply.status(403).send({ error: "Only ADMIN can update company settings" });
    }

    const parsed = updateCompanySettingsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });
    }

    const { orgId } = request.storeContext!;

    const [row] = await db
      .insert(organizationSettings)
      .values({
        orgId,
        ...parsed.data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: organizationSettings.orgId,
        set: {
          ...parsed.data,
          updatedAt: new Date(),
        },
      })
      .returning();

    return reply.send({ data: row });
  });
};
