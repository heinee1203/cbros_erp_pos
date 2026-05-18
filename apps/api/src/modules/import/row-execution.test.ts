import assert from "node:assert/strict";
import test from "node:test";

import type { DbOrTx } from "@apex/database";
import {
  executeImportRowWrite,
  resolveVariantParentProductId,
  shouldUseInventorySyncFastPath,
} from "./row-execution";
import type { ParsedRow } from "./types";

function row(overrides: Partial<ParsedRow>): ParsedRow {
  return {
    rowIndex: 1,
    name: "Brake Pad",
    sku: "BP-1",
    barcode: "",
    costPrice: "300.00",
    unitPrice: "500.00",
    isVariablePrice: false,
    categoryName: "",
    brandName: "",
    description: "",
    handle: "",
    option1Name: "",
    option1Value: "",
    option2Name: "",
    option2Value: "",
    option3Name: "",
    option3Value: "",
    resolvedName: "Brake Pad",
    isVariant: false,
    parentName: "",
    active: null,
    sellingUnit: "",
    trackSerial: null,
    trackDot: null,
    specialOrder: null,
    oemNumber: "",
    supplierName: "",
    locations: [],
    action: "CREATE",
    existingProductId: null,
    changes: [],
    errors: [],
    ...overrides,
  };
}

function fakeTx() {
  const calls: Array<{ op: string; payload?: unknown }> = [];
  const tx = {
    update: () => ({
      set: (payload: unknown) => {
        calls.push({ op: "update", payload });
        return {
          where: () => {
            calls.push({ op: "where" });
            return Promise.resolve();
          },
        };
      },
    }),
    insert: () => ({
      values: (payload: unknown) => {
        calls.push({ op: "insert", payload });
        return {
          returning: () => {
            calls.push({ op: "returning" });
            return Promise.resolve([{ id: "prod_1" }]);
          },
        };
      },
    }),
  } as unknown as DbOrTx;

  return { tx, calls };
}

test("shouldUseInventorySyncFastPath preserves the existing fast-path guard", () => {
  assert.equal(
    shouldUseInventorySyncFastPath(row({ action: "UPDATE", existingProductId: "prod_1" }), "inventory_sync"),
    true,
  );
  assert.equal(
    shouldUseInventorySyncFastPath(row({ action: "UPDATE", existingProductId: null }), "inventory_sync"),
    false,
  );
  assert.equal(
    shouldUseInventorySyncFastPath(row({ action: "CREATE", existingProductId: null }), "inventory_sync"),
    false,
  );
  assert.equal(
    shouldUseInventorySyncFastPath(row({ action: "UPDATE", existingProductId: "prod_1" }), "smart_sync"),
    false,
  );
});

test("resolveVariantParentProductId looks up parents only for variant rows with handles", () => {
  const parents = new Map([["brake-pad", "parent_1"]]);

  assert.equal(resolveVariantParentProductId(row({ isVariant: true, handle: "brake-pad" }), parents), "parent_1");
  assert.equal(resolveVariantParentProductId(row({ isVariant: true, handle: "missing" }), parents), null);
  assert.equal(resolveVariantParentProductId(row({ isVariant: false, handle: "brake-pad" }), parents), null);
});

test("executeImportRowWrite skips mode-mismatched rows after safe empty taxonomy resolution", async () => {
  const { tx, calls } = fakeTx();

  const result = await executeImportRowWrite({
    tx,
    orgId: "org_1",
    row: row({ action: "CREATE", categoryName: "", brandName: "" }),
    mode: "update_only",
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-1",
    generateBarcode: () => "1234567890123",
  });

  assert.equal(result, "skipped");
  assert.deepEqual(calls, []);
});

test("executeImportRowWrite creates products with generated mnemonic and barcode", async () => {
  const { tx, calls } = fakeTx();

  const result = await executeImportRowWrite({
    tx,
    orgId: "org_1",
    row: row({ action: "CREATE", sku: "BP-C", barcode: "" }),
    mode: "smart_sync",
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-C",
    generateBarcode: () => "1234567890123",
  });

  assert.equal(result, "created");
  const insert = calls.find((call) => call.op === "insert");
  assert.equal((insert?.payload as { sku: string }).sku, "BP-C");
  assert.equal((insert?.payload as { mnemonicSku: string }).mnemonicSku, "MN-BP-C");
  assert.equal((insert?.payload as { barcode: string }).barcode, "1234567890123");
});

test("executeImportRowWrite uses the inventory sync fast path before taxonomy work", async () => {
  const { tx, calls } = fakeTx();

  const result = await executeImportRowWrite({
    tx,
    orgId: "org_1",
    row: row({
      action: "UPDATE",
      existingProductId: "prod_1",
      categoryName: "Should Not Resolve",
      brandName: "Should Not Resolve",
    }),
    mode: "inventory_sync",
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map(),
    generateMnemonicSku: async () => "MN-BP-1",
    generateBarcode: () => "1234567890123",
  });

  assert.equal(result, "updated");
  assert.deepEqual(calls.map((call) => call.op), ["update", "where"]);
  assert.deepEqual(calls[0].payload, { unitPrice: "500.00", costPrice: "300.00" });
});

test("executeImportRowWrite limits update-only product writes", async () => {
  const { tx, calls } = fakeTx();

  const result = await executeImportRowWrite({
    tx,
    orgId: "org_1",
    row: row({
      action: "UPDATE",
      existingProductId: "prod_1",
      barcode: "BAR-2",
      categoryName: "Should Not Resolve",
      brandName: "Should Not Resolve",
      sellingUnit: "box",
      trackSerial: true,
      trackDot: true,
      specialOrder: true,
      active: false,
      oemNumber: "OEM-2",
      isVariant: true,
      handle: "brake-pad",
      option1Name: "Position",
      option1Value: "Front",
    }),
    mode: "update_only",
    categoryCache: new Map(),
    brandCache: new Map(),
    parentProductMap: new Map([["brake-pad", "parent_1"]]),
    generateMnemonicSku: async () => "MN-BP-1",
    generateBarcode: () => "1234567890123",
  });

  assert.equal(result, "updated");
  assert.deepEqual(calls.map((call) => call.op), ["update", "where"]);
  assert.deepEqual(calls[0].payload, { unitPrice: "500.00", barcode: "BAR-2" });
});
