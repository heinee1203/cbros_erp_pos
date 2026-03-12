/**
 * Backfill Script: Assign EAN-13 barcodes to all products missing one.
 *
 * Usage: npx tsx packages/database/src/backfill-barcodes.ts
 * (Run from monorepo root)
 */

import dotenv from "dotenv";
// Load .env from packages/database/.env (same as drizzle.config.ts)
dotenv.config();
// Also try monorepo root
dotenv.config({ path: "../../.env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isNull, eq, and } from "drizzle-orm";
import * as schema from "./schema/index";

const BATCH_SIZE = 500;

// ── EAN-13 generation (inline to avoid import issues) ──
function computeCheckDigit(first12: string): string {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(first12[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (sum % 10)) % 10);
}

function generateBarcode(): string {
  const prefix = "200";
  let body = "";
  for (let i = 0; i < 9; i++) {
    body += Math.floor(Math.random() * 10).toString();
  }
  const first12 = prefix + body;
  return first12 + computeCheckDigit(first12);
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  // Count products without barcodes
  const allNull = await db
    .select({ id: schema.products.id, orgId: schema.products.orgId })
    .from(schema.products)
    .where(isNull(schema.products.barcode));

  const total = allNull.length;
  if (total === 0) {
    console.log("All products already have barcodes. Nothing to do.");
    await client.end();
    return;
  }

  console.log(`Found ${total.toLocaleString()} products without barcodes. Backfilling...`);

  // Track used barcodes to avoid collisions during backfill
  const usedBarcodes = new Set<string>();

  // Pre-load existing barcodes
  const existing = await db
    .select({ barcode: schema.products.barcode })
    .from(schema.products)
    .where(
      // @ts-expect-error - drizzle typing
      schema.products.barcode !== null
    );
  for (const row of existing) {
    if (row.barcode) usedBarcodes.add(row.barcode);
  }

  let processed = 0;

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = allNull.slice(i, i + BATCH_SIZE);

    for (const product of batch) {
      let barcode = "";
      let attempts = 0;
      while (attempts < 20) {
        const candidate = generateBarcode();
        if (!usedBarcodes.has(candidate)) {
          barcode = candidate;
          usedBarcodes.add(candidate);
          break;
        }
        attempts++;
      }

      if (!barcode) {
        console.error(`Failed to generate unique barcode for product ${product.id}`);
        continue;
      }

      await db
        .update(schema.products)
        .set({ barcode })
        .where(eq(schema.products.id, product.id));

      processed++;
    }

    console.log(
      `  Backfilled ${Math.min(processed, total).toLocaleString()} / ${total.toLocaleString()}...`,
    );
  }

  console.log(`\nDone! ${processed.toLocaleString()} products updated with EAN-13 barcodes.`);
  await client.end();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
