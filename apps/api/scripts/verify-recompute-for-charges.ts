/**
 * End-to-end verification that recomputeSOAStatusForCharges works after the
 * IN-list fix. Runs inside a transaction that is always rolled back — nothing
 * is persisted — so it's safe to run against live data.
 *
 * We exercise three real-world shapes of the input array:
 *   1. Empty array            (early return, no SQL)
 *   2. Single ID              (common case for single-invoice allocations)
 *   3. Multiple IDs (3+)      (the case that was hitting the uuid[] cast bug)
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";
import { recomputeSOAStatusForCharges } from "../src/modules/customers/service";

async function main() {
  console.log("=== Verify recomputeSOAStatusForCharges (ROLLBACK) ===\n");

  // Pull a few real charge transaction IDs that are attached to a real SOA
  const sample = (await db.execute(sql`
    SELECT DISTINCT sli.transaction_id AS id
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE ct.type = 'CHARGE'
    LIMIT 5
  `)) as any[];
  if (sample.length === 0) {
    console.error("No billed charges found — cannot run test");
    process.exit(1);
  }
  const ids = sample.map((r: any) => r.id) as string[];
  console.log(`sampled ${ids.length} real charge transaction_ids from soa_line_items`);

  try {
    await db.transaction(async (tx) => {
      console.log("\n[1/3] empty array (early return)");
      await recomputeSOAStatusForCharges(tx, "00000000-0000-0000-0000-000000000000", []);
      console.log("    \u2713 returned without error");

      console.log("\n[2/3] single ID");
      await recomputeSOAStatusForCharges(
        tx,
        "556e350a-7180-4ec9-9e1e-ea0ca1937f40",
        [ids[0]],
      );
      console.log("    \u2713 single-ID IN-list executed");

      console.log("\n[3/3] multiple IDs (the original failure mode)");
      await recomputeSOAStatusForCharges(
        tx,
        "556e350a-7180-4ec9-9e1e-ea0ca1937f40",
        ids,
      );
      console.log("    \u2713 multi-ID IN-list executed");

      // Deliberately roll back — we never want this test to mutate data
      throw new Error("__ROLLBACK_SENTINEL__");
    });
  } catch (e: any) {
    if (e.message === "__ROLLBACK_SENTINEL__") {
      console.log("\nAll three shapes passed. Transaction rolled back cleanly.");
      process.exit(0);
    }
    console.error("\nFAILED:", e.message);
    console.error(e);
    process.exit(1);
  }
}

main();
