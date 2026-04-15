import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseQuery } from "../../lib/validate-query";
import {
  // Invoices
  listInvoices,
  getInvoice,
  createInvoice,
  bulkCreateInvoices,
  updateInvoice,
  voidInvoice,
  bulkMarkInvoicesPaid,
  // Check Vouchers
  listCheckVouchers,
  getCheckVoucher,
  createCheckVoucher,
  updateCheckVoucher,
  deleteCheckVoucher,
  approveCheckVoucher,
  markPrinted,
  releaseCheckVoucher,
  clearCheckVoucher,
  voidCheckVoucher,
  // Reports
  getAgingReport,
  getSupplierSOA,
  getSupplierSOAOverview,
  getSummary,
  getPDCReport,
  // Check Register
  getCheckRegister,
  releaseCheck,
  clearCheck,
  bounceCheck,
  cancelCheck,
  // Persistent supplier SOAs
  generateSupplierSOA,
  listSupplierSOAs,
  listAllSupplierSOAs,
  getSupplierSOAById,
  updateSupplierSOAStatus,
  paySupplierSOA,
  // Supplier master (AP-flavored CRUD)
  listSuppliersWithAPStats,
  getSupplierAPDetail,
  createSupplierAP,
  updateSupplierAP,
  bulkUpdateSupplierTerms,
  // Disbursement Vouchers
  createDisbursementVoucher,
  listDisbursementVouchers,
  getDisbursementVoucher,
  printDisbursementVoucher,
  confirmDisbursementVoucher,
  voidDisbursementVoucher,
  // Bank Accounts
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deactivateBankAccount,
} from "./service";

// ── Role helpers ──

const AP_ROLES = ["ADMIN", "MANAGER"];

function assertApRole(role: string) {
  if (!AP_ROLES.includes(role)) {
    throw Object.assign(new Error("Insufficient role for AP operations"), { statusCode: 403 });
  }
}

function assertAdmin(role: string) {
  if (role !== "ADMIN") {
    throw Object.assign(new Error("Only ADMIN can perform this action"), { statusCode: 403 });
  }
}

// ── Query schemas ──

const invoiceQuerySchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(50),
});

