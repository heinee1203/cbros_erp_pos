/**
 * End-to-end verification of the upsertDailySales service.
 * Picks an unused future-but-valid date, inserts, edits, then deletes
 * the test row so the live DB returns to its original state.
 *
 * Steps:
 *   1. Choose a test date that has no existing data (today, 2026-04-11)
 *   2. INSERT via upsertDailySales
 *   3. Verify single-day matches what we sent
 *   4. UPSERT again with different values
 *   5. Verify single-day reflects the update (not a duplicate row)
 *   6. Confirm source='MANUAL' and recorded_by is set
 *   7. Cleanup: DELETE the test row (this is the only test that mutates
 *      the daily_sales_summary table outside the import path)
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import {
  upsertDailySales,
  getDailySalesSingleDay,
} from "../src/modules/analytics/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const TEST_DATE = "2026-04-11"; // today; no existing data per earlier checks
const ADMIN_USER_ID = "7de24d98-556f-4a8e-a8ec-00802ff01580"; // admin@apex.com

async function main() {
  console.log("=== upsertDailySales smoke test ===\n");

  // Sanity: ensure the test date is empty before we touch it
  const before = await getDailySalesSingleDay(ORG_ID, TEST_DATE);
  if (before.hasData) {
    console.error(`ABORT: ${TEST_DATE} already has data — pick a different test date`);
    process.exit(1);
  }
  console.log(`[1/7] ${TEST_DATE} confirmed empty — safe to test`);

  // ── Step 2: INSERT ──
  console.log("\n[2/7] INSERT initial values");
  const insertInput = {
    apOldSales: 12345.67,
    apNewSales: 89012.34,
    apOnAccount: 1500,
    acSales: 9876.5,
    acOnAccount: 250,
    serviceSales: 45678.9,
    serviceOnAccount: 10000,
    paintingSales: 3500,
    paintingOnAccount: 0,
    juniorSales: 22000,
    payments: 0,
    notes: "smoke test — initial insert",
  };
  const inserted = await upsertDailySales(ORG_ID, TEST_DATE, insertInput, ADMIN_USER_ID);
  console.log(`  inserted: ${inserted.totals.grandTotal.toFixed(2)} grand total`);

  // ── Step 3: Verify INSERT shape ──
  console.log("\n[3/7] Verify INSERT result matches input");
  const expectedGrand =
    insertInput.apOldSales + insertInput.apNewSales + insertInput.apOnAccount +
    insertInput.acSales + insertInput.acOnAccount +
    insertInput.serviceSales + insertInput.serviceOnAccount +
    insertInput.paintingSales + insertInput.paintingOnAccount +
    insertInput.juniorSales;
  if (Math.abs(inserted.totals.grandTotal - expectedGrand) > 0.01) {
    throw new Error(`grand total mismatch: ${inserted.totals.grandTotal} vs ${expectedGrand}`);
  }
  console.log(`  ✓ grand total: ${inserted.totals.grandTotal} === ${expectedGrand}`);
  if (Math.abs(inserted.ap.old - insertInput.apOldSales) > 0.01) throw new Error("ap.old mismatch");
  if (Math.abs(inserted.ap.new - insertInput.apNewSales) > 0.01) throw new Error("ap.new mismatch");
  if (Math.abs(inserted.junior.cash - insertInput.juniorSales) > 0.01) throw new Error("junior mismatch");
  console.log(`  ✓ all division values match input`);

  // Verify source + recorded_by directly
  const [meta] = (await db.execute(sql`
    SELECT source, recorded_by, notes
    FROM daily_sales_summary
    WHERE org_id = ${ORG_ID} AND date = ${TEST_DATE}::date
  `)) as any[];
  console.log(`  source: ${meta.source}  recorded_by: ${meta.recorded_by}  notes: "${meta.notes}"`);
  if (meta.source !== "MANUAL") throw new Error("source should be MANUAL");
  if (meta.recorded_by !== ADMIN_USER_ID) throw new Error("recorded_by mismatch");

  // ── Step 4: UPDATE via re-upsert ──
  console.log("\n[4/7] UPSERT again with different values (update path)");
  const updateInput = {
    apOldSales: 99999.99,
    apNewSales: 111111.11,
    apOnAccount: 0,
    acSales: 0,
    acOnAccount: 0,
    serviceSales: 0,
    serviceOnAccount: 0,
    paintingSales: 0,
    paintingOnAccount: 0,
    juniorSales: 0,
    payments: 50000,
    notes: "smoke test — updated values",
  };
  const updated = await upsertDailySales(ORG_ID, TEST_DATE, updateInput, ADMIN_USER_ID);

  // ── Step 5: Verify UPDATE replaced (not appended) ──
  console.log("\n[5/7] Verify update replaced the row, didn't duplicate");
  const [{ row_count }] = (await db.execute(sql`
    SELECT COUNT(*)::int AS row_count
    FROM daily_sales_summary
    WHERE org_id = ${ORG_ID} AND date = ${TEST_DATE}::date
  `)) as any[];
  if (row_count !== 1) {
    throw new Error(`expected 1 row after upsert, got ${row_count}`);
  }
  console.log(`  ✓ exactly 1 row in DB for ${TEST_DATE}`);
  const expectedNewGrand =
    updateInput.apOldSales + updateInput.apNewSales;
  if (Math.abs(updated.totals.grandTotal - expectedNewGrand) > 0.01) {
    throw new Error(`updated grand total mismatch: ${updated.totals.grandTotal} vs ${expectedNewGrand}`);
  }
  console.log(`  ✓ grand total updated: ${updated.totals.grandTotal} === ${expectedNewGrand}`);
  if (updated.totals.payments !== 50000) {
    throw new Error(`payments not updated: ${updated.totals.payments}`);
  }
  console.log(`  ✓ payments updated to ${updated.totals.payments}`);

  // ── Step 6: Negative value rejection ──
  console.log("\n[6/7] Reject negative values");
  let rejected = false;
  try {
    await upsertDailySales(ORG_ID, TEST_DATE, { apOldSales: -100 }, ADMIN_USER_ID);
  } catch (e: any) {
    rejected = true;
    console.log(`  ✓ rejected with: "${e.message}"`);
  }
  if (!rejected) throw new Error("negative value should have been rejected");

  // ── Step 7: Cleanup ──
  console.log("\n[7/7] Cleanup — delete test row");
  await db.execute(sql`
    DELETE FROM daily_sales_summary
    WHERE org_id = ${ORG_ID} AND date = ${TEST_DATE}::date
  `);
  const after = await getDailySalesSingleDay(ORG_ID, TEST_DATE);
  if (after.hasData) throw new Error("cleanup failed — row still present");
  console.log(`  ✓ test row deleted, ${TEST_DATE} back to empty`);

  console.log("\n=== ALL 7 STEPS PASSED ===");
  process.exit(0);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  console.error(e);
  process.exit(1);
});
