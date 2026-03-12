-- Phase 5: POS / Sales Sync Migration
-- Creates: sale_status enum, customers, customer_vehicles, sales, sale_lines

-- 1. Create sale_status enum
CREATE TYPE sale_status AS ENUM ('QUOTE', 'OPEN', 'PARKED', 'COMPLETED', 'VOIDED', 'REFUNDED');

-- 2. Create customers table
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  notes VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_customers_org_phone ON customers(org_id, phone);
CREATE INDEX idx_customers_org_id ON customers(org_id);
CREATE INDEX idx_customers_name ON customers(name);

-- 3. Create customer_vehicles table
CREATE TABLE customer_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  make VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  year INTEGER,
  plate_no VARCHAR(20),
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customer_vehicles_customer_id ON customer_vehicles(customer_id);
CREATE INDEX idx_customer_vehicles_org_id ON customer_vehicles(org_id);

-- 4. Create sales table
CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sale_no VARCHAR(50) NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id),
  status sale_status NOT NULL DEFAULT 'OPEN',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_vehicle_id UUID REFERENCES customer_vehicles(id) ON DELETE SET NULL,
  subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  discount_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  tax_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  grand_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(1000),
  created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  completed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  voided_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  refunded_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  idempotency_key VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_org_id ON sales(org_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_location_id ON sales(location_id);
CREATE INDEX idx_sales_customer_id ON sales(customer_id);
CREATE UNIQUE INDEX idx_sales_org_sale_no ON sales(org_id, sale_no);
CREATE UNIQUE INDEX idx_sales_idempotency_key ON sales(idempotency_key);

-- 5. Create sale_lines table
CREATE TABLE sale_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL,
  override_price NUMERIC(12, 2),
  discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  line_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  notes VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sale_line_qty_positive CHECK (quantity > 0)
);

CREATE INDEX idx_sale_lines_sale_id ON sale_lines(sale_id);
