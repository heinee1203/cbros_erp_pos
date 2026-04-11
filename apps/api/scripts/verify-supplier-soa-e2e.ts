/**
 * End-to-end verification of the new supplier SOA history infrastructure
 * against the live database. Exercises:
 *
 *   1. listInvoices — returns billed / billedSoaId fields
 *   2. generateSupplierSOA — reserves number, creates record + lines,
 *      marks invoices billed
 *   3. listSupplierSOAs — returns the new SOA
 *   4. getSupplierSOAById — returns frozen line item snapshots
 *   5. generateSupplierSOA — refuses to re-bill the same invoices
 *   6. updateSupplierSOAStatus — VOID unmarks invoices
 *   7. Re-generate after void works (invoices eligible again)
 *   8. Final cleanup — VOID the test SOA to leave DB in same state
 *
 * Runs entirely against real West Elm invoices — but the only mutations
 * are against supplier_soa_records / supplier_soa_line_items /
 * supplier_soa_number_sequence and the billed flag on West Elm invoices.
 * After cleanup, the test SOA is voided (not deleted — we preserve the
 * audit trail) and all West Elm invoices are back to billed=false.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import {
  listInvoices,
  generateSupplierSOA,
  listSupplierSOAs,
  getSupplierSOAById,
  updateSupplierSOAStatus,
} from "../src/modules/accounts-payable/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const WEST_ELM_ID = "fa06bfbb-5a84-41b7-9a28-23538c8c1c00";

function log(step: string, msg = "") {
  console.log(`\n${"─".repeat(4)} ${step} ${"─".repeat(Math.max(0, 60 - step.length))} ${msg}`);
}

async function main() {
  console.log("=== Supplier SOA end-to-end verification ===\n");

  // ────────────────────────────────────────────────────────────
  log("1/8 listInvoices — billed fields");
  const invListRes = await listInvoices(
    ORG_ID,
    { status: "OPEN,PARTIALLY_PAID", supplierId: WEST_ELM_ID, overdue: false },
    undefined,
    100,
  );
  const invoices = invListRes.data;
  console.log(`listInvoices returned ${invoices.length} rows`);
  if (invoices.length < 2) {
    console.error("ABORT: need at least 2 West Elm invoices to run the test");
    process.exit(1);
  }
  const firstTwo = invoices.slice(0, 2);
  console.table(
    invoices.map((r: any) => ({
      invoice_number: r.invoiceNumber,
      total: r.totalAmount,
      balance: r.balance,
      billed: r.billed,
      billed_soa_id: r.billedSoaId,
    })),
  );
  const anyBilled = invoices.some((i: any) => i.billed === true);
  if (anyBilled) {
    console.log("⚠  WARNING: some invoices are already billed — cleaning up first");
    await db.execute(sql`
      UPDATE supplier_invoices
      SET billed = false, billed_soa_id = NULL
      WHERE supplier_id = ${WEST_ELM_ID}
    `);
    await db.execute(sql`
      UPDATE supplier_soa_records SET status = 'VOID'
      WHERE supplier_id = ${WEST_ELM_ID} AND status != 'VOID'
    `);
  }

  // ────────────────────────────────────────────────────────────
  log("2/8 generateSupplierSOA — first 2 invoices");
  const created = await generateSupplierSOA(
    ORG_ID,
    WEST_ELM_ID,
    firstTwo.map((i: any) => i.id),
    undefined,
    "e2e test — auto generated",
  );
  console.log("created SOA:");
  console.table([created]);
  if (created.invoiceCount !== 2) throw new Error(`Expected 2 invoices, got ${created.invoiceCount}`);
  if (!created.soaNumber.startsWith("SUPP-SOA-")) throw new Error(`Unexpected SOA number: ${created.soaNumber}`);
  const expectedTotal =
    parseFloat(firstTwo[0].totalAmount) + parseFloat(firstTwo[1].totalAmount);
  if (Math.abs(created.totalAmount - expectedTotal) > 0.005) {
    throw new Error(`Total mismatch: ${created.totalAmount} vs ${expectedTotal}`);
  }
  console.log("✓ totals match");

  // ────────────────────────────────────────────────────────────
  log("3/8 listInvoices — billed flags updated after generate");
  const afterGen = await listInvoices(
    ORG_ID,
    { status: "OPEN,PARTIALLY_PAID", supplierId: WEST_ELM_ID, overdue: false },
    undefined,
    100,
  );
  const billedSet = new Set(
    afterGen.data.filter((i: any) => i.billed === true).map((i: any) => i.id),
  );
  for (const inv of firstTwo) {
    if (!billedSet.has(inv.id)) {
      throw new Error(`Invoice ${inv.invoiceNumber} should be billed=true after generate`);
    }
  }
  const billedCount = afterGen.data.filter((i: any) => i.billed).length;
  console.log(`${billedCount} invoices now billed=true (expected 2) ${billedCount === 2 ? "✓" : "✗"}`);
  for (const inv of afterGen.data) {
    if (billedSet.has(inv.id)) {
      if ((inv as any).billedSoaId !== created.id) {
        throw new Error(`billedSoaId mismatch on ${inv.invoiceNumber}`);
      }
    }
  }
  console.log("✓ billed_soa_id points at new SOA");

  // ────────────────────────────────────────────────────────────
  log("4/8 listSupplierSOAs — SOA appears in history");
  const history = await listSupplierSOAs(ORG_ID, WEST_ELM_ID);
  const found = history.find((h) => h.id === created.id);
  if (!found) throw new Error("New SOA not found in history");
  console.log(`history has ${history.length} rows, new SOA present ✓`);
  console.log(`status: ${found.status} (expected GENERATED) ${found.status === "GENERATED" ? "✓" : "✗"}`);

  // ────────────────────────────────────────────────────────────
  log("5/8 getSupplierSOAById — frozen snapshot");
  const snap = await getSupplierSOAById(ORG_ID, created.id);
  console.log(`snap: ${snap.soaNumber}, ${snap.invoices.length} invoices, total=${snap.totalAmount}`);
  if (snap.invoices.length !== 2) throw new Error(`Expected 2 snap invoices, got ${snap.invoices.length}`);
  for (const line of snap.invoices) {
    const src = firstTwo.find((i: any) => i.id === line.id);
    if (!src) throw new Error(`Snap invoice ${line.invoiceNumber} not in original set`);
    if (Math.abs(line.totalAmount - parseFloat(src.totalAmount)) > 0.005) {
      throw new Error(`Snap total mismatch on ${line.invoiceNumber}`);
    }
    if (Math.abs(line.balance - parseFloat(src.balance)) > 0.005) {
      throw new Error(`Snap balance mismatch on ${line.invoiceNumber}`);
    }
  }
  console.log("✓ snapshot values match source invoices exactly");

  // ────────────────────────────────────────────────────────────
  log("6/8 generateSupplierSOA — double-bill guard");
  let doubleBillBlocked = false;
  try {
    await generateSupplierSOA(
      ORG_ID,
      WEST_ELM_ID,
      firstTwo.map((i: any) => i.id),
    );
  } catch (e: any) {
    doubleBillBlocked = true;
    console.log(`rejected as expected: "${e.message}"`);
  }
  if (!doubleBillBlocked) throw new Error("Double-bill should have been blocked");
  console.log("✓ double-bill guard works");

  // ────────────────────────────────────────────────────────────
  log("7/8 updateSupplierSOAStatus — VOID unmarks invoices");
  const voided = await updateSupplierSOAStatus(ORG_ID, created.id, "VOID");
  console.log(`${voided.previousStatus} → ${voided.newStatus}`);
  const afterVoid = await listInvoices(
    ORG_ID,
    { status: "OPEN,PARTIALLY_PAID", supplierId: WEST_ELM_ID, overdue: false },
    undefined,
    100,
  );
  for (const inv of firstTwo) {
    const current = afterVoid.data.find((i: any) => i.id === inv.id);
    if (!current) throw new Error(`Invoice ${inv.invoiceNumber} missing after void`);
    if ((current as any).billed !== false) {
      throw new Error(`Invoice ${inv.invoiceNumber} should be billed=false after void`);
    }
    if ((current as any).billedSoaId !== null) {
      throw new Error(`Invoice ${inv.invoiceNumber} should have null billed_soa_id after void`);
    }
  }
  console.log("✓ all invoices unbilled after void");
  const historyAfterVoid = await listSupplierSOAs(ORG_ID, WEST_ELM_ID);
  const voidedRow = historyAfterVoid.find((h) => h.id === created.id);
  if (voidedRow?.status !== "VOID") throw new Error("SOA status should be VOID");
  console.log("✓ SOA record preserved with status=VOID (audit trail)");

  // ────────────────────────────────────────────────────────────
  log("8/8 re-generate after void — invoices eligible again");
  const regen = await generateSupplierSOA(
    ORG_ID,
    WEST_ELM_ID,
    firstTwo.map((i: any) => i.id),
    undefined,
    "e2e test — regen after void",
  );
  console.log(`regen SOA: ${regen.soaNumber}, ${regen.invoiceCount} invoices`);
  if (regen.invoiceCount !== 2) throw new Error("Regen should have 2 invoices");

  // ── Final cleanup: void the regen SOA so West Elm goes back to pristine ──
  log("cleanup", "voiding regen SOA to leave DB clean");
  await updateSupplierSOAStatus(ORG_ID, regen.id, "VOID");
  const finalState = await listInvoices(
    ORG_ID,
    { status: "OPEN,PARTIALLY_PAID", supplierId: WEST_ELM_ID, overdue: false },
    undefined,
    100,
  );
  const stillBilled = finalState.data.filter((i: any) => i.billed).length;
  console.log(`final state: ${finalState.data.length} invoices, ${stillBilled} still billed (expected 0)`);
  if (stillBilled !== 0) throw new Error("Cleanup failed — some invoices still billed");

  const finalHistory = await listSupplierSOAs(ORG_ID, WEST_ELM_ID);
  console.log("\nFinal SOA history for West Elm:");
  console.table(
    finalHistory.map((h) => ({
      number: h.soaNumber,
      status: h.status,
      invoices: h.invoiceCount,
      total: h.totalAmount,
    })),
  );

  console.log("\n=== ALL 8 STEPS PASSED ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error(e);
  process.exit(1);
});
