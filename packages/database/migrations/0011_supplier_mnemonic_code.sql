-- Add two-letter mnemonic code to suppliers
-- Used on employee-facing barcode labels to identify supplier at a glance

ALTER TABLE suppliers ADD COLUMN mnemonic_code VARCHAR(2);
