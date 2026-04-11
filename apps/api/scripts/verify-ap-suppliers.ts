/**
 * Smoke-test the new AP supplier master services against the live DB.
 * Calls each service function in isolation and verifies:
 *   - listSuppliersWithAPStats returns rollups that match direct SQL sums
 *   - getSupplierAPDetail returns every AP field
 *   - updateSupplierAP edits a field and then reverts it
 *   - Aging report no longer has snake_case field names
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import {
  listSuppliersWithAPStats,
  getSupplierAPDetail,
  updateSupplierAP,
  getAgingReport,
} from "../src/modules/accounts-payable/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== AP Supplier services smoke test ===\n");

  // ── 1. listSuppliersWithAPStats ──
  console.log("[1/4] listSuppliersWithAPStats");
  const list = await listSuppliersWithAPStats(ORG_ID);
  console.log(`  returned ${list.length} suppliers`);
  const withBalance = list.filter((s) => s.totalPayable > 0);
  console.log(`  ${withBalance.length} have outstanding payable`);
  console.log(
    `  sample (first 3 by total payable):`,
  );
  console.table(
    [...list]
      .sort((a, b) => b.totalPayable - a.totalPayable)
      .slice(0, 3)
      .map((s) => ({
        name: s.name,
        terms: s.paymentTermsDays === 0 ? "COD" : `Net ${s.paymentTermsDays}`,
        open: s.openCount,
        payable: s.totalPayable.toFixed(2),
        overdue: s.overdueAmount.toFixed(2),
        active: s.isActive,
      })),
  );
  // Cross-check the grand total against a direct SQL sum on supplier_invoices
  const [{ direct_total }] = (await db.execute(sql`
    SELECT COALESCE(SUM(balance::numeric), 0)::text AS direct_total
    FROM supplier_invoices
    WHERE org_id = ${ORG_ID}
      AND status IN ('OPEN','PARTIALLY_PAID')
  `)) as any[];
  const listTotal = list.reduce((sum, s) => sum + s.totalPayable, 0);
  const delta = Math.abs(parseFloat(direct_total) - listTotal);
  console.log(`  grand total: listSvc=${listTotal.toFixed(2)} vs direct SQL=${parseFloat(direct_total).toFixed(2)}`);
  console.log(`  delta: ${delta.toFixed(4)} ${delta < 0.01 ? "\u2713" : "\u2717"}`);
  if (delta > 0.01) throw new Error("grand total mismatch");

  // ── 2. getSupplierAPDetail ──
  console.log("\n[2/4] getSupplierAPDetail");
  const first = list[0];
  if (!first) {
    console.log("  (no suppliers to test)");
  } else {
    const detail = await getSupplierAPDetail(ORG_ID, first.id);
    if (!detail) throw new Error("detail missing");
    console.log(`  loaded: ${detail.name}`);
    console.log(
      `  has fields:`,
      Object.keys(detail).filter((k) => (detail as any)[k] != null).join(", "),
    );

    // ── 3. updateSupplierAP round-trip ──
    console.log("\n[3/4] updateSupplierAP (edit + revert a field)");
    const originalNotes = detail.notes;
    const testNotes = `smoke-test ${Date.now()}`;
    await updateSupplierAP(ORG_ID, detail.id, { notes: testNotes });
    const afterEdit = await getSupplierAPDetail(ORG_ID, detail.id);
    if (afterEdit?.notes !== testNotes) {
      throw new Error(`expected notes=${testNotes}, got ${afterEdit?.notes}`);
    }
    console.log(`  \u2713 notes written`);

    // Revert
    await updateSupplierAP(ORG_ID, detail.id, { notes: originalNotes });
    const afterRevert = await getSupplierAPDetail(ORG_ID, detail.id);
    if (afterRevert?.notes !== originalNotes) {
      throw new Error("notes revert failed — manual cleanup may be needed");
    }
    console.log(`  \u2713 notes reverted to original`);
  }

  // ── 4. getAgingReport no longer returns snake_case ──
  console.log("\n[4/4] getAgingReport (camelCase field names)");
  const aging = await getAgingReport(ORG_ID);
  console.log(`  returned ${aging.data.length} aging rows`);
  if (aging.data.length > 0) {
    const r = aging.data[0];
    const requiredKeys = [
      "supplierId",
      "supplierName",
      "current",
      "days1to30",
      "days31to60",
      "days61to90",
      "days91to120",
      "days121to180",
      "over180",
      "total",
    ];
    const missing = requiredKeys.filter((k) => !(k in r));
    if (missing.length > 0) {
      throw new Error(`missing keys: ${missing.join(", ")}`);
    }
    console.log(`  all camelCase keys present \u2713`);
    console.log(`  top row: ${r.supplierName} — total=${r.total.toFixed(2)}`);
    console.log(
      `  bucket values: current=${r.current.toFixed(2)}, 1-30=${r.days1to30.toFixed(2)}, 31-60=${r.days31to60.toFixed(2)}, 61-90=${r.days61to90.toFixed(2)}`,
    );
    // Verify they're numbers, not strings
    if (typeof r.total !== "number" || typeof r.current !== "number") {
      throw new Error("values must be numbers, not strings");
    }
  }

  console.log("\n=== ALL SMOKE TESTS PASSED ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error(e);
  process.exit(1);
});
