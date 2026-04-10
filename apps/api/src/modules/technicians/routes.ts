import type { FastifyPluginAsync } from "fastify";
import { db } from "@apex/database";
import { products } from "@apex/database/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import {
  listTechnicians,
  getTechnician,
  createTechnician,
  updateTechnician,
  deactivateTechnician,
  batchUpdateTechnicians,
  calculateCommissions,
  seedTechnicians,
  seedFromProducts,
  backfillHistoricalTechnicians,
} from "./service";

const MANAGE_ROLES = ["ADMIN", "MANAGER"];

export const technicianRoutes: FastifyPluginAsync = async (app) => {
  // GET /technicians — list all (optional ?active=true&locationId=xxx)
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as { active?: string; locationId?: string };

    const data = await listTechnicians(orgId, {
      active: query.active === "true" ? true : query.active === "false" ? false : undefined,
      locationId: query.locationId,
    });

    return reply.send({ data });
  });

  // GET /technicians/commissions — calculate commissions for a period
  app.get("/commissions", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const query = request.query as { from?: string; to?: string; locationId?: string };

    if (!query.from || !query.to) {
      return reply.status(400).send({ error: "from and to date parameters are required" });
    }

    const result = await calculateCommissions(orgId, {
      from: query.from,
      to: query.to,
      locationId: query.locationId,
    });

    return reply.send(result);
  });

  // GET /technicians/:id — single technician
  app.get("/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const tech = await getTechnician(id, orgId);
    if (!tech) return reply.status(404).send({ error: "Technician not found" });

    return reply.send(tech);
  });

  // POST /technicians — create
  app.post("/", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as any;

    if (!body?.name) {
      return reply.status(400).send({ error: "name is required" });
    }

    try {
      const result = await createTechnician(body, orgId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /technicians/seed — seed default technicians
  app.post("/seed", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can seed technicians" });
    }

    const { orgId, locationId } = request.storeContext!;
    const result = await seedTechnicians(orgId, locationId ?? undefined);
    return reply.send(result);
  });

  // POST /technicians/batch-update — batch update branch/commission for multiple technicians
  app.post("/batch-update", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can batch update" });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as { ids: string[]; updates: { locationId?: string; commissionRate?: number; commissionType?: string } };

    if (!body?.ids?.length || !body?.updates) {
      return reply.status(400).send({ error: "ids and updates are required" });
    }

    try {
      const result = await batchUpdateTechnicians(orgId, body.ids, body.updates);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // POST /technicians/seed-from-products — auto-discover mechanics from labor variants
  app.post("/seed-from-products", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can seed technicians" });
    }

    const { orgId } = request.storeContext!;
    try {
      const result = await seedFromProducts(orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // POST /technicians/backfill-historical — link historical labor sales to technicians
  app.post("/backfill-historical", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can run backfill" });
    }

    const { orgId } = request.storeContext!;
    const result = await backfillHistoricalTechnicians(orgId);
    return reply.send(result);
  });

  // PUT /technicians/:id — update
  app.put("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const body = request.body as any;

    try {
      const result = await updateTechnician(id, body, orgId);
      return reply.send(result);
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // DELETE /technicians/:id — soft delete (deactivate)
  app.delete("/:id", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can manage technicians" });
    }

    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    try {
      await deactivateTechnician(id, orgId);
      return reply.status(204).send();
    } catch (err: any) {
      const status = err.message.includes("not found") ? 404 : 400;
      return reply.status(status).send({ error: err.message });
    }
  });

  // GET /technicians/commission-rates — list products with fixed commission rates
  app.get("/commission-rates", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const rows = await db.execute(sql`
      SELECT p.id, p.name,
        COALESCE(parent.name, '') AS parent_name,
        p.parent_product_id IS NOT NULL AS is_variant,
        p.commission_amount::numeric AS commission_amount
      FROM products p
      LEFT JOIN products parent ON p.parent_product_id = parent.id
      WHERE p.org_id = ${orgId}
        AND p.commission_amount IS NOT NULL
      ORDER BY COALESCE(parent.name, p.name), p.name
    `);
    return reply.send({ data: rows });
  });

  // PATCH /technicians/commission-rates/:productId — update a product's commission rate
  app.patch("/commission-rates/:productId", async (request, reply) => {
    const userRole = (request.user as any)?.role;
    if (!MANAGE_ROLES.includes(userRole)) {
      return reply.status(403).send({ error: "Only ADMIN or MANAGER can edit commission rates" });
    }

    const { orgId } = request.storeContext!;
    const { productId } = request.params as { productId: string };
    const body = request.body as { commissionAmount: number | null };

    const [updated] = await db
      .update(products)
      .set({ commissionAmount: body.commissionAmount != null ? String(body.commissionAmount) : null })
      .where(and(eq(products.id, productId), eq(products.orgId, orgId)))
      .returning({ id: products.id, name: products.name, commissionAmount: products.commissionAmount });

    if (!updated) return reply.status(404).send({ error: "Product not found" });
    return reply.send(updated);
  });
};
