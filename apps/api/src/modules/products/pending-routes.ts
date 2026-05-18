import type { FastifyInstance } from "fastify";
import { db } from "@apex/database";
import { sql } from "drizzle-orm";

export function registerProductPendingRoutes(app: FastifyInstance) {
  // --- GET /products/:id/pending-orders ----------------
  // Returns existing POs, backorders, and last supplier for a product
  app.get("/:id/pending-orders", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    // 1. PO lines for this product in open POs
    const poLineRows = await db.execute(sql`
      SELECT
        po.id AS "poId",
        po.po_no AS "poNumber",
        po.status,
        pol.ordered_qty AS "quantityOrdered",
        pol.received_accepted_qty AS "quantityReceived",
        (pol.ordered_qty - pol.received_accepted_qty) AS "quantityRemaining",
        pol.unit_cost AS "unitCost",
        s.id AS "supplierId",
        s.name AS "supplierName"
      FROM po_lines pol
      JOIN purchase_orders po ON pol.purchase_order_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE pol.product_id = ${id}
        AND po.org_id = ${orgId}
        AND po.status IN ('DRAFT', 'SUBMITTED', 'PARTIALLY_RECEIVED')
      ORDER BY po.created_at DESC
    `);

    const draftPOs: any[] = [];
    const submittedPOs: any[] = [];
    for (const row of poLineRows as any[]) {
      if (row.status === "DRAFT") {
        draftPOs.push({
          poId: row.poId,
          poNumber: row.poNumber,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          quantity: Number(row.quantityOrdered),
          status: "draft",
        });
      } else {
        submittedPOs.push({
          poId: row.poId,
          poNumber: row.poNumber,
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          quantityOrdered: Number(row.quantityOrdered),
          quantityReceived: Number(row.quantityReceived),
          quantityRemaining: Number(row.quantityRemaining),
          status: row.status.toLowerCase(),
        });
      }
    }

    // 2. Pending backorders
    const boRows = await db.execute(sql`
      SELECT
        b.id AS "backorderId",
        b.original_po_number AS "sourcePoNumber",
        b.supplier_id AS "supplierId",
        b.supplier_name AS "supplierName",
        COALESCE(b.quantity_outstanding, b.quantity) AS "quantityOutstanding",
        b.status,
        b.wait_until AS "waitUntil"
      FROM backorders b
      WHERE b.product_id = ${id}
        AND b.org_id = ${orgId}
        AND b.status IN ('PENDING', 'INCLUDED_IN_PO')
      ORDER BY b.created_at DESC
    `);

    // 3. Last supplier (most recent PO for this product)
    const lastSupplierRows = await db.execute(sql`
      SELECT
        s.id AS "supplierId",
        s.name AS "supplierName",
        pol.unit_cost AS "lastCost",
        po.po_no AS "lastPoNumber",
        po.created_at AS "lastPoDate"
      FROM po_lines pol
      JOIN purchase_orders po ON pol.purchase_order_id = po.id
      LEFT JOIN suppliers s ON po.supplier_id = s.id
      WHERE pol.product_id = ${id}
        AND po.org_id = ${orgId}
      ORDER BY po.created_at DESC
      LIMIT 1
    `);

    // 4. Current stock + reorder point
    const stockRows = await db.execute(sql`
      SELECT
        COALESCE(SUM(i.stock_level), 0)::int AS "totalStock",
        COALESCE(MAX(i.reorder_point), 0)::int AS "reorderPoint"
      FROM inventory i
      JOIN locations loc ON i.location_id = loc.id AND loc.is_active = true
      WHERE i.product_id = ${id}
        AND i.org_id = ${orgId}
    `);

    const stock = (stockRows as any[])[0] ?? { totalStock: 0, reorderPoint: 0 };
    const suggestedQty = Math.max(Number(stock.reorderPoint) - Number(stock.totalStock), 1);

    const lastSupplierRow = (lastSupplierRows as any[])[0] ?? null;

    return reply.send({
      draftPOs,
      submittedPOs,
      backorders: (boRows as any[]).map((r) => ({
        backorderId: r.backorderId,
        sourcePoNumber: r.sourcePoNumber,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        quantityOutstanding: Number(r.quantityOutstanding),
        status: r.status.toLowerCase(),
        waitUntil: r.waitUntil,
      })),
      lastSupplier: lastSupplierRow
        ? {
            supplierId: lastSupplierRow.supplierId,
            supplierName: lastSupplierRow.supplierName,
            lastCost: lastSupplierRow.lastCost,
            lastPoNumber: lastSupplierRow.lastPoNumber,
            lastPoDate: lastSupplierRow.lastPoDate,
          }
        : null,
      suggestedQty,
    });
  });

  // --- POST /products/:id/snooze-reorder ----------------
  // Hide a product from Low Stock lists for N days
  app.post("/:id/snooze-reorder", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };
    const { days } = request.body as { days: number };

    if (![7, 14, 30, 90].includes(days)) {
      return reply.status(400).send({ error: "days must be 7, 14, 30, or 90" });
    }

    await db.execute(sql`
      UPDATE products
      SET reorder_snoozed_until = CURRENT_DATE + ${days}::int,
          updated_at = NOW()
      WHERE id = ${id} AND org_id = ${orgId}
    `);

    return reply.send({ success: true });
  });

  // --- GET /products/:id/pending-returns ----------------
  // Returns draft/submitted RTVs that contain this product
  app.get("/:id/pending-returns", async (request, reply) => {
    const { orgId } = request.storeContext!;
    const { id } = request.params as { id: string };

    const rows = await db.execute(sql`
      SELECT
        sr.id AS "rtvId",
        sr.rtv_number AS "rtvNo",
        sr.status,
        sr.supplier_id AS "supplierId",
        s.name AS "supplierName",
        sr.location_id AS "locationId",
        loc.name AS "locationName",
        srl.quantity,
        sr.reason,
        srl.condition,
        sr.created_at AS "createdAt"
      FROM supplier_return_lines srl
      JOIN supplier_returns sr ON srl.supplier_return_id = sr.id
      LEFT JOIN suppliers s ON sr.supplier_id = s.id
      LEFT JOIN locations loc ON sr.location_id = loc.id
      WHERE srl.product_id = ${id}
        AND sr.org_id = ${orgId}
        AND sr.status IN ('DRAFT', 'SUBMITTED')
      ORDER BY sr.created_at DESC
    `);

    return reply.send({ pendingReturns: rows });
  });
}
