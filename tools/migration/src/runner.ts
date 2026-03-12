// config.ts handles dotenv loading from monorepo root
import { db, closeDb, DATA_DIR } from "./config";
import { sql } from "drizzle-orm";
import path from "path";
import { extractFile, listDataFiles } from "./extract";
import {
  stageLocations,
  stageSuppliers,
  stageProducts,
  stageCustomers,
  stageCustomerVehicles,
  stageOpeningBalances,
  type StagingResult,
} from "./stage";
import {
  validateLocations,
  validateSuppliers,
  validateProducts,
  validateCustomers,
  validateCustomerVehicles,
  validateOpeningBalances,
} from "./validate";
import {
  promoteLocations,
  promoteSuppliers,
  promoteProducts,
  promoteCustomers,
  promoteCustomerVehicles,
  promoteOpeningBalances,
} from "./promote";
import { generateReconciliationReport } from "./reconcile";

// ═══════════════════════════════════════════════
// APEX POS — Data Migration ETL Runner
//
// Pipeline: Extract → Stage → Validate → Promote → Reconcile
//
// Promotion order (strict dependency):
//   1. Locations & Suppliers
//   2. Products (46k SKUs, KINGSCOBRA regeneration)
//   3. Customers
//   4. Customer Vehicles
//   5. Opening Balances (inventory + OPENING_BALANCE journal)
//
// Usage:
//   pnpm migrate                    # Run full pipeline
//   pnpm migrate --phase extract    # Extract only
//   pnpm migrate --phase validate   # Re-validate staged data
//   pnpm migrate --phase promote    # Promote validated data
//   pnpm migrate --phase reconcile  # Generate report only
//
// Place data files in tools/migration/data/:
//   locations.csv     | locations.xlsx
//   suppliers.csv     | suppliers.xlsx
//   products.csv      | products.xlsx
//   customers.csv     | customers.xlsx
//   vehicles.csv      | vehicles.xlsx
//   balances.csv      | balances.xlsx
// ═══════════════════════════════════════════════

// ── File naming conventions ──
const FILE_PATTERNS: Record<string, string[]> = {
  locations: ["locations"],
  suppliers: ["suppliers"],
  products: ["products", "skus", "parts", "catalog"],
  customers: ["customers", "clients"],
  customer_vehicles: ["vehicles", "cars", "fleet"],
  opening_balances: ["balances", "inventory", "stock", "opening"],
};

async function main() {
  const args = process.argv.slice(2);
  const phaseArg = args.find((a) => a.startsWith("--phase="))?.split("=")[1]
    ?? (args.indexOf("--phase") !== -1 ? args[args.indexOf("--phase") + 1] : null);

  console.log("═══════════════════════════════════════════════");
  console.log("  APEX POS — Data Migration ETL Pipeline");
  console.log("═══════════════════════════════════════════════\n");

  try {
    if (!phaseArg || phaseArg === "extract") {
      await runExtractAndStage();
      if (phaseArg === "extract") return;
    }

    if (!phaseArg || phaseArg === "validate") {
      await runValidation();
      if (phaseArg === "validate") return;
    }

    if (!phaseArg || phaseArg === "promote") {
      await runPromotion();
      if (phaseArg === "promote") return;
    }

    if (!phaseArg || phaseArg === "reconcile") {
      await runReconciliation();
    }

    console.log("\n  Migration pipeline complete.");
  } catch (err: any) {
    console.error(`\n  FATAL: ${err.message}`);
    process.exit(1);
  } finally {
    await closeDb();
  }
}

// ═══════════════════════════════════════════════
// Phase 1+2: Extract & Stage
// ═══════════════════════════════════════════════
async function runExtractAndStage() {
  console.log("── Phase 1+2: Extract & Stage ──\n");

  const dataFiles = listDataFiles();
  if (dataFiles.length === 0) {
    console.log(`  No data files found in ${DATA_DIR}`);
    console.log("  Place CSV/Excel files and re-run.\n");
    console.log("  Expected files:");
    console.log("    locations.csv     — Locations (name, code, type, address)");
    console.log("    suppliers.csv     — Suppliers (name, email, phone, address)");
    console.log("    products.csv      — Products (name, sku, mnemonic_sku, category, prices)");
    console.log("    customers.csv     — Customers (name, phone, notes)");
    console.log("    vehicles.csv      — Vehicles (customer_phone, make, model, year, plate)");
    console.log("    balances.csv      — Opening balances (sku, location_code, qty)\n");
    return;
  }

  console.log(`  Found ${dataFiles.length} data files: ${dataFiles.join(", ")}\n`);

  const staged: StagingResult[] = [];

  for (const file of dataFiles) {
    const baseName = path.basename(file, path.extname(file)).toLowerCase();
    const entityType = detectEntityType(baseName);

    if (!entityType) {
      console.log(`  SKIP: Cannot determine entity type for "${file}". Rename to match: ${Object.keys(FILE_PATTERNS).join(", ")}`);
      continue;
    }

    console.log(`  Processing: ${file} → ${entityType}`);
    const rows = extractFile(file);

    if (rows.length === 0) {
      console.log(`    Empty file, skipping.`);
      continue;
    }

    let result: StagingResult;
    switch (entityType) {
      case "locations":
        result = await stageLocations(rows, file);
        break;
      case "suppliers":
        result = await stageSuppliers(rows, file);
        break;
      case "products":
        result = await stageProducts(rows, file);
        break;
      case "customers":
        result = await stageCustomers(rows, file);
        break;
      case "customer_vehicles":
        result = await stageCustomerVehicles(rows, file);
        break;
      case "opening_balances":
        result = await stageOpeningBalances(rows, file);
        break;
      default:
        console.log(`    Unknown entity type: ${entityType}`);
        continue;
    }

    staged.push(result);
  }

  console.log(`\n  Staging complete: ${staged.length} batches created.\n`);
}

