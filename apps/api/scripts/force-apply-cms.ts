/**
 * Force-apply 4 credit memos to 2 existing SOAs (Fajardo, Don).
 *
 *   SOA-2026-0072 (Jul 1 – Aug 31)  ← CM-3591 (₱700) + CM-3593 (₱750)
 *   SOA-2026-0070 (Oct 1 – Nov 30)  ← CM-3018 (₱1,200) + CM-3019 (₱2,750)
 *
 * Reconciliation context: both target SOAs already have total_credits and
 * transaction_count that include these CMs — only the soa_line_items rows
 * are missing. This script fixes the gap WITHOUT touching any totals
 * (that would double-count). It also sets billed_soa_id on each CM so the
 * reprint-by-soaId endpoint can find them.
 *
 * Hard-guarded to the 2 SOA numbers and 4 CM reference numbers. All writes
 * in a single transaction. Dry-run by default.
 *
 * Run:
 *   Dry run:  npx tsx apps/api/scripts/force-apply-cms.ts
 *   Apply:    npx tsx apps/api/scripts/force-apply-cms.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

import { db } from "@apex/database";
import { sql } from "drizzle-orm";

const APPLY = process.argv.includes("--apply");

interface Mapping {
  soaNumber: string;
  cms: string[];
}

const PLAN: Mapping[] = [
  { soaNumber: "SOA-2026-0072", cms: ["CM-3591", "CM-3593"] },
  { soaNumber: "SOA-2026-0070", cms: ["CM-3018", "CM-3019"] },
];

async function main() {
  console.log(`=== Force-apply credit memos (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  // ── Resolve SOAs ──
  const soaRows = (await db.execute(sql`
    SELECT id, soa_number, customer_id, status,
           total_credits::text, total_payable::text, transaction_count
    FROM soa_records
    WHERE soa_number IN ('SOA-2026-0070','SOA-2026-0072')
  `)) as any[];
  const soaByNumber = new Map<string, any>(soaRows.map((r: any) => [r.soa_number, r]));
  for (const m of PLAN) {
    if (!soaByNumber.has(m.soaNumber)) {
      console.error(`ABORT: ${m.soaNumber} not found`);
      process.exit(1);
    }
    const s = soaByNumber.get(m.soaNumber);
    if (s.status === "VOID") {
      console.error(`ABORT: ${m.soaNumber} is VOID — cannot modify line items`);
      process.exit(1);
    }
  }

  // ── Resolve CMs ──
  const cmRows = (await db.execute(sql`
    SELECT id, reference_number, type, amount::text, billed,
           billed_soa_id, customer_id
    FROM customer_transactions
    WHERE reference_number IN ('CM-3591','CM-3593','CM-3018','CM-3019')
  `)) as any[];
  const cmByRef = new Map<string, any>(cmRows.map((r: any) => [r.reference_number, r]));

  const allCmRefs = PLAN.flatMap((m) => m.cms);
  for (const ref of allCmRefs) {
    const cm = cmByRef.get(ref);
    if (!cm) {
      console.error(`ABORT: credit memo ${ref} not found`);
      process.exit(1);
    }
    if (cm.type !== "CREDIT_NOTE") {
      console.error(`ABORT: ${ref} has type=${cm.type}, expected CREDIT_NOTE`);
      process.exit(1);
    }
  }

  // ── Customer ownership guard ──
  for (const m of PLAN) {
    const soa = soaByNumber.get(m.soaNumber);
    for (const ref of m.cms) {
      const cm = cmByRef.get(ref);
      if (cm.customer_id !== soa.customer_id) {
        console.error(
          `ABORT: ${ref} belongs to customer ${cm.customer_id} but ${m.soaNumber} ` +
            `belongs to ${soa.customer_id}. CANNOT apply cross-customer.`,
        );
        process.exit(1);
      }
    }
  }
  console.log("customer ownership guard: PASSED\n");

  // ── Duplicate-line-item guard ──
  const dups = (await db.execute(sql`
    SELECT sli.soa_id, sr.soa_number, ct.reference_number
    FROM soa_line_items sli
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    JOIN soa_records sr ON sr.id = sli.soa_id
    WHERE ct.reference_number IN ('CM-3591','CM-3593','CM-3018','CM-3019')
  `)) as any[];
  if (dups.length > 0) {
    console.error("ABORT: one or more CMs already exist in soa_line_items:");
    console.table(dups);
    process.exit(1);
  }

  // ── Already-billed guard ──
  const alreadyBilled = allCmRefs
    .map((r) => cmByRef.get(r))
    .filter((cm: any) => cm.billed === true || cm.billed_soa_id !== null);
  if (alreadyBilled.length > 0) {
    console.error("ABORT: one or more CMs are already marked billed or have a billed_soa_id:");
    console.table(
      alreadyBilled.map((cm: any) => ({
        ref: cm.reference_number,
        billed: cm.billed,
        billed_soa_id: cm.billed_soa_id,
      })),
    );
    process.exit(1);
  }
  console.log("duplicate / already-billed guards: PASSED\n");

  // ── Present plan ──
  console.log("Plan:");
  for (const m of PLAN) {
    const soa = soaByNumber.get(m.soaNumber);
    const cmTotal = m.cms
      .map((r) => parseFloat(cmByRef.get(r).amount))
      .reduce((a, b) => a + b, 0);
    const storedCredits = parseFloat(soa.total_credits);
    const reconciles = Math.abs(storedCredits - cmTotal) < 0.005;
    console.log(
      `  ${m.soaNumber}  (${soa.status})  stored total_credits=${storedCredits.toFixed(2)}  ` +
        `CMs sum=${cmTotal.toFixed(2)}  reconciles=${reconciles}`,
    );
    for (const ref of m.cms) {
      const cm = cmByRef.get(ref);
      console.log(`    \u2192 insert line_item  ${ref}  (${cm.id})  amount=${cm.amount}`);
    }
  }
  console.log("");

  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to execute.");
    process.exit(0);
  }

  // ── Apply in a single transaction ──
  console.log("Applying in a single transaction...");
  const result = await db.transaction(async (tx) => {
    let insertedLines = 0;
    let updatedCms = 0;

    for (const m of PLAN) {
      const soa = soaByNumber.get(m.soaNumber);
      for (const ref of m.cms) {
        const cm = cmByRef.get(ref);

        // 1. Insert soa_line_item  (unique constraint guards against double-run)
        await tx.execute(sql`
          INSERT INTO soa_line_items (soa_id, transaction_id)
          VALUES (${soa.id}, ${cm.id})
        `);
        insertedLines++;

        // 2. Mark CM billed + set billed_soa_id so the reprint-by-soaId
        //    endpoint correctly associates it with this SOA.
        await tx.execute(sql`
          UPDATE customer_transactions
          SET billed = true, billed_soa_id = ${soa.id}
          WHERE id = ${cm.id}
        `);
        updatedCms++;
      }
    }

    // 3. Post-apply sanity: line_items count must equal transaction_count
    for (const m of PLAN) {
      const soa = soaByNumber.get(m.soaNumber);
      const [cnt] = (await tx.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM soa_line_items WHERE soa_id = ${soa.id}
      `)) as any[];
      if (cnt.n !== soa.transaction_count) {
        throw new Error(
          `Sanity check failed for ${m.soaNumber}: line_items=${cnt.n} ` +
            `vs transaction_count=${soa.transaction_count}`,
        );
      }
    }

    return { insertedLines, updatedCms };
  });

  console.log("APPLIED:", result);

  // ── Spec verification query (verbatim from user) ──
  console.log("\n=== Verification (user spec query) ===");
  const verify = (await db.execute(sql`
    SELECT sh.soa_number, ct.reference_number, ct.amount::text, ct.billed,
           ct.billed_soa_id
    FROM soa_line_items sli
    JOIN soa_records sh ON sh.id = sli.soa_id
    JOIN customer_transactions ct ON ct.id = sli.transaction_id
    WHERE ct.reference_number IN ('CM-3591','CM-3593','CM-3018','CM-3019')
    ORDER BY sh.soa_number, ct.reference_number
  `)) as any[];
  console.table(verify);

  // ── Post-apply line_item counts ──
  const counts = (await db.execute(sql`
    SELECT sr.soa_number, sr.transaction_count,
           COUNT(sli.id)::int AS line_items_after
    FROM soa_records sr
    LEFT JOIN soa_line_items sli ON sli.soa_id = sr.id
    WHERE sr.soa_number IN ('SOA-2026-0070','SOA-2026-0072')
    GROUP BY sr.soa_number, sr.transaction_count
    ORDER BY sr.soa_number
  `)) as any[];
  console.log("\nLine-items count after apply (should equal transaction_count):");
  console.table(counts);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
