/**
 * Bulk-add 108 customer CHARGE transactions (credit sales) for 2026-03-03 → 2026-04-16.
 * Run: npx tsx apps/api/scripts/add-apr2026-batch.ts
 *
 * Groups rows by customer, matches via ILIKE (auto-creates if missing),
 * skips any reference_number that already exists for that customer,
 * then recomputes running balance + customer totals per affected customer.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { customers, customerTransactions } from "@apex/database/schema";
import { eq, and, sql, asc, ilike } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";

type Row = { date: string; customer: string; ref: string; amount: string };

const ROWS: Row[] = [
  { date: "2026-03-04", customer: "DY, MILTON", ref: "Q3637", amount: "9470.00" },
  { date: "2026-03-03", customer: "CBS", ref: "Q3636", amount: "11380.00" },
  { date: "2026-03-04", customer: "OSCAR REYES TRUCKING", ref: "Q3638", amount: "1800.00" },
  { date: "2026-03-04", customer: "BODEGA GLASSWARE", ref: "Q3644", amount: "23425.00" },
  { date: "2026-04-10", customer: "CBS", ref: "Q3899", amount: "2250.00" },
  { date: "2026-04-10", customer: "VGDC CONSTRUCTION SUPPLY", ref: "Q3897", amount: "880.00" },
  { date: "2026-04-10", customer: "GN AUTO SHOP", ref: "Q3898", amount: "850.00" },
  { date: "2026-04-10", customer: "PHILWORKS CONSTRUCTION", ref: "Q4012", amount: "10000.00" },
  { date: "2026-04-10", customer: "STANCE SALES", ref: "Q3896", amount: "160.00" },
  { date: "2026-04-10", customer: "LASS AUTOMOTIVE", ref: "Q3931", amount: "7200.00" },
  { date: "2026-04-10", customer: "STANCE SALES", ref: "Q3932", amount: "2650.00" },
  { date: "2026-04-11", customer: "PASIA, KENNETH", ref: "Q3957", amount: "2000.00" },
  { date: "2026-04-14", customer: "CBS", ref: "Q4014", amount: "12400.00" },
  { date: "2026-04-14", customer: "LGU - OCAMPO", ref: "Q4013", amount: "16400.00" },
  { date: "2026-04-07", customer: "VILLA CACERES HOTEL", ref: "Q4005", amount: "1330.00" },
  { date: "2026-04-07", customer: "LEJAN TRUCK PARTS", ref: "Q3892", amount: "550.00" },
  { date: "2026-04-07", customer: "PHILWORKS CONSTRUCTION", ref: "Q3921", amount: "2150.00" },
  { date: "2026-04-07", customer: "GN AUTO SHOP", ref: "Q3922", amount: "565.00" },
  { date: "2026-04-07", customer: "RRFJ MARKETING", ref: "Q3923", amount: "3795.00" },
  { date: "2026-04-07", customer: "LASS AUTOMOTIVE", ref: "Q3924", amount: "3400.00" },
  { date: "2026-04-07", customer: "RRFJ MARKETING", ref: "Q3890", amount: "2860.00" },
  { date: "2026-04-07", customer: "CBS", ref: "Q3891", amount: "12500.00" },
  { date: "2026-04-06", customer: "3N BAKERY", ref: "Q4002", amount: "28000.00" },
  { date: "2026-04-09", customer: "3N BAKERY", ref: "Q3895", amount: "2400.00" },
  { date: "2026-04-09", customer: "APIAK AUTO PARTS", ref: "Q3894", amount: "3800.00" },
  { date: "2026-04-09", customer: "DY, ALAIN DAVE", ref: "Q3930", amount: "5876.67" },
  { date: "2026-04-06", customer: "OSCAR REYES TRUCKING", ref: "Q3888", amount: "1000.00" },
  { date: "2026-04-06", customer: "DY, MILTON", ref: "Q3887", amount: "350.00" },
  { date: "2026-04-06", customer: "STRETCH DISTRIBUTION, INC", ref: "Q3920", amount: "3700.00" },
  { date: "2026-04-06", customer: "DIARCCO CORP", ref: "Q3919", amount: "3700.00" },
  { date: "2026-04-06", customer: "3N BAKERY", ref: "Q3889", amount: "18500.00" },
  { date: "2026-04-06", customer: "NVS & SONS CORP", ref: "Q3917", amount: "650.00" },
  { date: "2026-04-06", customer: "NVS & SONS CORP", ref: "Q3918", amount: "110.00" },
  { date: "2026-04-06", customer: "FIVE STAREX COMMERCIAL", ref: "Q3600", amount: "1530.00" },
  { date: "2026-04-08", customer: "DIARCCO CORP", ref: "Q3927", amount: "3300.00" },
  { date: "2026-04-08", customer: "DIARCCO CORP", ref: "Q3926", amount: "650.00" },
  { date: "2026-04-08", customer: "DY, MILTON", ref: "Q3893", amount: "250.00" },
  { date: "2026-04-08", customer: "MESCO", ref: "Q3925", amount: "2960.00" },
  { date: "2026-04-02", customer: "TALYER - PAYROLL", ref: "Q2492", amount: "23402.50" },
  { date: "2026-04-08", customer: "RT MONTANA", ref: "Q3929", amount: "540.00" },
  { date: "2026-04-08", customer: "LUCKY SE7EN, INC", ref: "Q3928", amount: "3900.00" },
  { date: "2026-04-02", customer: "CBS", ref: "Q3916", amount: "2400.00" },
  { date: "2026-04-02", customer: "DIARCCO CORP", ref: "Q3915", amount: "350.00" },
  { date: "2026-04-01", customer: "GO, MAYOR ALLAN", ref: "Q3598", amount: "24650.00" },
  { date: "2026-04-01", customer: "CABRAL, ARTHUR", ref: "Q3135", amount: "33270.00" },
  { date: "2026-03-30", customer: "APIAK AUTO PARTS", ref: "Q3806", amount: "1450.00" },
  { date: "2026-04-01", customer: "DY, HUBERT", ref: "Q3954", amount: "11500.00" },
  { date: "2026-04-01", customer: "CABRAL, ARTHUR", ref: "Q3952", amount: "8450.00" },
  { date: "2026-03-30", customer: "CABRAL, ERIC", ref: "Q3595", amount: "30515.00" },
  { date: "2026-03-31", customer: "CBS", ref: "Q3597", amount: "19600.00" },
  { date: "2026-03-31", customer: "VGDC CONSTRUCTION SUPPLY", ref: "Q3596", amount: "5560.00" },
  { date: "2026-04-01", customer: "CABRAL, ARTHUR", ref: "Q3569", amount: "13615.00" },
  { date: "2026-04-01", customer: "CABRAL, ARTHUR", ref: "Q3380", amount: "40215.00" },
  { date: "2026-04-01", customer: "CABRAL, ARTHUR", ref: "Q3951", amount: "185000.00" },
  { date: "2026-04-01", customer: "STANCE SALES", ref: "Q3914", amount: "2965.00" },
  { date: "2026-04-01", customer: "LUCKY SE7EN, INC", ref: "Q3913", amount: "1140.00" },
  { date: "2026-04-01", customer: "GN AUTO SHOP", ref: "Q3912", amount: "3036.00" },
  { date: "2026-04-01", customer: "JT TANDEM", ref: "Q3911", amount: "4500.00" },
  { date: "2026-04-09", customer: "PASIA, KENNETH", ref: "Q4051", amount: "10000.00" },
  { date: "2026-04-02", customer: "PASIA, KENNETH", ref: "Q3599", amount: "110070.00" },
  { date: "2026-04-08", customer: "TALYER - EXPENSES", ref: "Q3956", amount: "250.00" },
  { date: "2026-04-07", customer: "STANCE SALES", ref: "Q4006", amount: "235.00" },
  { date: "2026-04-08", customer: "LGU - OCAMPO", ref: "Q4009", amount: "2750.00" },
  { date: "2026-04-06", customer: "FIVE STAREX COMMERCIAL", ref: "Q4003", amount: "1265.00" },
  { date: "2026-04-14", customer: "JT TANDEM", ref: "Q3810", amount: "500.00" },
  { date: "2026-04-15", customer: "LUCKY SE7EN, INC", ref: "Q4113", amount: "150.00" },
  { date: "2026-04-14", customer: "STRETCH DISTRIBUTION, INC", ref: "Q4108", amount: "5440.00" },
  { date: "2026-04-14", customer: "PHILWORKS CONSTRUCTION", ref: "Q3934", amount: "650.00" },
  { date: "2026-04-14", customer: "PHILWORKS CONSTRUCTION", ref: "Q3939", amount: "8050.00" },
  { date: "2026-04-14", customer: "APIAK AUTO PARTS", ref: "Q4109", amount: "1710.00" },
  { date: "2026-04-14", customer: "LASS AUTOMOTIVE", ref: "Q4110", amount: "450.00" },
  { date: "2026-04-14", customer: "CBS", ref: "Q4111", amount: "3900.00" },
  { date: "2026-04-14", customer: "GN AUTO SHOP", ref: "Q3940", amount: "1465.00" },
  { date: "2026-04-14", customer: "LASS AUTOMOTIVE", ref: "Q3941", amount: "4400.00" },
  { date: "2026-04-14", customer: "AZAÑA, DON", ref: "Q3942", amount: "500.00" },
  { date: "2026-04-14", customer: "PRINCETON MARKETING", ref: "Q4112", amount: "1060.00" },
  { date: "2026-04-15", customer: "CBS", ref: "Q4115", amount: "2400.00" },
  { date: "2026-04-15", customer: "CBS", ref: "Q4114", amount: "3550.00" },
  { date: "2026-04-11", customer: "PHILWORKS CONSTRUCTION", ref: "Q3900", amount: "4650.00" },
  { date: "2026-04-11", customer: "LASS AUTOMOTIVE", ref: "Q3933", amount: "2800.00" },
  { date: "2026-04-13", customer: "JT TANDEM", ref: "Q3809", amount: "245.00" },
  { date: "2026-04-13", customer: "JT TANDEM", ref: "Q3808", amount: "480.00" },
  { date: "2026-04-11", customer: "DIARCCO CORP", ref: "Q4102", amount: "9510.00" },
  { date: "2026-04-13", customer: "LUCKY SE7EN, INC", ref: "Q4104", amount: "1900.00" },
  { date: "2026-04-11", customer: "DIARCCO CORP", ref: "Q3935", amount: "3775.00" },
  { date: "2026-04-13", customer: "OSCAR REYES TRUCKING", ref: "Q4107", amount: "750.00" },
  { date: "2026-04-13", customer: "JT TANDEM", ref: "Q3938", amount: "1950.00" },
  { date: "2026-04-13", customer: "LASS AUTOMOTIVE", ref: "Q3936", amount: "35550.00" },
  { date: "2026-04-13", customer: "CBS", ref: "Q4106", amount: "34145.00" },
  { date: "2026-04-13", customer: "FLO MARKETING", ref: "Q4105", amount: "4700.00" },
  { date: "2026-04-13", customer: "LASS AUTOMOTIVE", ref: "Q4103", amount: "4500.00" },
  { date: "2026-04-11", customer: "TALYER - PAYROLL", ref: "Q2494", amount: "26100.00" },
  { date: "2026-04-11", customer: "ARAGON, ANTHONY", ref: "Q3937", amount: "3939.00" },
  { date: "2026-04-11", customer: "RRFJ MARKETING", ref: "Q4101", amount: "4655.00" },
  { date: "2026-04-15", customer: "FIVE STAREX COMMERCIAL", ref: "Q4017", amount: "1350.00" },
  { date: "2026-04-15", customer: "DEPED - NAGA", ref: "Q4016", amount: "57300.00" },
  { date: "2026-04-15", customer: "DEPED - NAGA", ref: "Q4015", amount: "14950.00" },
  { date: "2026-04-06", customer: "CABRAL, ARTHUR", ref: "Q4004", amount: "4825.00" },
  { date: "2026-04-16", customer: "STANCE SALES", ref: "Q3943", amount: "650.00" },
  { date: "2026-04-16", customer: "PHILWORKS CONSTRUCTION", ref: "Q4116", amount: "5325.00" },
  { date: "2026-04-16", customer: "E.GARCIA CONSTRUCTION", ref: "Q4117", amount: "900.00" },
  { date: "2026-04-16", customer: "STRETCH DISTRIBUTION, INC", ref: "Q4118", amount: "1800.00" },
  { date: "2026-04-16", customer: "CBS", ref: "Q3944", amount: "525.00" },
  { date: "2026-04-16", customer: "LASS AUTOMOTIVE", ref: "Q3945", amount: "15110.00" },
  { date: "2026-04-16", customer: "STANCE SALES", ref: "Q3946", amount: "2050.00" },
  { date: "2026-04-16", customer: "PHILWORKS CONSTRUCTION", ref: "Q4119", amount: "3450.00" },
  { date: "2026-04-16", customer: "OSCAR REYES TRUCKING", ref: "Q3947", amount: "500.00" },
  { date: "2026-04-16", customer: "PRIME DIGITAL PRINT CENTER", ref: "Q0862", amount: "26200.00" },
];

// ILIKE substring pattern used to find each customer. Kept tight enough to
// disambiguate look-alikes (DY, MILTON vs DY, ALAIN DAVE vs DY, HUBERT;
// CABRAL, ARTHUR vs CABRAL, ERIC; 3N BAKERY vs anything else).
const PATTERNS: Record<string, string> = {
  "DY, MILTON": "%dy, milton%",
  "DY, ALAIN DAVE": "%dy, alain%",
  "DY, HUBERT": "%dy, hubert%",
  "CBS": "cbs",
  "OSCAR REYES TRUCKING": "%oscar reyes%",
  "BODEGA GLASSWARE": "%bodega glass%",
  "VGDC CONSTRUCTION SUPPLY": "%vgdc%",
  "GN AUTO SHOP": "%gn auto%",
  "PHILWORKS CONSTRUCTION": "%philworks%",
  "STANCE SALES": "%stance sales%",
  "LASS AUTOMOTIVE": "%lass automotive%",
  "PASIA, KENNETH": "%pasia, kenneth%",
  "LGU - OCAMPO": "%lgu - ocampo%",
  "VILLA CACERES HOTEL": "%villa caceres%",
  "LEJAN TRUCK PARTS": "%lejan%",
  "RRFJ MARKETING": "%rrfj%",
  "3N BAKERY": "%3n bakery%",
  "APIAK AUTO PARTS": "%apiak%",
  "STRETCH DISTRIBUTION, INC": "%stretch distribution%",
  "DIARCCO CORP": "%diarcco%",
  "NVS & SONS CORP": "%nvs%sons%",
  "FIVE STAREX COMMERCIAL": "%five starex%",
  "MESCO": "mesco",
  "RT MONTANA": "%rt montana%",
  "LUCKY SE7EN, INC": "%lucky se7en%",
  "TALYER - PAYROLL": "%talyer - payroll%",
  "TALYER - EXPENSES": "%talyer - expenses%",
  "GO, MAYOR ALLAN": "%mayor allan%",
  "CABRAL, ARTHUR": "%cabral, arthur%",
  "CABRAL, ERIC": "%cabral, eric%",
  "JT TANDEM": "%jt tandem%",
  "PRINCETON MARKETING": "%princeton%",
  "AZAÑA, DON": "%aza%, don%",
  "DEPED - NAGA": "%deped - naga%",
  "E.GARCIA CONSTRUCTION": "%e.garcia%",
  "ARAGON, ANTHONY": "%aragon, anthony%",
  "FLO MARKETING": "%flo marketing%",
  "PRIME DIGITAL PRINT CENTER": "%prime digital%",
};

function patternFor(name: string): string {
  return PATTERNS[name] ?? `%${name.toLowerCase()}%`;
}

function phonePlaceholder(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 40);
  return `AR-${cleaned || "UNKNOWN"}`;
}

async function processCustomer(name: string, rows: Row[]) {
  const pattern = patternFor(name);
  let [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(and(eq(customers.orgId, ORG_ID), ilike(customers.name, pattern)))
    .limit(1);

  let status: "matched" | "created" = "matched";
  if (!customer) {
    const [created] = await db
      .insert(customers)
      .values({
        orgId: ORG_ID,
        name,
        phone: phonePlaceholder(name),
        customerType: "SHOP",
        currentBalance: "0",
        totalPurchases: "0",
        isActive: true,
      })
      .returning({ id: customers.id, name: customers.name });
    customer = created;
    status = "created";
    console.log(`  CREATED: ${customer.name}`);
  } else {
    console.log(`  Matched: "${name}" -> "${customer.name}" (${customer.id})`);
  }

  const refs = rows.map((r) => r.ref);
  const existing = (await db.execute(
    sql`SELECT reference_number FROM customer_transactions WHERE customer_id = ${customer.id} AND reference_number IN (${sql.join(
      refs.map((r) => sql`${r}`),
      sql`,`,
    )})`,
  )) as any[];
  const existingRefs = new Set(existing.map((r: any) => r.reference_number));

  let inserted = 0;
  let skipped = 0;
  for (const row of rows) {
    if (existingRefs.has(row.ref)) {
      console.log(`    SKIP ${row.ref} (exists)`);
      skipped++;
      continue;
    }
    await db.insert(customerTransactions).values({
      orgId: ORG_ID,
      customerId: customer.id,
      type: "CHARGE",
      amount: row.amount,
      balanceAfter: "0",
      referenceType: "credit_sale",
      referenceNumber: row.ref,
      notes: "Credit Sale",
      recordedAt: new Date(row.date),
    });
    console.log(
      `    ADD  ${row.ref}  ${row.date}  ₱${parseFloat(row.amount).toLocaleString("en-PH", { minimumFractionDigits: 2 })}`,
    );
    inserted++;
  }

  if (inserted > 0) {
    const allTxns = await db
      .select({
        id: customerTransactions.id,
        amount: customerTransactions.amount,
        type: customerTransactions.type,
      })
      .from(customerTransactions)
      .where(eq(customerTransactions.customerId, customer.id))
      .orderBy(asc(customerTransactions.recordedAt), asc(customerTransactions.id));

    let running = 0;
    for (const t of allTxns) {
      const amt = parseFloat(t.amount);
      if (t.type === "CHARGE" || (t.type === "ADJUSTMENT" && amt > 0)) running += amt;
      else running -= Math.abs(amt);
      await db
        .update(customerTransactions)
        .set({ balanceAfter: running.toFixed(2) })
        .where(eq(customerTransactions.id, t.id));
    }

    const [totals] = (await db.execute(
      sql`SELECT COALESCE(SUM(amount::numeric),0) AS total FROM customer_transactions WHERE customer_id = ${customer.id} AND type = 'CHARGE'`,
    )) as any[];
    await db
      .update(customers)
      .set({
        currentBalance: running.toFixed(2),
        totalPurchases: parseFloat(totals.total).toFixed(2),
      })
      .where(eq(customers.id, customer.id));

    console.log(
      `    Recalc: ${allTxns.length} txns, balance ₱${running.toFixed(2)}, totalPurchases ₱${parseFloat(totals.total).toFixed(2)}`,
    );
  }

  return { name, resolvedName: customer.name, status, inserted, skipped };
}

async function main() {
  console.log(`=== Bulk-add ${ROWS.length} customer charges (Mar–Apr 2026) ===\n`);

  const grouped = new Map<string, Row[]>();
  for (const r of ROWS) {
    if (!grouped.has(r.customer)) grouped.set(r.customer, []);
    grouped.get(r.customer)!.push(r);
  }

  const summary: Array<{ name: string; resolvedName: string; status: string; inserted: number; skipped: number }> = [];
  for (const [name, rows] of grouped) {
    console.log(`\n--- ${name} (${rows.length} rows) ---`);
    const r = await processCustomer(name, rows);
    summary.push(r);
  }

  const totalInserted = summary.reduce((s, r) => s + r.inserted, 0);
  const totalSkipped = summary.reduce((s, r) => s + r.skipped, 0);
  const created = summary.filter((r) => r.status === "created");

  console.log(`\n=== Summary ===`);
  console.log(`Customers processed: ${summary.length}`);
  console.log(`Customers created:   ${created.length}${created.length ? " -> " + created.map((c) => c.name).join(", ") : ""}`);
  console.log(`Rows inserted:       ${totalInserted}`);
  console.log(`Rows skipped (dup):  ${totalSkipped}`);
  console.log(`Rows total:          ${ROWS.length}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
