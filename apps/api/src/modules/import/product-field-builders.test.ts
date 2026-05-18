import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImportProductInsert,
  buildImportProductUpdateFields,
  buildInventorySyncPriceFields,
  buildUpdateOnlyProductFields,
  buildParentImportSku,
  buildParentProductInsert,
  type ImportProductFieldRow,
} from "./product-field-builders";

const row: ImportProductFieldRow = {
  name: "Brake Pad",
  sku: "BP-1",
  unitPrice: "500.00",
  costPrice: "300.00",
  isVariablePrice: false,
  barcode: "123",
  description: "Front pads",
  sellingUnit: "each",
  trackSerial: true,
  trackDot: false,
  specialOrder: true,
  active: true,
  oemNumber: "OEM-1",
};

test("buildInventorySyncPriceFields only includes non-zero prices and variable flag", () => {
  assert.deepEqual(buildInventorySyncPriceFields(row), {
    unitPrice: "500.00",
    costPrice: "300.00",
  });
  assert.deepEqual(
    buildInventorySyncPriceFields({
      ...row,
      unitPrice: "0.00",
      costPrice: "0.00",
      isVariablePrice: true,
    }),
    { isVariablePrice: true },
  );
});

test("buildImportProductInsert preserves create payload field policy", () => {
  assert.deepEqual(
    buildImportProductInsert({
      orgId: "org_1",
      row,
      mnemonicSku: "BRAKABCDEF",
      barcode: "123",
      parentProductId: "parent_1",
      categoryId: "cat_1",
      subcategoryId: "sub_1",
      brandId: "brand_1",
      mode: "smart_sync",
    }),
    {
      orgId: "org_1",
      name: "Brake Pad",
      sku: "BP-1",
      mnemonicSku: "BRAKABCDEF",
      unitPrice: "500.00",
      costPrice: "300.00",
      isVariablePrice: false,
      barcode: "123",
      category: "HARD_PARTS",
      categoryId: "cat_1",
      subcategoryId: "sub_1",
      brandId: "brand_1",
      description: "Front pads",
      parentProductId: "parent_1",
      isParent: false,
      sellingUnit: "each",
      isSerialized: true,
      isTire: false,
      specialOrder: true,
      isActive: true,
      discontinued: false,
      oemNumber: "OEM-1",
    },
  );
});

test("buildImportProductInsert blocks taxonomy fields during inventory sync", () => {
  const values = buildImportProductInsert({
    orgId: "org_1",
    row: { ...row, description: "", sellingUnit: "", active: false },
    mnemonicSku: "BRAKABCDEF",
    barcode: "123",
    parentProductId: null,
    categoryId: "cat_1",
    subcategoryId: "sub_1",
    brandId: "brand_1",
    mode: "inventory_sync",
  });

  assert.equal(values.categoryId, null);
  assert.equal(values.subcategoryId, null);
  assert.equal(values.brandId, null);
  assert.equal(values.description, null);
  assert.equal(values.isActive, false);
  assert.equal(values.discontinued, true);
  assert.equal("sellingUnit" in values, false);
});

test("buildImportProductUpdateFields blocks identity fields and taxonomy on update", () => {
  assert.deepEqual(buildImportProductUpdateFields(row, "smart_sync"), {
    unitPrice: "500.00",
    costPrice: "300.00",
    barcode: "123",
    oemNumber: "OEM-1",
    sellingUnit: "each",
    isSerialized: true,
    isTire: false,
    specialOrder: true,
    isActive: true,
    discontinued: false,
  });
});

test("buildImportProductUpdateFields limits inventory sync to price fields", () => {
  assert.deepEqual(buildImportProductUpdateFields(row, "inventory_sync"), {
    unitPrice: "500.00",
    costPrice: "300.00",
  });
});

test("buildUpdateOnlyProductFields limits updates to selling price and barcode", () => {
  assert.deepEqual(buildUpdateOnlyProductFields(row), {
    unitPrice: "500.00",
    barcode: "123",
  });
  assert.deepEqual(
    buildImportProductUpdateFields(
      {
        ...row,
        unitPrice: "0.00",
        barcode: "",
      },
      "update_only",
    ),
    {},
  );
});

test("buildParentImportSku keeps parent SKU shape", () => {
  assert.match(buildParentImportSku(() => 1710000000000, () => 0.123456), /^P-[0-9A-Z]+-[0-9A-Z]{3}$/);
});

test("buildParentProductInsert preserves parent product defaults", () => {
  assert.deepEqual(
    buildParentProductInsert({
      orgId: "org_1",
      parentName: "Brake Pad",
      parentSku: "P-ABC-123",
      parentMnemonic: "BRAKABCDEF",
      parentCategoryId: "cat_1",
      parentBrandId: "brand_1",
    }),
    {
      orgId: "org_1",
      name: "Brake Pad",
      sku: "P-ABC-123",
      mnemonicSku: "BRAKABCDEF",
      category: "HARD_PARTS",
      unitPrice: "0.00",
      costPrice: "0.00",
      isParent: true,
      categoryId: "cat_1",
      brandId: "brand_1",
    },
  );
});
