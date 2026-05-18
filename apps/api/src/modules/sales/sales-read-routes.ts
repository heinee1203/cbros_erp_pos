import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@apex/database";
import { parseQuery, salesQuerySchema } from "../../lib/validate-query";
import {
  getHistoricalReceipt,
  listHistoricalReceipts,
  listHistoricalSales,
} from "./sale-history-service";
import {
  getSale,
  getSaleByIdempotencyKey,
  getSaleByNumber,
  getSaleJournal,
  listSales,
} from "./sale-read-service";

export async function registerSalesReadRoutes(app: FastifyInstance) {
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

  // Get all line items for a specific imported receipt
  app.get("/history/receipt/:receiptNumber", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { receiptNumber } = request.params as { receiptNumber: string };
    const receipt = await getHistoricalReceipt(orgId, receiptNumber);
    if (!receipt) return reply.status(404).send({ error: "Receipt not found" });
    return reply.send(receipt);
  });

  // Remove duplicate imported sales records
  app.post("/history/deduplicate", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { role } = request.user;
    if (!["ADMIN", "MANAGER"].includes(role)) {
      return reply.status(403).send({ error: "Admin or Manager required" });
    }

    const body = request.body as { dryRun?: boolean } | undefined;
    const dryRun = body?.dryRun !== false;

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

  // Auto-increment receipt number for BIR compliance
  app.get("/next-receipt-number", async (request, reply) => {
    const { orgId } = request.storeContext!;

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

    const receiptNumber = `OR-${String(nextNum).padStart(7, "0")}`;
    return reply.send({ receiptNumber });
  });

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

  // Reconciliation lookup for mobile POS.
  app.get("/by-idempotency-key/:key", async (request, reply) => {
    const { key } = request.params as { key: string };
    const { orgId } = request.storeContext!;

    const result = await getSaleByIdempotencyKey(key, orgId);
    if (!result) {
      return reply.status(404).send({ error: "No sale found for this idempotency key" });
    }
    return reply.send(result);
  });

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

  // Get sale-related journal entries
  app.get("/:id/journal", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { orgId } = request.storeContext!;

    const entries = await getSaleJournal(id, orgId);
    return reply.send({ data: entries });
  });
}
