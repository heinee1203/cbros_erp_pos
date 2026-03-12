-- Add receipt_number column to sales table for physical receipt tracking
ALTER TABLE "sales" ADD COLUMN "receipt_number" varchar(50);

-- Index for searching by receipt number
CREATE INDEX "idx_sales_receipt_number" ON "sales" ("receipt_number");
