import type { FastifyPluginAsync } from "fastify";
import { createCustomerSchema, createCustomerVehicleSchema } from "@apex/types";
import { POS_ROLES } from "@apex/types";
import { db } from "@apex/database";
import { customers, customerVehicles } from "@apex/database/schema";
import { eq, and, ilike, or } from "drizzle-orm";

function assertPosRole(role: string) {
  if (!POS_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for customer operations");
  }
}

export const customerRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /customers/search?q=... ─────────────────
  // Search customers by name or phone
  app.get("/search", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { q } = request.query as { q?: string };

    if (!q || q.trim().length < 2) {
      return reply.send({ data: [] });
    }

    const searchTerm = `%${q.trim()}%`;
    const results = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.orgId, orgId),
          or(
            ilike(customers.name, searchTerm),
            ilike(customers.phone, searchTerm),
          ),
        ),
      )
      .limit(20);

    return reply.send({ data: results });
  });

  // ─── POST /customers ────────────────────────────
  // Create a new customer
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertPosRole(role);

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const [customer] = await db
        .insert(customers)
        .values({
          orgId,
          name: parsed.data.name,
          phone: parsed.data.phone,
          notes: parsed.data.notes ?? null,
        })
        .returning();

      return reply.status(201).send(customer);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique")) {
        return reply
          .status(409)
          .send({ error: "A customer with this phone number already exists" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /customers/:id/vehicles ─────────────────
  // List vehicles for a customer
  app.get("/:id/vehicles", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const vehicles = await db
      .select()
      .from(customerVehicles)
      .where(
        and(
          eq(customerVehicles.customerId, id),
          eq(customerVehicles.orgId, orgId),
        ),
      );

    return reply.send({ data: vehicles });
  });

  // ─── POST /customers/:id/vehicles ────────────────
  // Add a vehicle to a customer
  app.post("/:id/vehicles", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertPosRole(role);

    // Validate customer exists
    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.orgId, orgId)))
      .limit(1);
    if (!customer) {
      return reply.status(404).send({ error: "Customer not found" });
    }

    const parsed = createCustomerVehicleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const [vehicle] = await db
        .insert(customerVehicles)
        .values({
          orgId,
          customerId: id,
          make: parsed.data.make,
          model: parsed.data.model,
          year: parsed.data.year ?? null,
          plateNo: parsed.data.plateNo ?? null,
          notes: parsed.data.notes ?? null,
        })
        .returning();

      return reply.status(201).send(vehicle);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
