import postgres from "postgres";
import * as dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(import.meta.dirname, "../../.env") });

const sql = postgres(process.env.DATABASE_URL!);

const steps = [
  { name: "Create sale_status enum", sql: `CREATE TYPE sale_status AS ENUM ('QUOTE', 'OPEN', 'PARKED', 'COMPLETED', 'VOIDED', 'REFUNDED')` },
  { name: "Create customers table", sql: `CREATE TABLE customers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, name VARCHAR(255) NOT NULL, phone VARCHAR(50) NOT NULL, notes VARCHAR(1000), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
  { name: "Create idx_customers_org_phone", sql: `CREATE UNIQUE INDEX idx_customers_org_phone ON customers(org_id, phone)` },
  { name: "Create idx_customers_org_id", sql: `CREATE INDEX idx_customers_org_id ON customers(org_id)` },
  { name: "Create idx_customers_name", sql: `CREATE INDEX idx_customers_name ON customers(name)` },
  { name: "Create customer_vehicles table", sql: `CREATE TABLE customer_vehicles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE, make VARCHAR(100) NOT NULL, model VARCHAR(100) NOT NULL, year INTEGER, plate_no VARCHAR(20), notes VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
  { name: "Create idx_customer_vehicles_customer_id", sql: `CREATE INDEX idx_customer_vehicles_customer_id ON customer_vehicles(customer_id)` },
  { name: "Create idx_customer_vehicles_org_id", sql: `CREATE INDEX idx_customer_vehicles_org_id ON customer_vehicles(org_id)` },
  { name: "Create sales table", sql: `CREATE TABLE sales (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, sale_no VARCHAR(50) NOT NULL, location_id UUID NOT NULL REFERENCES locations(id), status sale_status NOT NULL DEFAULT 'OPEN', customer_id UUID REFERENCES customers(id) ON DELETE SET NULL, customer_vehicle_id UUID REFERENCES customer_vehicles(id) ON DELETE SET NULL, subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00, discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00, tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00, grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00, notes VARCHAR(1000), created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL, completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, voided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, refunded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL, completed_at TIMESTAMPTZ, voided_at TIMESTAMPTZ, refunded_at TIMESTAMPTZ, idempotency_key VARCHAR(255), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())` },
  { name: "Create idx_sales_org_id", sql: `CREATE INDEX idx_sales_org_id ON sales(org_id)` },
  { name: "Create idx_sales_status", sql: `CREATE INDEX idx_sales_status ON sales(status)` },
  { name: "Create idx_sales_location_id", sql: `CREATE INDEX idx_sales_location_id ON sales(location_id)` },
  { name: "Create idx_sales_customer_id", sql: `CREATE INDEX idx_sales_customer_id ON sales(customer_id)` },
  { name: "Create idx_sales_org_sale_no", sql: `CREATE UNIQUE INDEX idx_sales_org_sale_no ON sales(org_id, sale_no)` },
  { name: "Create idx_sales_idempotency_key", sql: `CREATE UNIQUE INDEX idx_sales_idempotency_key ON sales(idempotency_key)` },
  { name: "Create sale_lines table", sql: `CREATE TABLE sale_lines (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE, org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE, product_id UUID NOT NULL REFERENCES products(id), location_id UUID NOT NULL REFERENCES locations(id), quantity INTEGER NOT NULL, unit_price NUMERIC(12, 2) NOT NULL, override_price NUMERIC(12, 2), discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00, line_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00, notes VARCHAR(500), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CONSTRAINT chk_sale_line_qty_positive CHECK (quantity > 0))` },
  { name: "Create idx_sale_lines_sale_id", sql: `CREATE INDEX idx_sale_lines_sale_id ON sale_lines(sale_id)` },
];

async function main() {
  console.log("Running Phase 5 migration (POS/Sales)...\n");
  let passed = 0;
  for (const step of steps) {
    try {
      await sql.unsafe(step.sql);
      console.log(`  ✓ ${step.name}`);
      passed++;
    } catch (err: any) {
      if (err.message?.includes("already exists")) {
        console.log(`  ⊘ ${step.name} (already exists)`);
        passed++;
      } else {
        console.error(`  ✗ ${step.name}: ${err.message}`);
      }
    }
  }
  console.log(`\nMigration complete: ${passed}/${steps.length} steps passed.`);
  await sql.end();
}

main();
