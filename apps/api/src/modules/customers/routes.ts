import type { FastifyPluginAsync } from "fastify";
import {
  createCustomerSchema,
  updateCustomerSchema,
  createCustomerVehicleSchema,
  recordPaymentSchema,
  customerAdjustmentSchema,
  AR_ROLES,
} from "@apex/types";
import { db } from "@apex/database";
import { customers, customerVehicles } from "@apex/database/schema";
import { eq, and, ilike, or } from "drizzle-orm";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  recordPayment,
  recordAdjustment,
  listTransactions,
  getAgingReport,
  getSOA,
  getARSummary,
} from "./service";

function assertArRole(role: string) {
  if (!AR_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for customer account operations");
  }
}

function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new Error("Only ADMIN can perform this operation");
  }
}

export const customerRoutes: FastifyPluginAsync = async (app) => {
  // ─── GET /customers/search?q=... ─────────────────
  // Simple search for POS autocomplete
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

  // ─── Report routes (BEFORE /:id to avoid conflicts) ───

  app.get("/reports/aging", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await getAgingReport(orgId);
    return reply.send({ data });
  });

  app.get("/reports/soa/:customerId", async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const { orgId } = request.storeContext!;
    const { from, to } = request.query as { from?: string; to?: string };

    // Default: current month
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const defaultTo = now.toISOString();

    try {
      const result = await getSOA(customerId, orgId, from || defaultFrom, to || defaultTo);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await getARSummary(orgId);
    return reply.send(data);
  });

  // ─── GET /customers ──────────────────────────────
  // List customers with search, filters, sorting, keyset pagination
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { search, type, hasBalance, sortBy, cursor, limit } =
      request.query as {
        search?: string;
        type?: string;
        hasBalance?: string;
        sortBy?: string;
        cursor?: string;
        limit?: string;
      };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 100);

    const result = await listCustomers(orgId, {
      search,
      type,
      hasBalance: hasBalance === "true",
      sortBy,
      cursor,
      limit: parsedLimit,
    });

    return reply.send(result);
  });

  // ─── POST /customers ─────────────────────────────
  // Create a new customer
  app.post("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = createCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const customer = await createCustomer(parsed.data, orgId);
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

  // ─── GET /customers/:id ──────────────────────────
  // Customer detail with recent transactions
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getCustomer(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Customer not found" });
    }

    return reply.send(result);
  });

  // ─── PATCH /customers/:id ────────────────────────
  // Update customer fields
  app.patch("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);

    const parsed = updateCustomerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    const updated = await updateCustomer(id, parsed.data, orgId);
    if (!updated) {
      return reply.status(404).send({ error: "Customer not found" });
    }

    return reply.send(updated);
  });

  // ─── DELETE /customers/:id ────────────────────────
  // Soft-delete (deactivate) a customer
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertAdmin(role);

    try {
      const result = await softDeleteCustomer(id, orgId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message.includes("not found")) {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /customers/:id/transactions ──────────────
  // Transaction ledger with filters and pagination
  app.get("/:id/transactions", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { type, from, to, cursor, limit } = request.query as {
      type?: string;
      from?: string;
      to?: string;
      cursor?: string;
      limit?: string;
    };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 100);

    const result = await listTransactions(id, orgId, {
      type,
      from,
      to,
      cursor,
      limit: parsedLimit,
    });

    return reply.send(result);
  });

  // ─── POST /customers/:id/payments ─────────────────
  // Record a payment against customer AR balance
  app.post("/:id/payments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);

    const parsed = recordPaymentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await recordPayment(id, parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /customers/:id/adjustments ──────────────
  // Manual balance adjustment (ADMIN only)
  app.post("/:id/adjustments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);

    const parsed = customerAdjustmentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await recordAdjustment(id, parsed.data, orgId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
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
    assertArRole(role);

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