// ═══════════════════════════════════════════════
// Phase 3: Validate
// ═══════════════════════════════════════════════
async function runValidation() {
  console.log("── Phase 3: Validate ──\n");

  // Validate in dependency order
  const entityOrder = [
    "locations",
    "suppliers",
    "products",
    "customers",
    "customer_vehicles",
    "opening_balances",
  ];

  for (const entityType of entityOrder) {
    const batches = await findBatchesByEntity(entityType, "STAGED");
    if (batches.length === 0) continue;

    for (const batch of batches) {
      console.log(`  Validating ${entityType} batch ${batch.id.substring(0, 8)}...`);

      let result;
      switch (entityType) {
        case "locations":
          result = await validateLocations(batch.id);
          break;
        case "suppliers":
          result = await validateSuppliers(batch.id);
          break;
        case "products":
          result = await validateProducts(batch.id);
          break;
        case "customers":
          result = await validateCustomers(batch.id);
          break;
        case "customer_vehicles":
          result = await validateCustomerVehicles(batch.id);
          break;
        case "opening_balances":
          result = await validateOpeningBalances(batch.id);
          break;
      }

      if (result) {
        console.log(`    Valid: ${result.validRows}, Rejected: ${result.rejectedRows}`);
      }
    }
  }

  console.log(`\n  Validation complete.\n`);
}

// ═══════════════════════════════════════════════
// Phase 4: Promote (strict dependency order)
// ═══════════════════════════════════════════════
async function runPromotion() {
  console.log("── Phase 4: Promote ──\n");

  // Strict promotion order
  const promotionSequence: { entity: string; promoteFn: (batchId: string) => Promise<any> }[] = [
    { entity: "locations", promoteFn: promoteLocations },
    { entity: "suppliers", promoteFn: promoteSuppliers },
    { entity: "products", promoteFn: promoteProducts },
    { entity: "customers", promoteFn: promoteCustomers },
    { entity: "customer_vehicles", promoteFn: promoteCustomerVehicles },
    { entity: "opening_balances", promoteFn: promoteOpeningBalances },
  ];

  for (const { entity, promoteFn } of promotionSequence) {
    const batches = await findBatchesByEntity(entity, "VALIDATED");
    if (batches.length === 0) continue;

    for (const batch of batches) {
      console.log(`  Promoting ${entity} batch ${batch.id.substring(0, 8)}...`);
      const result = await promoteFn(batch.id);
      console.log(`    Promoted: ${result.promotedCount}, Skipped: ${result.skippedCount}`);
    }
  }

  console.log(`\n  Promotion complete.\n`);
}

// ═══════════════════════════════════════════════
// Phase 5: Reconcile
// ═══════════════════════════════════════════════
async function runReconciliation() {
  console.log("── Phase 5: Reconcile ──\n");

  const report = await generateReconciliationReport();

  console.log(`\n  Overall: ${report.overallSummary.totalPromoted} of ${report.overallSummary.totalStaged} rows promoted (${report.overallSummary.promotionRate})`);
  if (report.rejections.length > 0) {
    console.log(`  ${report.rejections.length} rejections — see report for details.`);
  }
}

// ── Helpers ──

function detectEntityType(baseName: string): string | null {
  for (const [entity, patterns] of Object.entries(FILE_PATTERNS)) {
    for (const pattern of patterns) {
      if (baseName.includes(pattern)) return entity;
    }
  }
  return null;
}

async function findBatchesByEntity(entityType: string, status: string) {
  const rows = await db.execute(sql`
    SELECT id, entity_type, source_file FROM migration_batches
    WHERE entity_type = ${entityType} AND status = ${status}
    ORDER BY started_at ASC
  `);
  return rows as any[];
}

// ── Run ──
main();
