/**
 * Revert brand assignments changed by a bad "Update Only" item import.
 *
 * DRY RUN:
 *   npx tsx apps/api/scripts/revert-update-only-brand-import.ts
 *
 * APPLY:
 *   npx tsx apps/api/scripts/revert-update-only-brand-import.ts --apply
 *
 * Optional:
 *   --start=2026-05-18T01:46:00.000Z --end=2026-05-18T01:56:00.000Z
 *   --csv="C:\Users\Admin\Downloads\apex-items-2026-04-09.csv"
 */
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";
import { eq, inArray, sql } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { brands, products } from "@apex/database/schema";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const DEFAULT_CSV = "C:\\Users\\Admin\\Downloads\\apex-items-2026-04-09.csv";
const APPLY = process.argv.includes("--apply");

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  brandId: string | null;
  brandName: string | null;
  updatedAt: Date;
};

type UpdatePlan = {
  id: string;
  sku: string;
  name: string;
  currentBrandId: string | null;
  currentBrandName: string | null;
  desiredBrandId: string | null;
  desiredBrandName: string | null;
};

function argValue(name: string) {
  const prefix = `${name}=`;
  const arg = process.argv.find((entry) => entry.startsWith(prefix));
  return arg ? arg.slice(prefix.length).replace(/^"|"$/g, "") : null;
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  let field = "";
  let inQuotes = false;

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      current.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      current.push(field);
      field = "";
      if (current.length > 1) rows.push(current);
      current = [];
    } else {
      field += ch;
    }
  }

  if (current.length > 0 || field) {
    current.push(field);
    rows.push(current);
  }

  return rows;
}

function loadCsvBrandBySku(csvPath: string) {
  const rows = parseCSV(fs.readFileSync(csvPath, "utf8"));
  const headers = rows[0]?.map((header) => normalize(header)) ?? [];
  const skuIndex = headers.indexOf("sku");
  const brandIndex = headers.indexOf("brand");
  if (skuIndex < 0 || brandIndex < 0) {
    throw new Error(`CSV must include SKU and Brand columns: ${csvPath}`);
  }

  const brandBySku = new Map<string, string | null>();
  const conflicts: Array<{ sku: string; first: string | null; second: string | null }> = [];

  for (let i = 1; i < rows.length; i++) {
    const sku = rows[i][skuIndex]?.trim();
    if (!sku) continue;
    const key = normalize(sku);
    const brandName = rows[i][brandIndex]?.trim() || null;
    const existing = brandBySku.get(key);
    if (brandBySku.has(key) && normalize(existing) !== normalize(brandName)) {
      conflicts.push({ sku, first: existing ?? null, second: brandName });
      continue;
    }
    brandBySku.set(key, brandName);
  }

  return { brandBySku, conflicts, rowCount: Math.max(0, rows.length - 1) };
}

async function inferBadImportWindow() {
  const rows = await db.execute(sql`
    SELECT date_trunc('minute', updated_at) AS minute, COUNT(*)::int AS count
    FROM products
    WHERE org_id = ${ORG_ID}
      AND updated_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila')
    GROUP BY 1
    ORDER BY 1 ASC
  `) as Array<{ minute: Date; count: number }>;

  const noisyMinutes = rows.filter((row) => Number(row.count) >= 500);
  if (noisyMinutes.length === 0) {
    throw new Error("Could not infer an import window: no 500+ product update minutes found today.");
  }

  const groups: Array<{ start: Date; end: Date; count: number; minutes: number }> = [];
  let current: { start: Date; end: Date; count: number; minutes: number } | null = null;

  for (const row of noisyMinutes) {
    const minute = new Date(row.minute);
    if (!current) {
      current = { start: minute, end: minute, count: Number(row.count), minutes: 1 };
      continue;
    }

    const deltaMinutes = (minute.getTime() - current.end.getTime()) / 60_000;
    if (deltaMinutes <= 1) {
      current.end = minute;
      current.count += Number(row.count);
      current.minutes += 1;
    } else {
      groups.push(current);
      current = { start: minute, end: minute, count: Number(row.count), minutes: 1 };
    }
  }
  if (current) groups.push(current);

  groups.sort((a, b) => b.count - a.count);
  const best = groups[0];
  return {
    start: best.start,
    end: new Date(best.end.getTime() + 60_000),
    totalUpdates: best.count,
    minutes: best.minutes,
    clusters: rows.slice(-20).map((row) => ({
      minute: new Date(row.minute).toISOString(),
      count: Number(row.count),
    })),
  };
}

async function loadAffectedProducts(start: Date, end: Date): Promise<ProductRow[]> {
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  return await db.execute(sql`
    SELECT
      p.id,
      p.sku,
      p.name,
      p.brand_id AS "brandId",
      b.name AS "brandName",
      p.updated_at AS "updatedAt"
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    WHERE p.org_id = ${ORG_ID}
      AND p.updated_at >= ${startIso}::timestamptz
      AND p.updated_at < ${endIso}::timestamptz
    ORDER BY p.sku ASC
  `) as ProductRow[];
}

