import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { parseQuery } from "../../lib/validate-query";
import {
  // Invoices
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  voidInvoice,
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
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
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

  // ─── GET /reports/summary ─────────────────────────
  app.get("/reports/summary", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getSummary(orgId);
    return reply.send(result);
  });

  // ─── GET /reports/pdcs ────────────────────────────
  app.get("/reports/pdcs", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const result = await getPDCReport(orgId);
    return reply.send(result);
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
