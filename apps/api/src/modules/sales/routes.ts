import type { FastifyPluginAsync } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@apex/database";
import { logAction } from "../audit/service";
import {
  createSaleSchema,
  completeSaleSchema,
  voidSaleSchema,
  refundSaleSchema,
} from "@apex/types";
import { POS_ROLES, REFUND_ROLES } from "@apex/types";
import {
  createSale,
  parkSale,
  resumeSale,
  voidSale,
  completeSale,
  refundSale,
  getSale,
  getSaleByNumber,
  getSaleByIdempotencyKey,
  getSaleJournal,
  listSales,
  listHistoricalSales,
  listHistoricalReceipts,
  getHistoricalReceipt,
} from "./service";
import { CreditLimitError } from "../customers/service";
import { parseQuery, salesQuerySchema } from "../../lib/validate-query";

function assertPosRole(role: string) {
  if (!POS_ROLES.includes(role as any)) {
    throw new Error("Insufficient role for POS operations");
  }
}

export const salesRoutes: FastifyPluginAsync = async (app) => {
  // ─── POST /sales ─────────────────────────────────
  // Create a new sale in OPEN status
  app.post("/", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    if (!locationId) {
      return reply.status(400).send({ error: "A specific location must be selected for this operation" });
    }
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = createSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await createSale(parsed.data, orgId, locationId, userId);
      return reply.status(201).send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/park ────────────────────────
  // Park an open sale (OPEN -> PARKED)
  app.post("/:id/park", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await parkSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/resume ──────────────────────
  // Resume a parked sale (PARKED -> OPEN)
  app.post("/:id/resume", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    try {
      const result = await resumeSale(id, orgId, userId);
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/void ───────────────────────
  // Void a sale (QUOTE/OPEN/PARKED -> VOIDED)
  app.post("/:id/void", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = voidSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await voidSale(id, orgId, userId, parsed.data.notes);
      logAction({ orgId, userId, action: "SALE_VOID", entityType: "SALE", entityId: id, ipAddress: request.ip });
      return reply.send(result);
    } catch (err: any) {
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/complete ────────────────────
  // Complete a sale — THE CHECKOUT PATH
  // Deducts inventory, creates SALE journal entries
  app.post("/:id/complete", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;
    assertPosRole(role);

    const parsed = completeSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await completeSale(id, orgId, userId, parsed.data);
      logAction({ orgId, userId, action: "SALE_COMPLETE", entityType: "SALE", entityId: id, details: { lineCount: parsed.data.payments?.length }, ipAddress: request.ip });
      return reply.send(result);
    } catch (err: any) {
      if (err instanceof CreditLimitError) {
        return reply.status(409).send({
          error: err.message,
          code: "CREDIT_LIMIT_EXCEEDED",
          overage: err.overage,
          currentBalance: err.currentBalance,
          creditLimit: err.creditLimit,
        });
      }
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("idempotency")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── POST /sales/:id/refund ──────────────────────
  // Refund a completed sale — admin/manager only
  // Creates RETURN journal entries (reversal)
  app.post("/:id/refund", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;
    const { userId, role } = request.user;

    if (!REFUND_ROLES.includes(role as any)) {
      return reply
        .status(403)
        .send({ error: "Only ADMIN or MANAGER can process refunds" });
    }

    const parsed = refundSaleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Validation failed", details: parsed.error.flatten() });
    }

    try {
      const result = await refundSale(id, orgId, userId, role, parsed.data);
      return reply.send(result);
    } catch (err: any) {
      if (
        err.code === "23505" ||
        err.message?.includes("unique constraint") ||
        err.message?.includes("idempotency")
      ) {
        return reply
          .status(409)
          .send({ error: "Duplicate request (idempotency key already used)" });
      }
      return reply.status(400).send({ error: err.message });
    }
  });

  // ─── GET /sales ────────────────────────────────────
  // List sales with filters, pagination, joined display fields
  app.get("/", async (request, reply) => {
    const q = parseQuery(salesQuerySchema, request.query, reply);
    if (!q) return;

    const { orgId, locationId } = request.storeContext!;
    const { role } = request.user;

    const allLocations = q.allLocations === "true" || !locationId;
    if (allLocations && !["ADMIN", "MANAGER"].includes(role)) {
      return reply
        .status(403)
        .send({ error: "Cross-location access requires ADMIN or MANAGER" });
    }

    const result = await listSales(orgId, {
      locationId: (q as any).locationId || (allLocations ? undefined : locationId),
      status: q.status?.split(",").filter(Boolean),
      from: q.from,
      to: q.to,
      q: q.q,
      employeeId: (q as any).employeeId || undefined,
      cursor: q.cursor,
      limit: q.limit,
    });

    return reply.send(result);
  });

  // ─── GET /sales/history ──────────────────────────
  // List imported historical sales (from Loyverse Receipts CSV)
  app.get("/history", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = request.query as {
      from?: string;
      to?: string;
      q?: string;
      cursor?: string;
      limit?: string;
    };
    const result = await listHistoricalSales(orgId, {
      locationId: locationId || undefined,
      from: q.from,
      to: q.to,
      q: q.q,
      cursor: q.cursor,
      limit: q.limit ? parseInt(q.limit) : 50,
    });
    return reply.send(result);
  });

  // ─── GET /sales/history/receipts ──────────────────
  // List imported receipts aggregated (one row per receipt)
  app.get("/history/receipts", async (request, reply) => {
    const { orgId, locationId } = request.storeContext!;
    const q = request.query as {
      from?: string;
      to?: string;
      q?: string;
      locationId?: string;
      employeeName?: string;
      cursor?: string;
      offset?: string;
      limit?: string;
    };
    const result = await listHistoricalReceipts(orgId, {
      locationId: q.locationId || locationId || undefined,
      from: q.from,
      to: q.to,
      q: q.q,
      employeeName: q.employeeName || undefined,
      cursor: q.cursor,
      offset: q.offset ? parseInt(q.offset) : undefined,
      limit: q.limit ? parseInt(q.limit) : 50,
    });
    return reply.send(result);
  });

  // ─── GET /sales/history/receipt/:receiptNumber ────
  // Get all line items for a specific imported receipt
  app.get("/history/receipt/:receiptNumber", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { receiptNumber } = request.params as { receiptNumber: string };
    const receipt = await getHistoricalReceipt(orgId, receiptNumber);
    if (!receipt) return reply.status(404).send({ error: "Receipt not found" });
    return reply.send(receipt);
  });

  // ─── POST /sales/history/deduplicate ────────────
  // Remove duplicate imported sales records
  app.post("/history/deduplicate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!["ADMIN", "MANAGER"].includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }

    const body = request.body as { dryRun?: boolean } | undefined;
    const dryRun = body?.dryRun !== false; // default to dry run

    // Count total and duplicates using window function (much faster on large tables)
    const totalResult = await db.execute(
      sql`SELECT COUNT(*)::int AS total FROM historical_sales WHERE org_id = ${orgId}`
    );
    const totalCount = (totalResult[0] as any)?.total ?? 0;

    const uniqueResult = await db.execute(
      sql`SELECT COUNT(*)::int AS unique_count FROM (
        SELECT DISTINCT ON (reason_reference, sku, movement_date, reason_type, quantity)
          id FROM historical_sales WHERE org_id = ${orgId}
        ORDER BY reason_reference, sku, movement_date, reason_type, quantity, id ASC
      ) t`
    );
    const uniqueCount = (uniqueResult[0] as any)?.unique_count ?? 0;
    const dupCount = totalCount - uniqueCount;

    if (dryRun) {
      return reply.send({
        dryRun: true,
        totalRecords: totalCount,
        duplicates: dupCount,
        uniqueRecords: uniqueCount,
      });
    }

    // Delete duplicates using window function (faster than NOT IN on large tables)
    const deleteResult = await db.execute(
      sql`WITH dups AS (
        SELECT id, ROW_NUMBER() OVER (
          PARTITION BY reason_reference, sku, movement_date, reason_type, quantity
          ORDER BY id
        ) AS rn
        FROM historical_sales
        WHERE org_id = ${orgId}
      )
      DELETE FROM historical_sales
      WHERE id IN (SELECT id FROM dups WHERE rn > 1)`
    );

    return reply.send({
      dryRun: false,
      removed: (deleteResult as any).rowCount ?? dupCount,
      remaining: totalCount - dupCount,
    });
  });

  // ─── GET /sales/next-receipt-number ──────────────
  // Auto-increment receipt number for BIR compliance
  app.get("/next-receipt-number", async (request, reply) => {
    const { orgId } = request.storeContext!;

    // Get the highest existing receipt number with OR- prefix
    const [result] = await db.execute(
      sql`SELECT receipt_number FROM sales
          WHERE org_id = ${orgId} AND receipt_number IS NOT NULL AND receipt_number LIKE 'OR-%'
          ORDER BY receipt_number DESC LIMIT 1`
    );

    let nextNum = 1;
    if (result?.receipt_number) {
      const match = (result.receipt_number as string).match(/OR-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }

    const receiptNumber = `OR-${String(nextNum).padStart(7, '0')}`;
    return reply.send({ receiptNumber });
  });

  // ─── GET /sales/by-number/:saleNo ────────────────
  // Resolve sale by public sale_no (for deep-linking)
  app.get("/by-number/:saleNo", async (request, reply) => {
    const { saleNo } = request.params as { saleNo: string };
    const { orgId } = request.storeContext!;

    const result = await getSaleByNumber(saleNo, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Sale not found" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/by-idempotency-key/:key ────────────
  // Reconciliation lookup for mobile POS — returns sale if it was
  // already completed with this idempotency key
  app.get("/by-idempotency-key/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const { orgId } = request.storeContext!;

    const result = await getSaleByIdempotencyKey(key, orgId);
    if (!result) {
      return reply.status(404).send({ error: "No sale found for this idempotency key" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/:id ─────────────────────────────
  // Get sale details with enriched lines
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const result = await getSale(id, orgId);
    if (!result) {
      return reply.status(404).send({ error: "Sale not found" });
    }
    return reply.send(result);
  });

  // ─── GET /sales/:id/journal ──────────────────────
  // Get sale-related journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const entries = await getSaleJournal(id, orgId);
    return reply.send({ data: entries });
  });
};