async function verifyBackup(backupPath: string) {
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8")) as { changes: UpdatePlan[] };
  const desiredById = new Map(backup.changes.map((change) => [change.id, change.desiredBrandId ?? null]));
  const ids = Array.from(desiredById.keys());
  let checked = 0;
  const mismatches: Array<{ id: string; current: string | null; desired: string | null }> = [];

  for (let i = 0; i < ids.length; i += 500) {
    const batchIds = ids.slice(i, i + 500);
    const rows = await db.select({ id: products.id, brandId: products.brandId })
      .from(products)
      .where(inArray(products.id, batchIds));

    checked += rows.length;
    for (const row of rows) {
      const desired = desiredById.get(row.id) ?? null;
      if ((row.brandId ?? null) !== desired) {
        mismatches.push({ id: row.id, current: row.brandId ?? null, desired });
      }
    }
  }

  console.log("=== Brand Rollback Verification ===");
  console.log(`Backup: ${backupPath}`);
  console.log(`Expected changes: ${ids.length}`);
  console.log(`Rows checked: ${checked}`);
  console.log(`Mismatches: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.log("\nSample mismatches:");
    for (const mismatch of mismatches.slice(0, 20)) {
      console.log(`  ${mismatch.id}: current=${mismatch.current ?? "(none)"}, desired=${mismatch.desired ?? "(none)"}`);
    }
  }
}

async function main() {
  const verifyBackupPath = argValue("--verify-backup");
  if (verifyBackupPath) {
    await verifyBackup(verifyBackupPath);
    process.exit(0);
  }

  const csvPath = argValue("--csv") ?? DEFAULT_CSV;
  const startArg = argValue("--start");
  const endArg = argValue("--end");
  const window = startArg && endArg
    ? { start: new Date(startArg), end: new Date(endArg), totalUpdates: 0, minutes: 0, clusters: [] }
    : await inferBadImportWindow();

  if (!fs.existsSync(csvPath)) {
    throw new Error(`Brand source CSV not found: ${csvPath}`);
  }

  const { brandBySku, conflicts, rowCount } = loadCsvBrandBySku(csvPath);
  const dbBrands = await db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.orgId, ORG_ID));
  const brandIdByName = new Map(dbBrands.map((brand) => [normalize(brand.name), brand.id]));
  const affected = await loadAffectedProducts(window.start, window.end);

  const plan: UpdatePlan[] = [];
  const missingFromCsv: ProductRow[] = [];
  const unmatchedBrands = new Map<string, number>();

  for (const product of affected) {
    const csvBrandKnown = brandBySku.has(normalize(product.sku));
    if (!csvBrandKnown) {
      missingFromCsv.push(product);
      continue;
    }

    const desiredBrandName = brandBySku.get(normalize(product.sku)) ?? null;
    const desiredBrandId = desiredBrandName ? brandIdByName.get(normalize(desiredBrandName)) ?? null : null;
    if (desiredBrandName && !desiredBrandId) {
      unmatchedBrands.set(desiredBrandName, (unmatchedBrands.get(desiredBrandName) ?? 0) + 1);
      continue;
    }

    if ((product.brandId ?? null) === (desiredBrandId ?? null)) continue;

    plan.push({
      id: product.id,
      sku: product.sku,
      name: product.name,
      currentBrandId: product.brandId,
      currentBrandName: product.brandName,
      desiredBrandId,
      desiredBrandName,
    });
  }

  console.log(`=== Update Only Brand Rollback ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===`);
  console.log(`Source CSV: ${csvPath}`);
  console.log(`CSV rows: ${rowCount}, SKU brand mappings: ${brandBySku.size}, conflicts skipped: ${conflicts.length}`);
  console.log(`Inferred/import window: ${window.start.toISOString()} → ${window.end.toISOString()}`);
  if (window.totalUpdates) console.log(`Noisy product update minutes: ${window.minutes}, rows in noisy minutes: ${window.totalUpdates}`);
  console.log(`Affected products in window: ${affected.length}`);
  console.log(`Brand-only updates planned: ${plan.length}`);
  console.log(`Affected products missing in CSV: ${missingFromCsv.length}`);
  console.log(`CSV brand names not found in DB: ${Array.from(unmatchedBrands.values()).reduce((sum, count) => sum + count, 0)}`);

  if (plan.length > 0) {
    console.log("\nSample planned brand restores:");
    for (const change of plan.slice(0, 20)) {
      console.log(`  ${change.sku}: "${change.currentBrandName ?? "(none)"}" → "${change.desiredBrandName ?? "(none)"}"`);
    }
  }

  if (unmatchedBrands.size > 0) {
    console.log("\nTop unmatched CSV brands:");
    for (const [name, count] of Array.from(unmatchedBrands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${count.toString().padStart(5)}  ${name}`);
    }
  }

  if (!APPLY) {
    console.log("\n*** DRY RUN ONLY. Re-run with --apply to restore brand_id only. ***");
    process.exit(0);
    return;
  }

  if (plan.length === 0) {
    console.log("\nNothing to update.");
    process.exit(0);
    return;
  }

  const backupDir = resolve(__dirname, "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = resolve(
    backupDir,
    `update-only-brand-rollback-${new Date().toISOString().replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(
    backupFile,
    JSON.stringify({
      createdAt: new Date().toISOString(),
      orgId: ORG_ID,
      sourceCsv: csvPath,
      window: { start: window.start.toISOString(), end: window.end.toISOString() },
      changes: plan,
    }, null, 2),
  );

  console.log(`\nBackup written: ${backupFile}`);
  let applied = 0;
  for (const change of plan) {
    await db.update(products)
      .set({ brandId: change.desiredBrandId })
      .where(eq(products.id, change.id));
    applied++;
    if (applied % 1000 === 0) console.log(`  Applied ${applied}/${plan.length}`);
  }

  console.log(`Applied brand restores: ${applied}`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
