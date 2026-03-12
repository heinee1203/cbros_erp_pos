-- Add new payment method enum values for Philippine digital payments
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'CREDIT_CARD';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'DEBIT_CARD';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'QRPH';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'GCASH';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'MAYA';
ALTER TYPE "payment_method" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';
