import assert from "node:assert/strict";
import test from "node:test";

import type { CreateProductInput } from "@apex/types";

import {
  buildCreateInventoryInsertValues,
  buildCreateProductInsertValues,
  buildCreateVariantProductInsertValues,
  buildParentPlaceholderSku,
  buildVehicleCompatibilityInsertValues,
  resolveCreateMainInventoryStockLevel,
} from "./create-helpers";

const baseProductInput: CreateProductInput = {
  name: "Premium Brake Pad",
  sku: "BRK-001",
  category: "HARD_PARTS",
  unitPrice: "25.00",
  costPrice: "10.00",
  oemNumber: "OEM-1",
  familyId: "11111111-1111-4111-8111-111111111111",
  categoryId: "22222222-2222-4222-8222-222222222222",
  subcategoryId: "33333333-3333-4333-8333-333333333333",
  brandId: "44444444-4444-4444-8444-444444444444",
  isParent: false,
  description: "Ceramic pad set",
  unitsPerCase: 2,
  packagingUnit: "box",
  sellingUnit: "piece",
  purchaseUnit: "case",
  conversionFactor: 2,
  primarySupplierId: "55555555-5555-4555-8555-555555555555",
  isSerialized: true,
  trackInventory: true,
  specialOrder: true,
  discontinued: false,
  reorderPoint: 5,
  optimalStock: 10,
  leadTimeDays: 7,
  initialStock: 4,
};

test("buildParentPlaceholderSku preserves timestamp-based parent SKU shape", () => {
  assert.equal(buildParentPlaceholderSku(0), "P-0");
  assert.equal(buildParentPlaceholderSku(1234567890), "P-KF12OI");
});

test("buildCreateProductInsertValues preserves regular product insert defaults", () => {
  assert.deepEqual(
    buildCreateProductInsertValues({
      data: baseProductInput,
      orgId: "org-1",
      sku: "BRK-001",
      mnemonicSku: "ABCDEFGHIJ",
      hasVariants: false,
      barcode: "4801234567890",
    }),
    {
      orgId: "org-1",
      name: "Premium Brake Pad",
      sku: "BRK-001",
      mnemonicSku: "ABCDEFGHIJ",
      category: "HARD_PARTS",
      unitPrice: "25.00",
      costPrice: "10.00",
      barcode: "4801234567890",
      oemNumber: "OEM-1",
      isParent: false,
      parentProductId: null,
      familyId: "11111111-1111-4111-8111-111111111111",
      categoryId: "22222222-2222-4222-8222-222222222222",
      subcategoryId: "33333333-3333-4333-8333-333333333333",
      brandId: "44444444-4444-4444-8444-444444444444",
      description: "Ceramic pad set",
      unitsPerCase: 2,
      packagingUnit: "box",
      sellingUnit: "piece",
      purchaseUnit: "case",
      conversionFactor: "2",
      primarySupplierId: "55555555-5555-4555-8555-555555555555",
      isSerialized: true,
      specialOrder: true,
    },
  );
});

test("buildCreateProductInsertValues preserves variant parent policy", () => {
  assert.deepEqual(
    buildCreateProductInsertValues({
      data: {
        ...baseProductInput,
        sku: "",
        unitPrice: "99.99",
        costPrice: "88.88",
        barcode: "ignored-for-parent",
      },
      orgId: "org-1",
      sku: "P-ABC123",
      mnemonicSku: "ABCDEFGHIJ",
      hasVariants: true,
      barcode: "4801234567890",
    }),
    {
      orgId: "org-1",
      name: "Premium Brake Pad",
      sku: "P-ABC123",
      mnemonicSku: "ABCDEFGHIJ",
      category: "HARD_PARTS",
      unitPrice: "0.00",
      costPrice: "0.00",
      barcode: null,
      oemNumber: "OEM-1",
      isParent: true,
      parentProductId: null,
      familyId: "11111111-1111-4111-8111-111111111111",
      categoryId: "22222222-2222-4222-8222-222222222222",
      subcategoryId: "33333333-3333-4333-8333-333333333333",
      brandId: "44444444-4444-4444-8444-444444444444",
      description: "Ceramic pad set",
      unitsPerCase: 2,
      packagingUnit: "box",
      sellingUnit: "piece",
      purchaseUnit: "case",
      conversionFactor: "2",
      primarySupplierId: "55555555-5555-4555-8555-555555555555",
      isSerialized: true,
      specialOrder: true,
    },
  );
});

test("buildCreateVariantProductInsertValues preserves child insert inheritance", () => {
  assert.deepEqual(
    buildCreateVariantProductInsertValues({
      data: baseProductInput,
      orgId: "org-1",
      parentProductId: "parent-1",
      variant: {
        suffix: "Left",
        sku: "BRK-L",
        unitPrice: "12.00",
        costPrice: "6.00",
      },
      name: "Premium Brake Pad - Left",
      mnemonicSku: "KLMNOPQRST",
      barcode: "4801234567891",
    }),
    {
      orgId: "org-1",
      name: "Premium Brake Pad - Left",
      sku: "BRK-L",
      mnemonicSku: "KLMNOPQRST",
      category: "HARD_PARTS",
      unitPrice: "12.00",
      costPrice: "6.00",
      barcode: "4801234567891",
      oemNumber: "OEM-1",
      isParent: false,
      parentProductId: "parent-1",
      familyId: "11111111-1111-4111-8111-111111111111",
      categoryId: "22222222-2222-4222-8222-222222222222",
      subcategoryId: "33333333-3333-4333-8333-333333333333",
      brandId: "44444444-4444-4444-8444-444444444444",
    },
  );
});

test("inventory and vehicle insert helpers preserve create route row shapes", () => {
  assert.deepEqual(
    buildCreateInventoryInsertValues({
      orgId: "org-1",
      productId: "product-1",
      locationId: "loc-1",
      stockLevel: 4,
      reorderPoint: 5,
      optimalStock: 10,
      leadTimeDays: 7,
    }),
    {
      orgId: "org-1",
      productId: "product-1",
      locationId: "loc-1",
      stockLevel: 4,
      reorderPoint: 5,
      optimalStock: 10,
      leadTimeDays: 7,
    },
  );

  assert.equal(resolveCreateMainInventoryStockLevel("loc-1", "loc-1", 4), 4);
  assert.equal(resolveCreateMainInventoryStockLevel("loc-2", "loc-1", 4), 0);
  assert.equal(resolveCreateMainInventoryStockLevel("loc-1", "loc-1", undefined), 0);

  assert.deepEqual(
    buildVehicleCompatibilityInsertValues("product-1", [
      {
        make: "Toyota",
        model: "Vios",
        yearStart: 2018,
        yearEnd: 2024,
        engine: "",
        notes: "front axle",
      },
      {
        make: "Honda",
        model: "City",
        yearStart: 2020,
        yearEnd: 2024,
      },
    ]),
    [
      {
        productId: "product-1",
        make: "Toyota",
        model: "Vios",
        yearStart: 2018,
        yearEnd: 2024,
        engine: null,
        notes: "front axle",
      },
      {
        productId: "product-1",
        make: "Honda",
        model: "City",
        yearStart: 2020,
        yearEnd: 2024,
        engine: null,
        notes: null,
      },
    ],
  );
});
