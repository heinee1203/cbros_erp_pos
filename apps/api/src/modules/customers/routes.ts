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
import { eq, and, ilike, or, sql } from "drizzle-orm";
import {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  softDeleteCustomer,
  recordPayment,
  recordMultiCustomerPayment,
  recordAdjustment,
  reassignTransaction,
  editTransactionAmount,
  deleteTransaction,
  listTransactions,
  getPaymentSettledInvoices,
  getSOAPaymentSummary,
  getSOAInvoices,
  getAgingReport,
  getSOA,
  getSOAById,
  getARSummary,
  generateSOA,
  listSOARecords,
  updateSOAStatus,
  recomputeSOAStatus,
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

  // Historical SOA reprint — returns the exact line items that were billed
  // under this SOA number, not a date-range re-query of the customer ledger.
  // Fixes the Lucky Se7en reprint bug where SOA-0161 and SOA-0162 both
  // returned the customer's full ledger in the overlapping date range.
  app.get("/reports/soa-by-id/:soaId", async (request, reply) => {
    const { soaId } = request.params as { soaId: string };
    const { orgId } = request.storeContext!;
    try {
      const result = await getSOAById(soaId, orgId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  // Admin repair — recompute a single SOA's status from real allocations.
  // Used by the data-repair script after deploying the code fix. Idempotent.
  app.post("/soa/:soaId/recompute", async (request, reply) => {
    const { role } = request.user;
    assertArRole(role);
    const { soaId } = request.params as { soaId: string };
    const { orgId } = request.storeContext!;
    try {
      const result = await db.transaction(async (tx) => {
        return await recomputeSOAStatus(tx, orgId, soaId);
      });
      return reply.send({ success: true, result });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await getARSummary(orgId);
    return reply.send(data);
  });

  // ─── GET /customers/soa/search ───────────────────
  app.get("/soa/search", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as { search?: string; status?: string; dateFrom?: string; dateTo?: string; limit?: string; offset?: string };
    const limit = Math.min(parseInt(q.limit || "50", 10) || 50, 200);
    const offset = parseInt(q.offset || "0", 10) || 0;

    const conditions: string[] = [`s.org_id = '${orgId}'`];
    if (q.status) conditions.push(`s.status = '${q.status.replace(/'/g, "''")}'`);
    if (q.dateFrom) conditions.push(`s.generated_at >= '${q.dateFrom}'`);
    if (q.dateTo) conditions.push(`s.generated_at <= '${q.dateTo}'`);
    if (q.search && q.search.length >= 1) {
      const term = q.search.replace(/'/g, "''");
      conditions.push(`(s.soa_number ILIKE '%${term}%' OR c.name ILIKE '%${term}%')`);
    }

    const where = conditions.join(" AND ");
    const [countRow] = await db.execute(sql.raw(`SELECT COUNT(*)::int AS total FROM soa_records s JOIN customers c ON c.id = s.customer_id WHERE ${where}`)) as any[];
    const rows = await db.execute(sql.raw(`
      SELECT s.id, s.soa_number, s.customer_id, c.name AS customer_name,
        s.date_from, s.date_to, s.generated_at, s.total_charges, s.total_credits,
        s.total_payable, s.transaction_count, s.status
      FROM soa_records s JOIN customers c ON c.id = s.customer_id
      WHERE ${where} ORDER BY s.generated_at DESC LIMIT ${limit} OFFSET ${offset}
    `));

    return reply.send({
      data: (rows as any[]).map((r: any) => ({
        id: r.id, soaNumber: r.soa_number, customerId: r.customer_id, customerName: r.customer_name,
        dateFrom: r.date_from, dateTo: r.date_to, generatedAt: r.generated_at,
        totalCharges: parseFloat(r.total_charges), totalCredits: parseFloat(r.total_credits),
        totalPayable: parseFloat(r.total_payable), transactionCount: r.transaction_count, status: r.status,
      })),
      total: countRow.total,
    });
  });

  // ─── GET /customers ──────────────────────────────
  // List customers with search, filters, sorting, keyset pagination
  app.get("/", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { search, type, hasBalance, sortBy, cursor, limit, dateFrom, dateTo } =
      request.query as {
        search?: string;
        type?: string;
        hasBalance?: string;
        sortBy?: string;
        cursor?: string;
        limit?: string;
        dateFrom?: string;
        dateTo?: string;
      };

    const parsedLimit = Math.min(parseInt(limit || "50", 10) || 50, 200);

    const result = await listCustomers(orgId, {
      search,
      type,
      hasBalance: hasBalance === "true",
      sortBy,
      cursor,
      limit: parsedLimit,
      dateFrom,
      dateTo,
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
      // Drizzle wraps PostgreSQL errors — check error, cause, and message
      const errStr = String(err.message ?? "") + String(err.cause?.message ?? "") + String(err.cause?.code ?? "");
      const isUnique = err.code === "23505"
        || err.cause?.code === "23505"
        || errStr.includes("unique")
        || errStr.includes("duplicate key")
        || errStr.includes("23505");
      if (isUnique) {
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

  // ─── POST /customers/multi-payment ─────────────────
  // Record a single payment covering multiple customers
  app.post("/multi-payment", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertArRole(role);
    const body = request.body as any;
    if (!body?.allocations?.length) return reply.status(400).send({ error: "At least one customer allocation is required" });
    if (!body?.totalAmount || !body?.method) return reply.status(400).send({ error: "totalAmount and method are required" });
    try {
      const result = await recordMultiCustomerPayment(body, orgId, userId);
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

  // ─── PATCH /customers/:id/transactions/:txnId/reassign ──
  // Reassign a transaction to a different customer
  app.patch("/:id/transactions/:txnId/reassign", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { newCustomerId, reason } = request.body as { newCustomerId: string; reason: string };
    if (!newCustomerId || !reason) return reply.status(400).send({ error: "newCustomerId and reason are required" });
    try {
      const result = await reassignTransaction(id, txnId, newCustomerId, reason, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /customers/:id/transactions/:txnId ──
  // Edit a transaction amount
  app.patch("/:id/transactions/:txnId", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { amount, reason } = request.body as { amount: number; reason: string };
    if (!amount || !reason) return reply.status(400).send({ error: "amount and reason are required" });
    try {
      const result = await editTransactionAmount(id, txnId, amount, reason, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /customers/:id/transactions/:txnId ──
  // Delete a CHARGE transaction (must not be billed)
  app.delete("/:id/transactions/:txnId", async (request, reply) => {
    const { id, txnId } = request.params as { id: string; txnId: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertAdmin(role);
    const { reason } = (request.body as { reason?: string }) || {};
    try {
      const result = await deleteTransaction(id, txnId, reason || "Deleted by admin", orgId, userId);
      return reply.send(result);
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

  // ─── SOA Generation & History ──────────────────────

  // POST /customers/:id/soa/generate — Create SOA record & mark billed
  app.post("/:id/soa/generate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role, userId } = request.user;
    assertArRole(role);
    const { id: customerId } = request.params as { id: string };
    const body = request.body as { from: string; to: string; unbilledOnly?: boolean; transactionIds?: string[] };
    if (!body?.from || !body?.to) {
      return reply.status(400).send({ error: "from and to are required" });
    }
    try {
      const result = await generateSOA(customerId, orgId, body.from, body.to, userId, body.unbilledOnly, body.transactionIds);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // GET /customers/:id/soa/history — List SOA records
  app.get("/:id/soa/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id: customerId } = request.params as { id: string };
    const data = await listSOARecords(customerId, orgId);
    return reply.send({ data });
  });

  // GET /customers/:id/transactions/:txnId/settled-invoices — Get invoices settled by a payment
  app.get("/:id/transactions/:txnId/settled-invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { txnId } = request.params as { txnId: string };
    const data = await getPaymentSettledInvoices(txnId, orgId);
    return reply.send({ data });
  });

  // GET /customers/:id/soa/:soaId/payment-summary — Get all payments for an SOA
  app.get("/:id/soa/:soaId/payment-summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    const data = await getSOAPaymentSummary(soaId, orgId);
    return reply.send({ data });
  });

  // GET /customers/:id/soa/:soaId/invoices — Get invoices within an SOA with allocation status
  app.get("/:id/soa/:soaId/invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    const data = await getSOAInvoices(soaId, orgId);
    return reply.send({ data });
  });

  // PATCH /customers/:id/soa/:soaId — Update SOA status
  app.patch("/:id/soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    assertArRole(role);
    const { soaId } = request.params as { soaId: string };
    const body = request.body as { status: string; paidAmount?: string };
    if (!body?.status) return reply.status(400).send({ error: "status is required" });
    try {
      await updateSOAStatus(soaId, orgId, body.status, body.paidAmount);
      return reply.send({ success: true });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });
};
