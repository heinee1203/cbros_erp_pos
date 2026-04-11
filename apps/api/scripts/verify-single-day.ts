/**
 * Smoke-test the new getDailySalesSingleDay service.
 * Hits a few real days + a no-data future day and prints the shape.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { getDailySalesSingleDay } from "../src/modules/analytics/service";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

async function main() {
  console.log("=== single-day smoke test ===\n");

  const dates = [
    "2026-02-28", // heavy day with cash + credit + payments
    "2025-12-27", // best-day-ever from earlier verification
    "2026-03-31", // last day of the new March import
    "2026-03-01", // partial day (only Junior=29717)
    "2026-04-15", // future date — no data, should return hasData=false
  ];

  for (const d of dates) {
    const r = await getDailySalesSingleDay(ORG_ID, d);
    console.log(`\n── ${d} (${r.dayOfWeek})  hasData=${r.hasData}`);
    if (!r.hasData) continue;
    const fmt = (n: number) =>
      n.toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    console.log(`  A/P:      ${fmt(r.ap.total).padStart(13)}   ${r.percentages.ap.toFixed(1)}%`);
    console.log(`     OLD:   ${fmt(r.ap.old).padStart(13)}   ${r.ap.oldRatio != null ? "(" + r.ap.oldRatio.toFixed(2) + ")" : ""}`);
    console.log(`     NEW:   ${fmt(r.ap.new).padStart(13)}   ${r.ap.newRatio != null ? "(" + r.ap.newRatio.toFixed(2) + ")" : ""}`);
    console.log(`     ACCT:  ${fmt(r.ap.onAccount).padStart(13)}`);
    console.log(`  A/C:      ${fmt(r.ac.total).padStart(13)}   ${r.percentages.ac.toFixed(1)}%`);
    console.log(`     CASH:  ${fmt(r.ac.cash).padStart(13)}`);
    console.log(`     ACCT:  ${fmt(r.ac.onAccount).padStart(13)}`);
    console.log(`  SERVICE:  ${fmt(r.service.total).padStart(13)}   ${r.percentages.service.toFixed(1)}%`);
    console.log(`     CASH:  ${fmt(r.service.cash).padStart(13)}`);
    console.log(`     ACCT:  ${fmt(r.service.onAccount).padStart(13)}`);
    console.log(`  PAINTING: ${fmt(r.painting.total).padStart(13)}   ${r.percentages.painting.toFixed(1)}%`);
    console.log(`  JUNIOR:   ${fmt(r.junior.total).padStart(13)}   ${r.percentages.junior.toFixed(1)}%`);
    console.log(`  ─────────────────────────────`);
    console.log(`  CASH:     ${fmt(r.totals.cash).padStart(13)}`);
    console.log(`  ON ACCT:  ${fmt(r.totals.onAccount).padStart(13)}`);
    console.log(`  GRAND:    ${fmt(r.totals.grandTotal).padStart(13)}`);
    console.log(`  PAYMENTS: ${fmt(r.totals.payments).padStart(13)}`);
    // Reconciliation: percentages should sum to ~100
    const sumPct =
      r.percentages.ap + r.percentages.ac + r.percentages.service +
      r.percentages.painting + r.percentages.junior;
    console.log(`  ↳ percentage sum check: ${sumPct.toFixed(2)}%  ${Math.abs(sumPct - 100) < 0.01 ? "\u2713" : "\u2717"}`);
    if (Math.abs(sumPct - 100) > 0.01) throw new Error(`percentages don't sum to 100 for ${d}`);
  }

  console.log("\n=== ALL CHECKS PASSED ===");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
