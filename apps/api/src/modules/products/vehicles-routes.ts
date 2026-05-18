import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { products, vehicleCompatibility } from "@apex/database/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { addVehicleSchema, updateVehicleSchema } from "@apex/types";

import { MANAGE_ROLES } from "./permissions";

export function registerProductVehicleRoutes(app: FastifyInstance) {
  app.get("/vehicles/makes", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.execute(sql`
      SELECT DISTINCT vc.make
      FROM vehicle_compatibility vc
      INNER JOIN products p ON vc.product_id = p.id
      WHERE p.org_id = ${orgId}
      ORDER BY vc.make
    `);
    return reply.send({ data: (rows as any[]).map((r) => r.make) });
  });

  app.get("/vehicles/models", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { make } = request.query as { make?: string };
    if (!make) return reply.status(400).send({ error: "make query param is required" });

    const rows = await db.execute(sql`
      SELECT DISTINCT vc.model
      FROM vehicle_compatibility vc
      INNER JOIN products p ON vc.product_id = p.id
      WHERE p.org_id = ${orgId} AND vc.make = ${make}
      ORDER BY vc.model
    `);
    return reply.send({ data: (rows as any[]).map((r) => r.model) });
  });

  app.get("/vehicles/engines", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string | undefined>;

    const conditions = [eq(products.orgId, orgId)];
    if (q.make) {
      conditions.push(eq(vehicleCompatibility.make, q.make as any));
    }

    const rows = await db
      .selectDistinct({ engine: vehicleCompatibility.engine })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(and(...conditions, sql`${vehicleCompatibility.engine} IS NOT NULL AND ${vehicleCompatibility.engine} != ''`))
      .orderBy(vehicleCompatibility.engine);

    return reply.send({ data: rows.map((r) => r.engine) });
  });

  app.get("/:productId/vehicles", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const [prod] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .limit(1);
    if (!prod) return reply.status(404).send({ error: "Product not found" });

    const rows = await db
      .select()
      .from(vehicleCompatibility)
      .where(eq(vehicleCompatibility.productId, productId))
      .orderBy(asc(vehicleCompatibility.make), asc(vehicleCompatibility.model));
    return reply.send({ data: rows });
  });

  app.post("/:productId/vehicles", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId } = request.params as { productId: string };
    const { orgId } = request.storeContext!;
    const parsed = addVehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });

    const [prod] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .limit(1);
    if (!prod) return reply.status(404).send({ error: "Product not found" });

    const [row] = await db
      .insert(vehicleCompatibility)
      .values({
        productId,
        make: parsed.data.make,
        model: parsed.data.model,
        yearStart: parsed.data.yearStart,
        yearEnd: parsed.data.yearEnd,
        engine: parsed.data.engine ?? null,
        notes: parsed.data.notes ?? null,
      })
      .returning();
    return reply.status(201).send({ data: row });
  });

  app.patch("/:productId/vehicles/:id", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId, id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;
    const parsed = updateVehicleSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid input", details: parsed.error.flatten() });

    const [existing] = await db
      .select({ vcId: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(
        and(
          eq(vehicleCompatibility.id, id),
          eq(vehicleCompatibility.productId, productId),
          eq(products.orgId, orgId),
        ),
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Vehicle entry not found" });

    const [updated] = await db
      .update(vehicleCompatibility)
      .set(parsed.data)
      .where(eq(vehicleCompatibility.id, id))
      .returning();
    return reply.send({ data: updated });
  });

  app.delete("/:productId/vehicles/:id", async (request, reply) => {
    const { role } = request.user!;
    if (!MANAGE_ROLES.includes(role)) return reply.status(403).send({ error: "Forbidden" });

    const { productId, id } = request.params as { productId: string; id: string };
    const { orgId } = request.storeContext!;

    const [existing] = await db
      .select({ vcId: vehicleCompatibility.id })
      .from(vehicleCompatibility)
      .innerJoin(products, eq(vehicleCompatibility.productId, products.id))
      .where(
        and(
          eq(vehicleCompatibility.id, id),
          eq(vehicleCompatibility.productId, productId),
          eq(products.orgId, orgId),
        ),
      )
      .limit(1);
    if (!existing) return reply.status(404).send({ error: "Vehicle entry not found" });

    await db.delete(vehicleCompatibility).where(eq(vehicleCompatibility.id, id));
    return reply.send({ success: true });
  });
}
