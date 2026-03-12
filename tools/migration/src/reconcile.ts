import { db } from "./config";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Phase 5: Reconcile ──
// Generates migration reports comparing staged vs promoted counts.
// Outputs rejection details for review.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, "../reports");

export interface ReconciliationReport {
  timestamp: string;
  batches: BatchReport[];
  overallSummary: {
    totalStaged: number;
    totalPromoted: number;
    totalRejected: number;
    promotionRate: string;
  };
  rejections: RejectionDetail[];
}

interface BatchReport {
  batchId: string;
  entityType: string;
  sourceFile: string;
  totalRows: number;
  validRows: number;
  rejectedRows: number;
  promotedRows: number;
  promotionRate: string;
  status: string;
}

interface RejectionDetail {
  entityType: string;
  batchId: string;
  rowNumber: number;
  errors: string;
  context: Record<string, any>;
}

/**
 * Generate a comprehensive reconciliation report for all migration batches.
 */
export async function generateReconciliationReport(): Promise<ReconciliationReport> {
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }

  // ── Batch summaries ──
  const batchRows = await db.execute(sql`
    SELECT id, entity_type, source_file, total_rows, valid_rows, rejected_rows, promoted_rows, status
    FROM migration_batches
    ORDER BY started_at ASC
  `);

  const batches: BatchReport[] = (batchRows as any[]).map((b) => ({
    batchId: b.id,
    entityType: b.entity_type,
    sourceFile: b.source_file,
    totalRows: b.total_rows,
    validRows: b.valid_rows,
    rejectedRows: b.rejected_rows,
    promotedRows: b.promoted_rows,
    promotionRate: b.total_rows > 0 ? ((b.promoted_rows / b.total_rows) * 100).toFixed(1) + "%" : "0%",
    status: b.status,
  }));

  // ── Collect all rejections ──
  const rejections: RejectionDetail[] = [];

  const stgTables = [
    { table: "stg_locations", entity: "locations", fields: "name, code, type" },
    { table: "stg_suppliers", entity: "suppliers", fields: "name, contact_email" },
    { table: "stg_products", entity: "products", fields: "name, sku, category" },
    { table: "stg_customers", entity: "customers", fields: "name, phone" },
    { table: "stg_customer_vehicles", entity: "customer_vehicles", fields: "customer_phone, make, model" },
    { table: "stg_opening_balances", entity: "opening_balances", fields: "sku, location_code, opening_qty" },
  ];

  for (const { table, entity, fields } of stgTables) {
    const rejected = await db.execute(
      sql.raw(`
        SELECT batch_id, row_number, validation_errors, ${fields}
        FROM ${table}
        WHERE validation_status = 'REJECTED'
        ORDER BY row_number
        LIMIT 500
      `),
    );

    for (const r of rejected as any[]) {
      const { batch_id, row_number, validation_errors, ...context } = r;
      rejections.push({
        entityType: entity,
        batchId: batch_id,
        rowNumber: row_number,
        errors: validation_errors,
        context,
      });
    }
  }

  // ── Overall summary ──
  let totalStaged = 0;
  let totalPromoted = 0;
  let totalRejected = 0;
  for (const b of batches) {
    totalStaged += b.totalRows;
    totalPromoted += b.promotedRows;
    totalRejected += b.rejectedRows;
  }

  const report: ReconciliationReport = {
    timestamp: new Date().toISOString(),
    batches,
    overallSummary: {
      totalStaged,
      totalPromoted,
      totalRejected,
      promotionRate: totalStaged > 0 ? ((totalPromoted / totalStaged) * 100).toFixed(1) + "%" : "0%",
    },
    rejections,
  };

  // ── Write report files ──
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  // JSON report (machine-readable)
  const jsonPath = path.join(REPORT_DIR, `reconciliation-${ts}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  // Text summary (human-readable)
  const txtPath = path.join(REPORT_DIR, `reconciliation-${ts}.txt`);
  const lines: string[] = [
    "═══════════════════════════════════════════════════",
    "  APEX POS — Data Migration Reconciliation Report",
    `  Generated: ${report.timestamp}`,
    "═══════════════════════════════════════════════════",
    "",
    "OVERALL SUMMARY",
    `  Total Staged:   ${totalStaged}`,
    `  Total Promoted: ${totalPromoted}`,
    `  Total Rejected: ${totalRejected}`,
    `  Promotion Rate: ${report.overallSummary.promotionRate}`,
    "",
    "─── BATCH DETAILS ───",
  ];

  for (const b of batches) {
    lines.push(
      `  [${b.entityType.toUpperCase()}] ${b.sourceFile}`,
      `    Batch:    ${b.batchId}`,
      `    Total:    ${b.totalRows}`,
      `    Valid:    ${b.validRows}`,
      `    Rejected: ${b.rejectedRows}`,
      `    Promoted: ${b.promotedRows} (${b.promotionRate})`,
      `    Status:   ${b.status}`,
      "",
    );
  }

  if (rejections.length > 0) {
    lines.push("─── REJECTIONS (first 500) ───");
    for (const r of rejections) {
      lines.push(
        `  [${r.entityType}] Row #${r.rowNumber} (batch ${r.batchId.substring(0, 8)})`,
        `    Errors: ${r.errors}`,
        `    Data:   ${JSON.stringify(r.context)}`,
        "",
      );
    }
  } else {
    lines.push("─── NO REJECTIONS ───", "  All staged rows were promoted successfully.", "");
  }

  // ── Live count verification ──
  lines.push("─── LIVE TABLE COUNTS (post-migration) ───");

  const countQueries = [
    { name: "organizations", q: "SELECT COUNT(*)::int AS cnt FROM organizations" },
    { name: "locations", q: "SELECT COUNT(*)::int AS cnt FROM locations" },
    { name: "suppliers", q: "SELECT COUNT(*)::int AS cnt FROM suppliers" },
    { name: "product_families", q: "SELECT COUNT(*)::int AS cnt FROM product_families" },
    { name: "products", q: "SELECT COUNT(*)::int AS cnt FROM products" },
    { name: "customers", q: "SELECT COUNT(*)::int AS cnt FROM customers" },
    { name: "customer_vehicles", q: "SELECT COUNT(*)::int AS cnt FROM customer_vehicles" },
    { name: "inventory", q: "SELECT COUNT(*)::int AS cnt FROM inventory" },
    { name: "stock_journal (OPENING_BALANCE)", q: "SELECT COUNT(*)::int AS cnt FROM stock_journal WHERE reference_type = 'OPENING_BALANCE'" },
  ];

  for (const { name, q } of countQueries) {
    try {
      const result = await db.execute(sql.raw(q));
      lines.push(`  ${name.padEnd(35)} ${(result[0] as any).cnt}`);
    } catch {
      lines.push(`  ${name.padEnd(35)} (error)`);
    }
  }

  lines.push("", "═══════════════════════════════════════════════════");

  fs.writeFileSync(txtPath, lines.join("\n"));

  console.log(`\n  Report written to:`);
  console.log(`    ${jsonPath}`);
  console.log(`    ${txtPath}`);

  // ── Mark batches as reconciled ──
  await db.execute(sql`
    UPDATE migration_batches SET status = 'RECONCILED', completed_at = NOW()
    WHERE status = 'PROMOTED'
  `);

  return report;
}
