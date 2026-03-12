-- Migration 0019: Add updated_at trigger to all tables
-- Ensures updated_at is automatically set on UPDATE, even for raw SQL queries

CREATE OR REPLACE FUNCTION apex_update_timestamp()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at columns
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_product_families_updated_at
  BEFORE UPDATE ON product_families FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON suppliers FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_stock_transfers_updated_at
  BEFORE UPDATE ON stock_transfers FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON sales FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_sale_lines_updated_at
  BEFORE UPDATE ON sale_lines FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON categories FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON shifts FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_customer_vehicles_updated_at
  BEFORE UPDATE ON customer_vehicles FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_job_cards_updated_at
  BEFORE UPDATE ON job_cards FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();

CREATE TRIGGER trg_inventory_counts_updated_at
  BEFORE UPDATE ON inventory_counts FOR EACH ROW EXECUTE FUNCTION apex_update_timestamp();
