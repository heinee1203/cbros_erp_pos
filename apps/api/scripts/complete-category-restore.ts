/**
 * Complete category/subcategory/brand restoration from APEX + Loyverse CSVs.
 *
 * DRY RUN: npx tsx apps/api/scripts/complete-category-restore.ts
 * APPLY:   npx tsx apps/api/scripts/complete-category-restore.ts --apply
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { db } from "@apex/database";
import { products, categories, brands, productSubcategories } from "@apex/database/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

const ORG_ID = "556e350a-7180-4ec9-9e1e-ea0ca1937f40";
const APEX_CSV = "C:\\Users\\Admin\\Downloads\\apex-items-2026-04-09.csv";
const LOYVERSE_CSV = "C:\\Users\\Admin\\Downloads\\export_items (67).csv";
const APPLY = process.argv.includes("--apply");

function parseCSV(text: string): string[][] {
  const rows: string[][] = []; let current: string[] = []; let field = ""; let inQ = false;
  // Strip BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"' && text[i+1] === '"') { field += '"'; i++; } else if (ch === '"') inQ = false; else field += ch; }
    else { if (ch === '"') inQ = true; else if (ch === ',') { current.push(field); field = ""; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i+1] === '\n') i++; current.push(field); field = ""; if (current.length > 1) rows.push(current); current = []; } else field += ch; }
  }
  if (current.length > 0 || field) { current.push(field); rows.push(current); }
  return rows;
}

// Pattern rules for Pass 3
const PATTERN_RULES: Record<string, string> = {
  "BRAKE PAD":"Brake Pad","BRAKE SHOE":"Brake Shoe","BRAKE DRUM":"Miscellaneous Auto Parts","BRAKE HOSE":"Hose","BRAKE LINING":"Miscellaneous Auto Parts","BRAKE VALVE":"Miscellaneous Auto Parts",
  "ROTOR DISC":"Rotor Disc","WHEEL CYLINDER ASSY":"Wheel Cylinder","CALIPER PISTON":"Caliper Kit","CALIPER BOLT":"Caliper Kit","CALIPER ASSY":"Caliper Kit",
  "HANDBRAKE CABLE":"Miscellaneous Auto Parts","HANDBRAKE SHOE":"Miscellaneous Auto Parts","HYDROVAC ASSY":"Brake Master Assembly","HYDROVAC R/KIT":"Brake Master Repair Kit",
  "B/M ASSY":"Brake Master Assembly","B/M CUP KIT":"Brake Master Repair Kit","B/M REPAIR KIT":"Brake Master Repair Kit",
  "C/M ASSY":"Miscellaneous Auto Parts","C/M CUP KIT":"Miscellaneous Auto Parts","C/M REPAIR KIT":"Miscellaneous Auto Parts",
  "C/O ASSY":"Miscellaneous Auto Parts","C/O CUP KIT":"Miscellaneous Auto Parts","C/O REPAIR KIT":"Miscellaneous Auto Parts",
  "CLUTCH BOOSTER":"Clutch Booster Piston & Kit","CLUTCH CABLE":"Miscellaneous Auto Parts","CLUTCH FORK":"Miscellaneous Auto Parts","CLUTCH HOSE":"Hose",
  "SHOCK ABS":"Miscellaneous Auto Parts","SHOCK BOOTS":"Miscellaneous Auto Parts","SHOCK STOPPER":"Miscellaneous Auto Parts","SHOCK MOUNTING":"Miscellaneous Auto Parts","SHOCK BUSHING":"Bushings",
  "STAB BUSHING":"Bushings","STAB LINK":"Miscellaneous Auto Parts","SUSP ARM ASSY":"Miscellaneous Auto Parts","SUSP BUSHING":"Bushings","SUSP LINK":"Miscellaneous Auto Parts",
  "STRUT BAR":"Strut Bar Assy","SPRING PIN":"Miscellaneous Auto Parts","LATERAL LINK":"Miscellaneous Auto Parts",
  "TIE ROD END":"Miscellaneous Auto Parts","RACK END":"Miscellaneous Auto Parts","BALL JOINT":"Miscellaneous Auto Parts","DRAG LINK":"Miscellaneous Auto Parts",
  "KNUCKLE ARM":"Miscellaneous Auto Parts","KING PIN":"Miscellaneous Auto Parts","STEERING RACK ASSY":"Miscellaneous Auto Parts",
  "WHEEL BEARING":"Miscellaneous Auto Parts","WHEEL HUB":"Miscellaneous Auto Parts","BALL BEARING":"Miscellaneous Auto Parts",
  "CONROD BEARING":"Main Bearing","CONROD ARM":"Miscellaneous Auto Parts",
  "ALTERNATOR ASSY":"Miscellaneous Auto Parts","STARTER ASSY":"Miscellaneous Auto Parts","DISTRIBUTOR ASSY":"Miscellaneous Auto Parts","DIST ROTOR":"Miscellaneous Auto Parts",
  "COMBINATION SWITCH":"Miscellaneous Auto Parts","POWER WINDOW":"Miscellaneous Auto Parts","WINDOW MECHANISM":"Miscellaneous Auto Parts",
  "HEADLIGHT ASSY":"Front Lamp","TAIL LIGHT":"Corner Light Assembly","FOG LAMP":"Fog Lamp Assembly","BUMPER LIGHT":"Miscellaneous Accessories",
  "SIDE MIRROR":"Side Mirror Assembly","CORNER LIGHT":"Corner Light Assembly","FRONT LAMP":"Front Lamp","SIDE LAMP":"Side Lamp",
  "ACCEL CABLE":"Miscellaneous Auto Parts","SPEED CABLE":"Miscellaneous Auto Parts","SELECTOR CABLE":"Miscellaneous Auto Parts","HOOD CABLE":"Miscellaneous Auto Parts",
  "FUEL LID CABLE":"Miscellaneous Auto Parts","ENGINE STOP CABLE":"Miscellaneous Auto Parts","DUMPER CABLE":"Miscellaneous Auto Parts","SHIFTING CABLE":"Miscellaneous Auto Parts",
  "CHAIN GUIDE":"Timing Chain Parts","CHAIN TENSIONER":"Timing Chain Parts","TIMING CHAIN":"Timing Chain Parts","TENSIONER BEARING":"Timing Chain Parts","TENSIONER ASSY":"Timing Chain Parts","TENSIONER PULLEY":"Timing Chain Parts",
  "OIL PRODUCTS":"Miscellaneous Accessories","PRESTONE":"Miscellaneous Accessories","TOP1":"Miscellaneous Accessories","WD40":"Miscellaneous Accessories",
  "ACCESSORIES":"Miscellaneous Accessories","CAR COVER":"Car Covers","CAR TINT":"Miscellaneous Accessories","BED COVER":"Bed Covers",
  "TOYOTA ORIGINAL":"Miscellaneous Auto Parts","MITSUBISHI ORIGINAL":"Miscellaneous Auto Parts","HONDA ORIGINAL":"Miscellaneous Auto Parts","FORD GENUINE":"Miscellaneous Auto Parts",
  "HYUNDAI GENUINE":"Miscellaneous Auto Parts","ISUZU GENUINE":"Miscellaneous Auto Parts","NISSAN GENUINE":"Miscellaneous Auto Parts",
  "RADIATOR ASSY":"Miscellaneous Auto Parts","RADIATOR HOSE":"Hose",
  "CV JOINT":"Miscellaneous Auto Parts","DRIVESHAFT":"Miscellaneous Auto Parts",
  "CAMSHAFT ASSY":"Miscellaneous Auto Parts","CAMSHAFT GEAR":"Miscellaneous Auto Parts","CRANKSHAFT GEAR":"Miscellaneous Auto Parts",
  "MISC":"Miscellaneous Auto Parts","TIRE #":"Miscellaneous Auto Parts",
  "AIRCON COMPRESSOR":"Miscellaneous Auto Parts","INJECTOR":"Fuel Injector","TURBOCHARGER":"Miscellaneous Auto Parts",
  "CARBURATOR":"Carburator Assy","CONDENSER":"Condenser Assembly","DRIVE BELT":"Fan Belt",
  "DOOR HINGE":"Door Handles","DOOR LOCK":"Door Handles","DOOR HANDLE":"Door Handles",
  "WATER INLET":"Water Pipe","WATER OUTLET":"Water Pipe",
  "LEVER":"Miscellaneous Auto Parts","WINDSHIELD":"Miscellaneous Auto Parts","WATER JACKET":"Miscellaneous Auto Parts","CENTER LINK KIT":"Miscellaneous Auto Parts",
  "LINER ORING":"Miscellaneous Auto Parts","AIRCON COMPRESSOR":"Miscellaneous Auto Parts",
};

async function main() {
  console.log(`=== Complete Category Restoration ${APPLY ? "(APPLY)" : "(DRY RUN)"} ===\n`);

  // Load DB lookups
  const catRows = await db.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.orgId, ORG_ID));
  const catByName = new Map(catRows.map(c => [c.name.toLowerCase().trim(), c.id]));
  const catNameById = new Map(catRows.map(c => [c.id, c.name]));
  console.log(`DB categories: ${catRows.length}`);

  const brandRows = await db.select({ id: brands.id, name: brands.name }).from(brands).where(eq(brands.orgId, ORG_ID));
  const brandByName = new Map(brandRows.map(b => [b.name.toLowerCase().trim(), b.id]));
  console.log(`DB brands: ${brandRows.length}`);

  const subRows = await db.select({ id: productSubcategories.id, name: productSubcategories.name, categoryId: productSubcategories.categoryId })
    .from(productSubcategories).where(eq(productSubcategories.orgId, ORG_ID));
  const subByName = new Map(subRows.map(s => [s.name.toLowerCase().trim(), s.id]));
  console.log(`DB subcategories: ${subRows.length}`);

  // Load all products (id, sku, categoryId, brandId, subcategoryId)
  const allProducts = await db.select({ id: products.id, sku: products.sku, categoryId: products.categoryId, brandId: products.brandId, subcategoryId: products.subcategoryId })
    .from(products).where(eq(products.orgId, ORG_ID));
  const productBySku = new Map(allProducts.map(p => [p.sku.toLowerCase(), p]));
  console.log(`DB products: ${allProducts.length}`);

  // Parse APEX CSV
  const apexRows = parseCSV(fs.readFileSync(APEX_CSV, "utf8"));
  const apexHeaders = apexRows[0].map(h => h.trim().toLowerCase());
  const aSkuIdx = apexHeaders.indexOf("sku");
  const aCatIdx = apexHeaders.indexOf("category");
  const aSubIdx = apexHeaders.indexOf("sub-category");
  const aBrandIdx = apexHeaders.indexOf("brand");
  console.log(`APEX CSV: ${apexRows.length - 1} rows, SKU=${aSkuIdx} Cat=${aCatIdx} Sub=${aSubIdx} Brand=${aBrandIdx}`);

  // Parse Loyverse CSV
  const loyRows = parseCSV(fs.readFileSync(LOYVERSE_CSV, "utf8"));
  const loyHeaders = loyRows[0].map(h => h.trim().toLowerCase());
  const lSkuIdx = loyHeaders.indexOf("sku");
  const lCatIdx = loyHeaders.indexOf("category");
  const loySkuToCat = new Map<string, string>();
  for (let i = 1; i < loyRows.length; i++) {
    const sku = loyRows[i][lSkuIdx]?.trim();
    const cat = loyRows[i][lCatIdx]?.trim();
    if (sku && cat) loySkuToCat.set(sku.toLowerCase(), cat);
  }
  console.log(`Loyverse CSV: ${loyRows.length - 1} rows, SKU→Cat: ${loySkuToCat.size}`);

  // Build confirmed Loyverse→Curated mapping from APEX export cross-ref
  const confirmedMapping = new Map<string, string>(); // loyverseCat → curatedCatId
  for (let i = 1; i < apexRows.length; i++) {
    const sku = apexRows[i][aSkuIdx]?.trim();
    const curatedCat = apexRows[i][aCatIdx]?.trim();
    if (!sku || !curatedCat) continue;
    const loyverseCat = loySkuToCat.get(sku.toLowerCase());
    if (!loyverseCat) continue;
    const curatedId = catByName.get(curatedCat.toLowerCase().trim());
    if (!curatedId) continue;
    if (!confirmedMapping.has(loyverseCat)) confirmedMapping.set(loyverseCat, curatedId);
  }
  console.log(`Confirmed Loyverse→Curated pairs: ${confirmedMapping.size}`);

  // Stats
  let pass1Cat = 0, pass1Brand = 0, pass1Sub = 0;
  let pass2Cat = 0, pass2Brand = 0;
  let pass3Cat = 0;
  const updates = new Map<string, { categoryId?: string; brandId?: string; subcategoryId?: string }>();

  // === PASS 1: Direct from APEX export ===
  console.log("\n--- Pass 1: APEX export direct ---");
  for (let i = 1; i < apexRows.length; i++) {
    const sku = apexRows[i][aSkuIdx]?.trim();
    if (!sku) continue;
    const prod = productBySku.get(sku.toLowerCase());
    if (!prod) continue;

    const catName = apexRows[i][aCatIdx]?.trim();
    const subName = apexRows[i][aSubIdx]?.trim();
    const brandName = apexRows[i][aBrandIdx]?.trim();

    const u: any = {};
    if (catName && !prod.categoryId) {
      const catId = catByName.get(catName.toLowerCase().trim());
      if (catId) { u.categoryId = catId; pass1Cat++; }
    }
    if (brandName && !prod.brandId) {
      const brandId = brandByName.get(brandName.toLowerCase().trim());
      if (brandId) { u.brandId = brandId; pass1Brand++; }
    }
    if (subName && !prod.subcategoryId) {
      const subId = subByName.get(subName.toLowerCase().trim());
      if (subId) { u.subcategoryId = subId; pass1Sub++; }
    }
    if (Object.keys(u).length > 0) updates.set(prod.id, { ...updates.get(prod.id), ...u });
  }
  console.log(`  Categories: ${pass1Cat}, Brands: ${pass1Brand}, Subcategories: ${pass1Sub}`);

  // === PASS 2: Loyverse cross-reference (confirmed mapping) ===
  console.log("\n--- Pass 2: Loyverse confirmed mapping ---");
  for (const prod of allProducts) {
    if (prod.categoryId || updates.get(prod.id)?.categoryId) continue;
    const loyverseCat = loySkuToCat.get(prod.sku.toLowerCase());
    if (!loyverseCat) continue;
    const curatedId = confirmedMapping.get(loyverseCat);
    if (curatedId) {
      const u = updates.get(prod.id) || {};
      u.categoryId = curatedId;
      updates.set(prod.id, u);
      pass2Cat++;
    }
  }
  // Also brands from Loyverse cross-ref
  for (const prod of allProducts) {
    if (prod.brandId || updates.get(prod.id)?.brandId) continue;
    const loyverseCat = loySkuToCat.get(prod.sku.toLowerCase());
    if (!loyverseCat || !loyverseCat.includes(" - ")) continue;
    const brandPart = loyverseCat.split(" - ").slice(1).join(" - ").replace(/\s*#\d+.*$/, "").trim();
    if (!brandPart) continue;
    const brandId = brandByName.get(brandPart.toLowerCase());
    if (brandId) {
      const u = updates.get(prod.id) || {};
      u.brandId = brandId;
      updates.set(prod.id, u);
      pass2Brand++;
    }
  }
  console.log(`  Categories: ${pass2Cat}, Brands: ${pass2Brand}`);

  // === PASS 3: Pattern matching ===
  console.log("\n--- Pass 3: Pattern matching ---");
  for (const prod of allProducts) {
    if (prod.categoryId || updates.get(prod.id)?.categoryId) continue;
    const loyverseCat = loySkuToCat.get(prod.sku.toLowerCase());
    if (!loyverseCat) continue;
    // Strip "#XX" and brand suffix for matching
    const stripped = loyverseCat.replace(/\s*#\d+.*$/, "").replace(/\s*-\s+.*$/, "").trim().toUpperCase();

    let matched = false;
    for (const [pattern, curatedName] of Object.entries(PATTERN_RULES)) {
      if (stripped === pattern || stripped.startsWith(pattern) || loyverseCat.toUpperCase().startsWith(pattern)) {
        const curatedId = catByName.get(curatedName.toLowerCase().trim());
        if (curatedId) {
          const u = updates.get(prod.id) || {};
          u.categoryId = curatedId;
          updates.set(prod.id, u);
          pass3Cat++;
          matched = true;
          break;
        }
      }
    }
  }
  console.log(`  Categories: ${pass3Cat}`);

  // Summary
  const totalCatUpdates = pass1Cat + pass2Cat + pass3Cat;
  const totalBrandUpdates = pass1Brand + pass2Brand;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total category updates: ${totalCatUpdates} (P1: ${pass1Cat}, P2: ${pass2Cat}, P3: ${pass3Cat})`);
  console.log(`Total brand updates: ${totalBrandUpdates} (P1: ${pass1Brand}, P2: ${pass2Brand})`);
  console.log(`Total subcategory updates: ${pass1Sub}`);
  console.log(`Total products to update: ${updates.size}`);

  // Count remaining NULL
  const stillNull = allProducts.filter(p => !p.categoryId && !updates.get(p.id)?.categoryId).length;
  console.log(`Still NULL after all passes: ${stillNull}`);

  if (!APPLY) {
    console.log(`\n*** DRY RUN — run with --apply to execute ***`);
    process.exit(0);
  }

  // APPLY
  console.log(`\n--- APPLYING ${updates.size} updates ---`);
  let applied = 0;
  for (const [pid, u] of updates) {
    const setFields: any = {};
    if (u.categoryId) setFields.categoryId = u.categoryId;
    if (u.brandId) setFields.brandId = u.brandId;
    if (u.subcategoryId) setFields.subcategoryId = u.subcategoryId;
    if (Object.keys(setFields).length === 0) continue;
    await db.update(products).set(setFields).where(eq(products.id, pid));
    applied++;
    if (applied % 5000 === 0) console.log(`  ${applied}/${updates.size}`);
  }
  console.log(`  Applied: ${applied}`);

  // Verify
  const [finalCat] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NOT NULL`) as any[];
  const [finalNull] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND category_id IS NULL`) as any[];
  const [finalBrand] = await db.execute(sql`SELECT COUNT(*) AS cnt FROM products WHERE org_id = ${ORG_ID} AND brand_id IS NOT NULL`) as any[];
  console.log(`\n=== Final State ===`);
  console.log(`Products with category: ${finalCat.cnt}`);
  console.log(`Products without category: ${finalNull.cnt}`);
  console.log(`Products with brand: ${finalBrand.cnt}`);

  process.exit(0);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