const cvQuerySchema = z.object({
  status: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const soaQuerySchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const accountsPayableRoutes: FastifyPluginAsync = async (app) => {

  // ═══════════════════════════════════════════════════════════════
  // SUPPLIER INVOICES
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /invoices ──────────────────────────────────
  app.get("/invoices", async (request, reply) => {
    const q = parseQuery(invoiceQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId } = request.storeContext!;
    const result = await listInvoices(
      orgId,
      {
        status: q.status,
        supplierId: q.supplierId,
        overdue: q.overdue === "true",
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        search: q.search,
      },
      q.cursor,
      q.limit,
    );
    return reply.send(result);
  });

  // ─── GET /invoices/:id ─────────────────────────────
  app.get("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getInvoice(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Invoice not found" });
    }
    return reply.send(result);
  });

  // ─── POST /invoices ────────────────────────────────
  app.post("/invoices", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId: string;
      invoiceNumber: string;
      invoiceDate: string;
      totalAmount: string;
      paymentTermsDays?: number;
      currency?: string;
      sourcePoId?: string;
      sourceReceiptId?: string;
      notes?: string;
    };

    if (!body.supplierId || !body.invoiceNumber || !body.invoiceDate || !body.totalAmount) {
      return reply.status(400).send({
        error: "supplierId, invoiceNumber, invoiceDate, and totalAmount are required",
      });
    }

    try {
      const result = await createInvoice(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /invoices/bulk-create ────────────────────
  // Create multiple invoices for one supplier in a single transaction.
  app.post("/invoices/bulk-create", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try { assertApRole(role); } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const body = request.body as {
      supplierId: string;
      sourcePoId?: string;
      notes?: string;
      invoices: Array<{ invoiceNumber: string; invoiceDate: string; amount: string }>;
    };
    if (!body.supplierId || !Array.isArray(body.invoices) || body.invoices.length === 0) {
      return reply.status(400).send({ error: "supplierId and invoices[] are required" });
    }
    try {
      const result = await bulkCreateInvoices(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /invoices/bulk-pay ────────────────────────
  // Directly mark multiple invoices as fully paid (COD / cash).
  // Bypasses the check-voucher workflow.
  app.post("/invoices/bulk-pay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      invoiceIds: string[];
      useInvoiceDateAsPaymentDate: boolean;
      paymentDate?: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    };

    if (!Array.isArray(body.invoiceIds) || body.invoiceIds.length === 0) {
      return reply.status(400).send({
        error: "invoiceIds must be a non-empty array",
      });
    }

    if (body.invoiceIds.length > 100) {
      return reply.status(400).send({
        error: "Maximum 100 invoices per bulk pay request",
      });
    }

    if (!body.useInvoiceDateAsPaymentDate && !body.paymentDate) {
      return reply.status(400).send({
        error: "paymentDate is required when useInvoiceDateAsPaymentDate is false",
      });
    }

    try {
      const result = await bulkMarkInvoicesPaid(orgId, userId, body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /invoices/:id ───────────────────────────
  app.patch("/invoices/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      invoiceNumber?: string;
      invoiceDate?: string;
      totalAmount?: string;
      paymentTermsDays?: number;
      notes?: string;
    };

    try {
      const result = await updateInvoice(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Invoice not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /invoices/:id/void ───────────────────────
  app.post("/invoices/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await voidInvoice(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Invoice not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // CHECK VOUCHERS
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /check-vouchers ───────────────────────────
  app.get("/check-vouchers", async (request, reply) => {
    const q = parseQuery(cvQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId } = request.storeContext!;
    const result = await listCheckVouchers(
      orgId,
      {
        status: q.status,
        supplierId: q.supplierId,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
      },
      q.cursor,
      q.limit,
    );
    return reply.send(result);
  });

  // ─── GET /check-vouchers/:id ──────────────────────
  app.get("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getCheckVoucher(orgId, id);
    if (!result) {
      return reply.status(404).send({ error: "Check voucher not found" });
    }
    return reply.send(result);
  });

  // ─── POST /check-vouchers ─────────────────────────
  app.post("/check-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId: string;
      checkDate: string;
      checkNumber?: string;
      bankName?: string;
      bankAccount?: string;
      notes?: string;
      lines: Array<{
        supplierInvoiceId: string;
        amount: string;
        deductionAmount?: string;
        deductionReason?: string;
      }>;
    };

    if (!body.supplierId || !body.checkDate || !body.lines) {
      return reply.status(400).send({
        error: "supplierId, checkDate, and lines are required",
      });
    }

    try {
      const result = await createCheckVoucher(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      if (err.code === "23505" || err.message?.includes("unique constraint")) {
        return reply.status(409).send({ error: "Duplicate CV number" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /check-vouchers/:id ────────────────────
  app.patch("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      checkDate?: string;
      checkNumber?: string;
      bankName?: string;
      bankAccount?: string;
      notes?: string;
    };

    try {
      const result = await updateCheckVoucher(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /check-vouchers/:id ───────────────────
  app.delete("/check-vouchers/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      await deleteCheckVoucher(orgId, id);
      return reply.status(204).send();
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /check-vouchers/:id/approve ─────────────
  app.post("/check-vouchers/:id/approve", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await approveCheckVoucher(orgId, id, userId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /check-vouchers/:id/mark-printed ────────
  app.post("/check-vouchers/:id/mark-printed", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await markPrinted(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /check-vouchers/:id/release ─────────────
  app.post("/check-vouchers/:id/release", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await releaseCheckVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /check-vouchers/:id/clear ───────────────
  app.post("/check-vouchers/:id/clear", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      const result = await clearCheckVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /check-vouchers/:id/void ────────────────
  app.post("/check-vouchers/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as { reason?: string };
    if (!body.reason) {
      return reply.status(400).send({ error: "Void reason is required" });
    }

    try {
      const result = await voidCheckVoucher(orgId, id, userId, body.reason);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Check voucher not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // REPORTS
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /reports/aging ────────────────────────────
  app.get("/reports/aging", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getAgingReport(orgId);
    return reply.send(result);
  });

  // ─── GET /reports/soa/:supplierId ─────────────────
  app.get("/reports/soa/:supplierId", async (request, reply) => {
    const { supplierId } = request.params as { supplierId: string };
    const { orgId } = request.storeContext!;

    const q = parseQuery(soaQuerySchema, request.query, reply);
    if (!q) return;

    try {
      const result = await getSupplierSOA(orgId, supplierId, q.dateFrom, q.dateTo);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /reports/supplier-soa ────────────────────
  app.get("/reports/supplier-soa", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getSupplierSOAOverview(orgId);
    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════
  // PERSISTENT SUPPLIER SOAs  (mirror of customer SOA history)
  // ═══════════════════════════════════════════════════════════════

  // ─── POST /supplier-soa/generate ──────────────────
  // Generate a persistent supplier SOA from the given invoice IDs.
  // Marks each invoice billed + creates frozen snapshot line items.
  app.post("/supplier-soa/generate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      supplierId?: string;
      invoiceIds?: string[];
      notes?: string;
    };
    if (!body?.supplierId) {
      return reply.status(400).send({ error: "supplierId is required" });
    }
    if (!Array.isArray(body.invoiceIds) || body.invoiceIds.length === 0) {
      return reply.status(400).send({ error: "invoiceIds must be a non-empty array" });
    }

    try {
      const result = await generateSupplierSOA(
        orgId,
        body.supplierId,
        body.invoiceIds,
        userId,
        body.notes,
      );
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /suppliers/:supplierId/soa-history ───────
  // List all persistent SOAs for a supplier (newest first).
  app.get("/suppliers/:supplierId/soa-history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { supplierId } = request.params as { supplierId: string };
    try {
      const data = await listSupplierSOAs(orgId, supplierId);
      return reply.send({ data });
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /supplier-soa/history ────────────────────
  // Cross-supplier SOA search — powers the dedicated SOA History page.
  // MUST be registered before /supplier-soa/:soaId to avoid Fastify
  // matching "history" as a :soaId parameter.
  app.get("/supplier-soa/history", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as {
      search?: string;
      status?: string;
      dateFrom?: string;
      dateTo?: string;
      limit?: string;
    };
    const limit = Math.min(parseInt(q.limit || "100", 10) || 100, 200);

    try {
      const result = await listAllSupplierSOAs(orgId, {
        search: q.search,
        status: q.status,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        limit,
      });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /supplier-soa/:soaId ─────────────────────
  // Return a historical supplier SOA snapshot by id — used by the
  // "Reprint" flow in the SOA history mini-list.
  app.get("/supplier-soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { soaId } = request.params as { soaId: string };
    try {
      const result = await getSupplierSOAById(orgId, soaId);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /supplier-soa/:soaId ───────────────────
  // Change status (GENERATED | SENT | VOID). Voiding unmarks the
  // invoices so they can be included in a future SOA.
  app.patch("/supplier-soa/:soaId", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { soaId } = request.params as { soaId: string };
    const { status } = (request.body as { status?: string }) ?? {};
    if (!status) {
      return reply.status(400).send({ error: "status is required" });
    }

    try {
      const result = await updateSupplierSOAStatus(orgId, soaId, status as any);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /supplier-soa/:soaId/pay ─────────────────
  // Record a payment against a supplier SOA. Allocates to invoices (oldest first).
  app.post("/supplier-soa/:soaId/pay", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const { soaId } = request.params as { soaId: string };
    const body = request.body as {
      amount: string;
      paymentDate: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    };

    if (!body.amount || !body.paymentDate) {
      return reply.status(400).send({
        error: "amount and paymentDate are required",
      });
    }

    try {
      const result = await paySupplierSOA(orgId, soaId, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier SOA not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // DISBURSEMENT VOUCHERS
  // ═══════════════════════════════════════════════════════════════

  app.post("/disbursement-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try { assertApRole(role); } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const body = request.body as any;
    if (!body.supplierId || (!body.grossAmount && !body.amount) || !body.paymentDate) {
      return reply.status(400).send({ error: "supplierId, grossAmount, and paymentDate are required" });
    }
    // Backward compat: if grossAmount not provided, use amount
    if (!body.grossAmount && body.amount) {
      body.grossAmount = body.amount;
    }
    try {
      const result = await createDisbursementVoucher(orgId, userId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.get("/disbursement-vouchers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as any;
    const result = await listDisbursementVouchers(orgId, {
      search: q.search,
      status: q.status,
      supplierId: q.supplierId,
      dateFrom: q.dateFrom,
      dateTo: q.dateTo,
      limit: q.limit ? parseInt(q.limit) : undefined,
    });
    return reply.send(result);
  });

  // Static routes BEFORE parameterized /:id
  app.get("/disbursement-vouchers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await getDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(404).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/print", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const { id } = request.params as { id: string };
    try {
      const result = await printDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/confirm", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const { id } = request.params as { id: string };
    try {
      const result = await confirmDisbursementVoucher(orgId, id);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  app.post("/disbursement-vouchers/:id/void", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    try { assertAdmin(role); } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }
    const { id } = request.params as { id: string };
    const { reason } = (request.body as any) ?? {};
    if (!reason) return reply.status(400).send({ error: "Void reason is required" });
    try {
      const result = await voidDisbursementVoucher(orgId, id, userId, reason);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // SUPPLIER MASTER (AP list page + edit drawer)
  // ═══════════════════════════════════════════════════════════════
  // Full-feature CRUD with per-supplier AP rollups. Lives under /ap/
  // so the frontend can reach it without touching the procurement
  // module's thinner /procurement/suppliers endpoint (which stays for
  // backwards compatibility with the existing PO + invoice forms).

  // ─── GET /ap/suppliers ────────────────────────────
  // Supplier list with per-row AP stats (open invoices, payable, overdue).
  app.get("/suppliers", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const data = await listSuppliersWithAPStats(orgId);
    return reply.send({ data });
  });

  // ─── GET /ap/suppliers/:id ────────────────────────
  // Single supplier detail for the edit drawer.
  app.get("/suppliers/:id", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const result = await getSupplierAPDetail(orgId, id);
    if (!result) return reply.status(404).send({ error: "Supplier not found" });
    return reply.send(result);
  });

  // ─── POST /ap/suppliers ───────────────────────────
  // Create a new supplier with full AP fields.
  app.post("/suppliers", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }
    const { orgId } = request.storeContext!;
    try {
      const result = await createSupplierAP(orgId, request.body as any);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /ap/suppliers/bulk-terms ────────────────
  // Bulk update payment_terms_days for multiple suppliers.
  // MUST be registered before /suppliers/:id to avoid Fastify matching "bulk-terms" as :id.
  app.patch("/suppliers/bulk-terms", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }

    const { orgId } = request.storeContext!;
    const body = request.body as {
      supplierIds: string[];
      paymentTermsDays: number;
    };

    if (!Array.isArray(body.supplierIds) || body.supplierIds.length === 0) {
      return reply.status(400).send({
        error: "supplierIds must be a non-empty array",
      });
    }

    if (typeof body.paymentTermsDays !== "number" || body.paymentTermsDays < 0) {
      return reply.status(400).send({
        error: "paymentTermsDays must be a non-negative integer",
      });
    }

    try {
      const result = await bulkUpdateSupplierTerms(orgId, body);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /ap/suppliers/:id ──────────────────────
  // Partial update. Supports deactivation via { isActive: false }.
  app.patch("/suppliers/:id", async (request, reply) => {
    const { role } = request.user;
    try {
      assertApRole(role);
    } catch (err: any) {
      return reply.status(err.statusCode ?? 403).send({ error: err.message });
    }
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    try {
      const result = await updateSupplierAP(orgId, id, request.body as any);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Supplier not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /reports/summary ─────────────────────────
  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getSummary(orgId);
    return reply.send(result);
  });

  // ─── GET /reports/pdcs (legacy alias) ──────────────
  app.get("/reports/pdcs", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getCheckRegister(orgId);
    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════
  // CHECK REGISTER
  // ═══════════════════════════════════════════════════════════════

  app.get("/check-register", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const q = request.query as Record<string, string>;
    const result = await getCheckRegister(orgId, {
      search: q.search, bank: q.bank, status: q.status,
      dateFrom: q.dateFrom, dateTo: q.dateTo,
    });
    return reply.send(result);
  });

  app.post("/check-register/:id/release", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) { return reply.status(403).send({ error: err.message }); }
    try { return reply.send(await releaseCheck(orgId, (request.params as any).id)); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  app.post("/check-register/:id/clear", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) { return reply.status(403).send({ error: err.message }); }
    try { return reply.send(await clearCheck(orgId, (request.params as any).id)); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  app.post("/check-register/:id/bounce", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) { return reply.status(403).send({ error: err.message }); }
    const { reason } = (request.body as any) ?? {};
    if (!reason) return reply.status(400).send({ error: "Bounce reason is required" });
    try { return reply.send(await bounceCheck(orgId, (request.params as any).id, reason)); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  app.post("/check-register/:id/cancel", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    try { assertApRole(role); } catch (err: any) { return reply.status(403).send({ error: err.message }); }
    try { return reply.send(await cancelCheck(orgId, (request.params as any).id)); }
    catch (err: any) { return reply.status(400).send({ error: err.message }); }
  });

  // ═══════════════════════════════════════════════════════════════
  // BANK ACCOUNTS
  // ═══════════════════════════════════════════════════════════════

  // ─── GET /bank-accounts ───────────────────────────
  app.get("/bank-accounts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await listBankAccounts(orgId);
    return reply.send(result);
  });

  // ─── POST /bank-accounts ──────────────────────────
  app.post("/bank-accounts", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      bankName: string;
      accountName: string;
      accountNumber: string;
      branch?: string;
      isDefault?: boolean;
    };

    if (!body.bankName || !body.accountName || !body.accountNumber) {
      return reply.status(400).send({
        error: "bankName, accountName, and accountNumber are required",
      });
    }

    try {
      const result = await createBankAccount(orgId, body);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── PATCH /bank-accounts/:id ─────────────────────
  app.patch("/bank-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    const body = request.body as {
      bankName?: string;
      accountName?: string;
      accountNumber?: string;
      branch?: string;
      isDefault?: boolean;
    };

    try {
      const result = await updateBankAccount(orgId, id, body);
      return reply.send(result);
    } catch (err: any) {
      if (err.message === "Bank account not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── DELETE /bank-accounts/:id ────────────────────
  app.delete("/bank-accounts/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { role } = request.user;

    try {
      assertAdmin(role);
    } catch (err: any) {
      return reply.status(403).send({ error: err.message });
    }

    try {
      await deactivateBankAccount(orgId, id);
      return reply.send({ success: true });
    } catch (err: any) {
      if (err.message === "Bank account not found") {
        return reply.status(404).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  });
};
