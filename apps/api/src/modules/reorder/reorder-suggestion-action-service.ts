import { db } from "@apex/database";
import { reorderSuggestions } from "@apex/database/schema";
import { and, eq, inArray, sql } from "drizzle-orm";

export async function dismissReorderSuggestion({
  orgId,
  id,
  userId,
}: {
  orgId: string;
  id: string;
  userId?: string;
}) {
  await db
    .update(reorderSuggestions)
    .set({
      status: "DISMISSED",
      actionedAt: new Date(),
      actionedBy: userId,
    })
    .where(
      and(eq(reorderSuggestions.id, id), eq(reorderSuggestions.orgId, orgId)),
    );
}

export async function updateReorderSuggestionQty({
  orgId,
  id,
  suggestedQty,
}: {
  orgId: string;
  id: string;
  suggestedQty: number;
}) {
  await db
    .update(reorderSuggestions)
    .set({ suggestedQty })
    .where(
      and(eq(reorderSuggestions.id, id), eq(reorderSuggestions.orgId, orgId)),
    );
}

export async function createPurchaseOrdersFromReorderSuggestions({
  orgId,
  userId,
  suggestionIds,
}: {
  orgId: string;
  userId?: string;
  suggestionIds: string[];
}) {
  const suggestions = await db
    .select()
    .from(reorderSuggestions)
    .where(
      and(
        eq(reorderSuggestions.orgId, orgId),
        eq(reorderSuggestions.status, "PENDING"),
        inArray(reorderSuggestions.id, suggestionIds),
      ),
    );

  if (suggestions.length === 0) {
    return null;
  }

  const bySupplier = new Map<string, typeof suggestions>();
  for (const suggestion of suggestions) {
    const key = suggestion.supplierId ?? "no-supplier";
    if (!bySupplier.has(key)) {
      bySupplier.set(key, []);
    }
    bySupplier.get(key)!.push(suggestion);
  }

  const results: {
    poNo: string;
    action: "created" | "updated";
    itemsAdded: number;
  }[] = [];
  const skippedNoSupplier = bySupplier.has("no-supplier")
    ? bySupplier.get("no-supplier")!.length
    : 0;

  await db.transaction(async (tx) => {
    for (const [supplierId, items] of bySupplier) {
      if (supplierId === "no-supplier") {
        continue;
      }

      const existingDraftRows = await tx.execute(sql`
        SELECT id, po_no FROM purchase_orders
        WHERE supplier_id = ${supplierId} AND status = 'DRAFT' AND org_id = ${orgId}
        ORDER BY created_at DESC LIMIT 1
      `);
      const existingDraft = (existingDraftRows as any[])[0];

      let poId: string;
      let poNo: string;
      let action: "created" | "updated";

      if (existingDraft) {
        poId = existingDraft.id;
        poNo = existingDraft.po_no;
        action = "updated";
      } else {
        const seqRows = await tx.execute(
          sql`SELECT COALESCE(MAX(CAST(SUBSTRING(po_no FROM 4) AS INTEGER)), 0) + 1 AS next_num FROM purchase_orders WHERE org_id = ${orgId}`,
        );
        const nextNum = (seqRows as any[])[0].next_num;
        poNo = `PO-${String(nextNum).padStart(6, "0")}`;

        const locRows = await tx.execute(
          sql`SELECT id FROM locations WHERE org_id = ${orgId} AND is_active = true LIMIT 1`,
        );
        const locationId = (locRows as any[])[0]?.id;
        if (!locationId) {
          continue;
        }

        const poRows = await tx.execute(sql`
          INSERT INTO purchase_orders (
            id, org_id, po_no, supplier_id, destination_location_id,
            status, created_by_user_id, idempotency_key, created_at, updated_at
          )
          VALUES (
            gen_random_uuid(), ${orgId}, ${poNo}, ${supplierId}, ${locationId},
            'DRAFT', ${userId}, gen_random_uuid(), NOW(), NOW()
          )
          RETURNING id, po_no
        `);
        poId = (poRows as any[])[0].id;
        action = "created";
      }

      let itemsAdded = 0;
      for (const item of items) {
        const existingLine = await tx.execute(sql`
          SELECT id, ordered_qty FROM po_lines
          WHERE purchase_order_id = ${poId} AND product_id = ${item.productId}
          LIMIT 1
        `);

        if ((existingLine as any[]).length > 0) {
          await tx.execute(sql`
            UPDATE po_lines
            SET ordered_qty = ordered_qty + ${item.suggestedQty},
                unit_cost = COALESCE((SELECT cost_price FROM products WHERE id = ${item.productId}), unit_cost),
                updated_at = NOW()
            WHERE id = ${(existingLine as any[])[0].id}
          `);
        } else {
          await tx.execute(sql`
            INSERT INTO po_lines (
              id, purchase_order_id, org_id, product_id, ordered_qty, unit_cost,
              created_at, updated_at
            )
            VALUES (
              gen_random_uuid(), ${poId}, ${orgId}, ${item.productId}, ${item.suggestedQty},
              COALESCE((SELECT cost_price FROM products WHERE id = ${item.productId}), '0.00'),
              NOW(), NOW()
            )
          `);
        }
        itemsAdded++;
      }

      results.push({ poNo, action, itemsAdded });

      const itemIds = items.map((item) => item.id);
      await tx.execute(sql`
        UPDATE reorder_suggestions
        SET status = 'ORDERED', actioned_at = NOW(), actioned_by = ${userId}
        WHERE id = ANY(${itemIds})
      `);
    }
  });

  return {
    results,
    skippedNoSupplier,
  };
}
